import { describe, expect, it } from "vitest";
import { AvatarHost, type Adapter, type EntryLike, StageLoop, bodyError, droppedFiles, filesFromEntries, kindOf, sourceFromFiles, sourceFromUrl } from "../src/index.js";

interface Src {
  kind: string;
  id: string;
  release?(): void;
}

const deferred = <T>() => {
  let ok!: (v: T) => void;
  let fail!: (e: unknown) => void;
  const p = new Promise<T>((a, b) => ((ok = a), (fail = b)));
  return { p, ok, fail };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

function counting(id: string) {
  let released = 0;
  return { src: { kind: "a", id, release: () => released++ } as Src, released: () => released };
}

describe("AvatarHost", () => {
  it("resolves null for a superseded show and never shows its result", async () => {
    const gates = new Map<string, ReturnType<typeof deferred<string>>>();
    const discarded: string[] = [];
    const adapter: Adapter<Src, string, null> = {
      create: async () => null,
      load: (_r, s) => {
        const d = deferred<string>();
        gates.set(s.id, d);
        return d.p;
      },
    };
    const host = new AvatarHost<Src, string>({ adapters: { a: adapter }, discard: (r) => discarded.push(r) });
    const first = counting("1");
    const second = counting("2");
    const p1 = host.show(first.src);
    await tick();
    const p2 = host.show(second.src);
    await tick();
    gates.get("2")!.ok("body 2");
    expect(await p2).toBe("body 2");
    gates.get("1")!.ok("body 1");
    expect(await p1).toBeNull();
    expect(host.current).toBe("body 2");
    expect(discarded).toEqual(["body 1"]);
    expect(first.released()).toBe(1);
    expect(second.released()).toBe(1);
  });

  it("forgets a failed create and tries again on the next show", async () => {
    let creates = 0;
    const adapter: Adapter<Src, string, number> = {
      create: async () => {
        creates++;
        if (creates === 1) throw new Error("no runtime");
        return creates;
      },
      load: async (r, s) => `${s.id} on ${r}`,
    };
    const host = new AvatarHost<Src, string>({ adapters: { a: adapter } });
    await expect(host.show({ kind: "a", id: "x" })).rejects.toThrow("no runtime");
    await tick();
    expect(await host.show({ kind: "a", id: "y" })).toBe("y on 2");
    expect(await host.show({ kind: "a", id: "z" })).toBe("z on 2");
    expect(creates).toBe(2);
  });

  it("destroys the other runtime when exclusive and keeps it otherwise", async () => {
    const destroyed: string[] = [];
    const make = (key: string): Adapter<Src, string, string> => ({ key, create: async () => key, load: async (r) => r, destroy: (r) => destroyed.push(r) });
    const host = new AvatarHost<Src, string>({ adapters: { a: make("ra"), b: make("rb") }, exclusive: true });
    await host.show({ kind: "a", id: "1" });
    await host.show({ kind: "b", id: "2" });
    await tick();
    expect(destroyed).toEqual(["ra"]);
    expect(host.runtimes).toEqual(["rb"]);
    const shared = new AvatarHost<Src, string>({ adapters: { a: make("ra"), b: make("rb") } });
    await shared.show({ kind: "a", id: "1" });
    await shared.show({ kind: "b", id: "2" });
    expect(shared.runtimes.sort()).toEqual(["ra", "rb"]);
    shared.destroy();
    await tick();
    expect(destroyed.sort()).toEqual(["ra", "ra", "rb"]);
  });

  it("releases once whether the load wins, loses or throws", async () => {
    const adapter: Adapter<Src, string, null> = {
      create: async () => null,
      load: async (_r, s) => {
        if (s.id === "bad") throw new Error("broken file");
        await tick();
        return s.id;
      },
    };
    const host = new AvatarHost<Src, string>({ adapters: { a: adapter } });
    const bad = counting("bad");
    bad.src.id = "bad";
    await expect(host.show(bad.src)).rejects.toThrow("broken file");
    const lose = counting("lose");
    const win = counting("win");
    const pl = host.show(lose.src);
    const pw = host.show(win.src);
    expect(await pl).toBeNull();
    expect(await pw).toBe("win");
    expect([bad.released(), lose.released(), win.released()]).toEqual([1, 1, 1]);
  });

  it("names a kind with no adapter", async () => {
    const host = new AvatarHost<Src, string>({ adapters: {} });
    await expect(host.show({ kind: "pmx", id: "1" })).rejects.toThrow("no adapter for pmx files.");
  });
});

describe("sources", () => {
  const urls = () => {
    const made: string[] = [];
    const revoked: string[] = [];
    let n = 0;
    return { made, revoked, f: { create: () => (made.push(`blob:${++n}`), `blob:${n}`), revoke: (u: string) => revoked.push(u) } };
  };
  const file = (path: string) => {
    const f = new File(["x"], path.split("/").pop()!, { type: path.endsWith(".png") ? "image/png" : "" });
    Object.defineProperty(f, "webkitRelativePath", { value: path });
    return f;
  };

  it("finds a texture by relative path, then by file name in another case, and reports a miss", () => {
    const u = urls();
    const files = [file("pack/model/body.fbx"), file("pack/model/tex/Skin.png"), file("pack/other/Face.PNG"), file("pack/model/face.png")];
    const src = sourceFromFiles(files, u.f);
    expect(src.kind).toBe("fbx");
    expect(src.name).toBe("body.fbx");
    const skin = src.resolve!("tex/skin.png");
    expect(skin).toBe("blob:1");
    expect(src.resolve!("./TEX/SKIN.PNG")).toBe("blob:1");
    // the path below the model folder wins over the same name elsewhere
    expect(src.resolve!("face.png")).toBe("blob:2");
    // by name anywhere in the drop, ignoring case and a windows path
    expect(src.resolve!("C:\\Users\\art\\Desktop\\skin.PNG")).toBe("blob:1");
    expect(src.resolve!("hair.png")).toBeNull();
    expect(src.misses).toEqual(["hair.png"]);
    src.release!();
    src.release!();
    expect(u.revoked.sort()).toEqual(["blob:1", "blob:2"]);
    expect(src.resolve!("tex/skin.png")).toBeNull();
  });

  it("picks vrm over glb and names the failure for a drop with no body", () => {
    expect(sourceFromFiles([file("a.glb"), file("b.vrm")], urls().f).kind).toBe("vrm");
    expect(() => sourceFromFiles([file("m.pmx")], urls().f)).toThrow("this file is a pmx. open it with the mmd loader of the avatar package.");
    expect(() => sourceFromFiles([file("walk.bvh")], urls().f)).toThrow("a bvh file is an animation");
    expect(() => sourceFromFiles([file("notes.txt")], urls().f)).toThrow("this drop has no model");
  });

  it("reads kinds from names and urls", () => {
    expect(kindOf("A.VRM")).toBe("vrm");
    expect(kindOf("x.fbx?v=2")).toBe("fbx");
    expect(kindOf("x.obj")).toBeNull();
    expect(sourceFromUrl("https://h/m/My%20Body.glb")).toMatchObject({ kind: "glb", name: "My Body.glb" });
  });

  it("keeps relative paths from a nested folder", async () => {
    const leaf = (path: string): EntryLike => ({ isFile: true, isDirectory: false, fullPath: `/${path}`, file: (ok) => ok(new File(["x"], path.split("/").pop()!)) });
    const dir = (path: string, kids: EntryLike[]): EntryLike => {
      let served = false;
      return {
        isFile: false,
        isDirectory: true,
        fullPath: `/${path}`,
        // two batches: the walk must read until an empty one
        createReader: () => ({
          readEntries: (ok) => {
            if (served) return ok([]);
            served = true;
            ok(kids);
          },
        }),
      };
    };
    const tree = dir("pack", [leaf("pack/body.fbx"), dir("pack/tex", [leaf("pack/tex/skin.png")])]);
    const files = await filesFromEntries([tree]);
    expect(files.map((f) => (f as File & { webkitRelativePath: string }).webkitRelativePath)).toEqual(["pack/body.fbx", "pack/tex/skin.png"]);
    const flat = [new File(["x"], "a.vrm")];
    expect(await droppedFiles({ items: [{ webkitGetAsEntry: () => leaf("a.vrm") }], files: flat })).toEqual(flat);
    const viaDrop = await droppedFiles({ items: [{ webkitGetAsEntry: () => dir("pack", [leaf("pack/body.fbx")]) }], files: [] });
    expect(viaDrop.map((f) => f.name)).toEqual(["body.fbx"]);
  });
});

describe("StageLoop", () => {
  function rig(busy = () => false) {
    let cb: ((t: number) => void) | null = null;
    const dts: number[] = [];
    const states: boolean[] = [];
    const loop = new StageLoop({ driver: { setAnimationLoop: (f) => (cb = f) }, frame: (dt) => dts.push(dt), busy, onState: (r) => states.push(r) });
    const run = (from: number, n: number, step = 1000 / 60) => {
      for (let i = 0; i < n; i++) cb?.(from + i * step);
    };
    return { loop, dts, states, run, running: () => cb !== null };
  }

  it("draws no frame while the page is hidden and runs again on return", () => {
    const r = rig();
    r.loop.invalidate();
    r.loop.hold("hidden", true);
    expect(r.running()).toBe(false);
    r.run(0, 60);
    expect(r.dts.length).toBe(0);
    r.loop.hold("hidden", false);
    expect(r.running()).toBe(true);
    r.run(5000, 3);
    expect(r.dts.length).toBe(3);
  });

  it("starts with one fixed step after a pause, then follows the clock", () => {
    const r = rig();
    r.loop.invalidate();
    r.run(1000, 2, 20);
    r.loop.pause();
    r.loop.resume();
    r.run(90_000, 2, 30);
    expect(r.dts[0]).toBeCloseTo(1 / 60, 9);
    expect(r.dts[1]).toBeCloseTo(0.02, 9);
    // 89 s passed while paused; the first frame back is one fixed step
    expect(r.dts[2]).toBeCloseTo(1 / 60, 9);
    expect(r.dts[3]).toBeCloseTo(0.03, 9);
    expect(r.loop.time).toBeCloseTo(2 / 60 + 0.05, 9);
  });

  it("holds while any reason holds", () => {
    const r = rig();
    r.loop.invalidate();
    r.loop.hold("offscreen", true);
    r.loop.hold("covered", true);
    r.loop.hold("offscreen", false);
    expect(r.running()).toBe(false);
    expect(r.loop.why).toEqual(["covered"]);
    r.loop.hold("covered", false);
    expect(r.running()).toBe(true);
  });

  it("draws on change only under reduced motion, and keeps going while busy", () => {
    let busy = false;
    const r = rig(() => busy);
    r.loop.reducedMotion = true;
    r.run(0, 5);
    expect(r.dts.length).toBe(1);
    expect(r.running()).toBe(false);
    r.loop.invalidate();
    r.run(100, 5);
    expect(r.dts.length).toBe(2);
    busy = true;
    r.loop.sync();
    r.run(200, 5);
    expect(r.dts.length).toBe(7);
    busy = false;
    r.run(300, 5);
    expect(r.dts.length).toBe(8);
  });

  it("stops for good on dispose", () => {
    const r = rig();
    r.loop.invalidate();
    r.loop.dispose();
    r.loop.resume();
    r.loop.invalidate();
    expect(r.running()).toBe(false);
  });
});

describe("bodyError", () => {
  it("turns raw failures into copy that names them", () => {
    expect(bodyError(new Error("avatar: missing required bones: hips, head."))).toBe("this model has no humanoid rig the stage can map. missing bones: hips, head.");
    expect(bodyError(new Error("avatar: fetch failed with 404 for x."))).toBe("the model did not download (http 404). check the url.");
    expect(bodyError(new TypeError("Failed to fetch"))).toMatch(/did not download/);
    expect(bodyError(new Error("this file is a pmx. open it with the mmd loader of the avatar package."))).toBe("this file is a pmx. open it with the mmd loader of the avatar package.");
    expect(bodyError(new Error("Unexpected token < in JSON at position 0"))).toMatch(/^the model did not load\./);
  });
});
