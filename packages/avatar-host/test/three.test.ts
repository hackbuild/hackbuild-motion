import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { referenceRest } from "@hackbuild/rig";
import { seededRng } from "@hackbuild/organic";
import type { Clip } from "@hackbuild/presence";
import { Body, FollowCamera, bodyAdapters, loadBody, placeholderBody, rigReady, trackingManager } from "../src/three.js";
import { AvatarHost, type BodySource } from "../src/index.js";
import { UAL, buildGlb, humanoidJoints } from "../../avatar/test/glb.js";

type V3 = [number, number, number];

describe("FollowCamera", () => {
  const setup = () => {
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
    const target = new THREE.Vector3();
    const f = new FollowCamera(cam, target);
    const box = new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.15), new THREE.Vector3(0.3, 1.7, 0.15));
    f.frame(box);
    return { cam, target, f, box };
  };

  it("frames the box from the front", () => {
    const { cam, target, f, box } = setup();
    expect(target.y).toBeCloseTo(0.85, 6);
    expect(cam.position.z).toBeGreaterThan(1);
    expect(f.distance()).toBeCloseTo(f.fitDistance(box), 1);
  });

  it("leaves the camera still under the dead zone", () => {
    const { cam, f, box } = setup();
    const before = cam.position.clone();
    // 6 percent of 1.7 m is 0.102 m; a 0.08 m sway moves nothing
    const moved = f.step(box.clone().translate(new THREE.Vector3(0.08, 0, 0)), 1 / 60);
    expect(moved).toBe(false);
    expect(cam.position.distanceTo(before)).toBe(0);
    expect(f.step(box.clone().translate(new THREE.Vector3(0.3, 0, 0)), 1 / 60)).toBe(true);
  });

  it("pulls back on the first frame a pose outgrows the view and comes closer only past the slack", () => {
    const { f, box } = setup();
    const d0 = f.distance();
    // arms up: the box grows 20 percent taller
    const tall = box.clone();
    tall.max.y *= 1.2;
    tall.min.y = 0;
    f.step(tall, 1 / 60);
    expect(f.distance()).toBeGreaterThan(d0);
    // back to the start: the fit wants d0, under 12 percent closer than now, so nothing moves
    const d1 = f.distance();
    f.step(box, 1 / 60);
    expect(f.distance()).toBe(d1);
    // a much smaller box is past the slack and the camera eases in
    const small = new THREE.Box3(new THREE.Vector3(-0.15, 0, -0.1), new THREE.Vector3(0.15, 0.9, 0.1));
    small.translate(new THREE.Vector3(0, 0.85 - 0.45, 0));
    f.step(small, 1 / 60);
    expect(f.distance()).toBeLessThan(d1);
  });

  it("leaves a hand zoom alone", () => {
    const { f, box } = setup();
    f.zoomBy(2);
    const d = f.distance();
    const tall = box.clone();
    tall.max.y *= 1.5;
    f.step(tall, 1 / 60);
    expect(f.zoomed).toBe(true);
    expect(f.distance()).toBeCloseTo(d, 6);
    f.frame(box);
    expect(f.zoomed).toBe(false);
  });

  it("counts a release as a zoom only when the distance changed by more than 2 percent", () => {
    const { f, box } = setup();
    f.released(box, f.distance() * 1.01);
    expect(f.zoomed).toBe(false);
    f.released(box, f.distance() * 1.1);
    expect(f.zoomed).toBe(true);
  });
});

describe("placeholder body", () => {
  it("stands in the normalized space with identity rest rotations", () => {
    const a = placeholderBody();
    const head = a.bones.head!.getWorldPosition(new THREE.Vector3());
    expect(head.y).toBeCloseTo(1.53, 2);
    const box = new THREE.Box3().setFromObject(a.root);
    expect(box.min.y).toBeGreaterThan(-0.05);
    expect(box.max.y).toBeGreaterThan(1.6);
    expect(box.max.y).toBeLessThan(1.8);
    // the left arm points to +X: the body faces +Z
    expect(a.bones.leftHand!.getWorldPosition(new THREE.Vector3()).x).toBeGreaterThan(0.6);
    for (const b of Object.values(a.bones)) expect(b!.quaternion.equals(new THREE.Quaternion())).toBe(true);
  });

  it("frees its geometry and materials on dispose", () => {
    const a = placeholderBody();
    const parent = new THREE.Group();
    parent.add(a.root);
    let freed = 0;
    a.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.addEventListener("dispose", () => freed++);
    });
    a.dispose();
    expect(freed).toBeGreaterThan(20);
    expect(a.root.parent).toBeNull();
  });
});

