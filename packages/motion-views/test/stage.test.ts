import { describe, expect, it } from "vitest";
import { Bone, BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3, type Object3D } from "three";
import { BOX_DOG_BONES, boxDog, freeMeshes, stageOrbit, walkBvh } from "../src/vanilla.js";

const named = (root: Object3D, name: string) => root.getObjectByName(name);

describe("boxDog", () => {
  it("carries every bone BOX_DOG_BONES names, and a box per bone span", () => {
    const dog = boxDog();
    const names = [BOX_DOG_BONES.hips, ...BOX_DOG_BONES.spine, ...BOX_DOG_BONES.tail, ...Object.values(BOX_DOG_BONES.legs).flatMap((l) => [l.up, l.mid, l.end, ...l.toes])];
    for (const n of names) expect(named(dog, n), n).toBeInstanceOf(Bone);
    let boxes = 0;
    dog.traverse((o) => { if (o instanceof Mesh) boxes++; });
    expect(boxes).toBeGreaterThan(20);
    expect(named(dog, "hips")!.position.y).toBeCloseTo(0.38);
  });
});

describe("walkBvh", () => {
  it("writes a hierarchy and one motion line per frame with a value per channel", () => {
    const text = walkBvh({ seconds: 2, fps: 30 });
    expect(text.startsWith("HIERARCHY\nROOT Hips")).toBe(true);
    expect(text).toContain("Frames: 60");
    expect(text).toContain("Frame Time: 0.033333");
    const channels = [...text.matchAll(/CHANNELS (\d)/g)].reduce((a, m) => a + Number(m[1]), 0);
    const motion = text.split("Frame Time: 0.033333\n")[1]!.trim().split("\n");
    expect(motion).toHaveLength(60);
    expect(motion[0]!.split(" ")).toHaveLength(channels);
  });
  it("swings the legs further with a bigger swing", () => {
    const peak = (t: string) => Math.max(...t.split("Frame Time")[1]!.split("\n").slice(1).filter(Boolean).flatMap((l) => l.split(" ").map((v) => Math.abs(Number(v)))).filter((v) => v < 69));
    expect(peak(walkBvh({ swing: 1.5 }))).toBeGreaterThan(peak(walkBvh({ swing: 0.6 })));
  });
});

describe("freeMeshes", () => {
  it("disposes the geometry and material of every mesh", () => {
    const g = new BoxGeometry();
    const m = new MeshStandardMaterial();
    let freed = 0;
    g.addEventListener("dispose", () => freed++);
    m.addEventListener("dispose", () => freed++);
    const root = new Bone();
    root.add(new Mesh(g, m));
    freeMeshes(root);
    expect(freed).toBe(2);
  });
});

describe("stageOrbit", () => {
  const press = (el: EventTarget, type: string, x: number, y: number) => el.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y, pointerId: 1 }));
  it("turns the camera round its target on a drag and stops when disabled", () => {
    const cam = new PerspectiveCamera();
    cam.position.set(0, 1, 3);
    const el = new EventTarget() as unknown as HTMLElement;
    const orbit = stageOrbit(cam, el);
    const r0 = cam.position.distanceTo(orbit.target);
    press(el, "pointerdown", 100, 100);
    press(el, "pointermove", 160, 100);
    expect(cam.position.x).not.toBeCloseTo(0);
    expect(cam.position.distanceTo(orbit.target)).toBeCloseTo(r0);
    press(el, "pointerup", 160, 100);
    orbit.enabled = false;
    const before = cam.position.clone();
    press(el, "pointerdown", 100, 100);
    press(el, "pointermove", 200, 150);
    expect(cam.position.equals(before)).toBe(true);
    orbit.dispose();
    orbit.enabled = true;
    press(el, "pointerdown", 100, 100);
    press(el, "pointermove", 200, 150);
    expect(cam.position.equals(before)).toBe(true);
    orbit.update();
    expect(new Vector3(0, 0, -1).applyQuaternion(cam.quaternion).dot(orbit.target.clone().sub(cam.position).normalize())).toBeCloseTo(1);
  });
  it("leaves the camera where the page aimed it while disabled", () => {
    const cam = new PerspectiveCamera();
    cam.position.set(0, 1, 3);
    const orbit = stageOrbit(cam, new EventTarget() as unknown as HTMLElement);
    orbit.enabled = false;
    cam.lookAt(5, 1, 3);
    const q = cam.quaternion.clone();
    orbit.update();
    expect(cam.quaternion.equals(q)).toBe(true);
    orbit.dispose();
  });
});