describe("Body frame order", () => {
  const wave = (body: Body): Clip => {
    const n = body.bones.length;
    const frames = 31;
    const rotations = new Float32Array(frames * n * 4);
    const arm = body.names.indexOf("rightUpperArm");
    const q = new THREE.Quaternion();
    for (let f = 0; f < frames; f++)
      for (let b = 0; b < n; b++) {
        q.identity();
        if (b === arm) q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (-Math.PI / 3) * Math.sin((f / 30) * Math.PI));
        q.toArray(rotations, (f * n + b) * 4);
      }
    return { name: "wave", fps: 30, frames, bones: n, loop: false, rotations };
  };

  it("plays a clip over the rest pose and hands back to rest", () => {
    const body = new Body(placeholderBody(), { rng: seededRng("t") });
    expect(body.caps.gaze).toBe(true);
    const arm = body.avatar.bones.rightUpperArm!;
    body.play(wave(body), { fade: 0.05 });
    for (let i = 0; i < 30; i++) body.update(1 / 60, null, false, i / 60);
    expect(arm.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.3);
    expect(body.moving()).toBe(true);
    for (let i = 0; i < 180; i++) body.update(1 / 60, null, false, 1 + i / 60);
    expect(body.moving()).toBe(false);
    expect(arm.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-3);
  });

  it("turns the head toward a target to its left and stops idle motion when still", () => {
    const body = new Body(placeholderBody(), { rng: seededRng("t"), levelHead: false });
    const head = body.avatar.bones.head!;
    const target = new THREE.Vector3(3, 1.5, 1);
    for (let i = 0; i < 120; i++) body.update(1 / 60, target, false, i / 60);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    expect(fwd.x).toBeGreaterThan(0.2);
    body.update(1 / 60, target, true, 2);
    expect(head.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
  });

  it("rejects a clip built over another bone order", () => {
    const body = new Body(placeholderBody(), { rng: seededRng("t") });
    expect(() => body.play({ name: "x", fps: 30, frames: 2, bones: 3, loop: true, rotations: new Float32Array(24) })).toThrow("this clip has 3 bones");
    expect(body.play("no such clip")).toBe(-1);
  });
});

describe("scene level loader", () => {
  const ref = () => referenceRest() as unknown as Record<string, V3>;

  it("loads a generated glb into the normalized space through the host", async () => {
    await rigReady();
    const bytes = buildGlb({ joints: humanoidJoints(ref(), UAL) });
    let released = 0;
    const src: BodySource = { kind: "glb", data: bytes, name: "test.glb", release: () => released++ };
    const host = new AvatarHost<BodySource, Awaited<ReturnType<typeof loadBody>>>({ adapters: bodyAdapters() });
    const avatar = await host.show(src);
    expect(avatar).not.toBeNull();
    expect(avatar!.format).toBe("glb");
    expect(Object.keys(avatar!.bones).length).toBeGreaterThan(15);
    expect(released).toBe(1);
    const body = new Body(avatar!, { rng: seededRng("t") });
    expect(body.bones.length).toBe(Object.keys(avatar!.bones).length);
    body.update(1 / 60, null, false, 0);
    body.dispose();
    expect(avatar!.root.parent).toBeNull();
  });

  it("names the missing bones of a model with no rig", async () => {
    const bytes = buildGlb({ joints: [{ name: "Root", parent: null, p: [0, 0, 0] }, { name: "Tip", parent: "Root", p: [0, 1, 0] }] });
    await expect(loadBody({ kind: "glb", data: bytes, name: "stick.glb" }, null)).rejects.toThrow(/missing required bones/);
  });

  it("waits for every item the manager started", async () => {
    const { manager, settled } = trackingManager((r) => (r === "a.png" ? "blob:a" : null));
    expect(manager.resolveURL("a.png")).toBe("blob:a");
    expect(manager.resolveURL("b.png")).toBe("b.png");
    manager.itemStart("x");
    let done = false;
    const p = settled().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    manager.itemEnd("x");
    await p;
    expect(done).toBe(true);
  });
});
