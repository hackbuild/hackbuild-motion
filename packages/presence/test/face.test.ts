// The face driver, clip face tracks and the rest stance.
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { type Clip, ClipPlayer, Face, RELAXED, RESTING_FACE, restStance, sampleFace } from "../src/index.js";
import { applyPose, restStanceFromThree } from "../src/three.js";

const sink = () => {
  const v = new Map<string, number>();
  return { v, setValue: (n: string, w: number) => void v.set(n, w) };
};

describe("Face", () => {
  it("eases a mood to 0.63 of its target in 1/8 s", () => {
    const s = sink();
    const f = new Face(s, { resting: {} });
    f.set("angry");
    for (let i = 0; i < 10; i++) f.update(1 / 80);
    expect(f.value("angry")).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(s.v.get("angry")).toBeCloseTo(0.632, 3);
  });

  it("rests at the resting weights with no mood, and leaves them for a mood", () => {
    const f = new Face(sink());
    for (let i = 0; i < 120; i++) f.update(1 / 60);
    expect(f.value("happy")).toBeCloseTo(RESTING_FACE.happy!, 3);
    expect(f.value("relaxed")).toBeCloseTo(0.3, 3);
    expect(f.settling()).toBe(false);
    f.set("sad", 0.8);
    expect(f.settling()).toBe(true);
    for (let i = 0; i < 120; i++) f.update(1 / 60);
    expect(f.value("sad")).toBeCloseTo(0.8, 3);
    expect(f.value("happy")).toBeLessThan(1e-3);
  });

  it("shows a clip weight above the mood and returns to the mood when the clip ends", () => {
    const f = new Face(sink(), { resting: {} });
    f.set("happy", 0.3);
    for (let i = 0; i < 120; i++) f.update(1 / 60);
    f.update(1 / 60, new Map([["happy", 0.9], ["surprised", 0.5]]));
    expect(f.value("happy")).toBe(0.9);
    expect(f.value("surprised")).toBe(0.5);
    f.update(1 / 60, new Map([["happy", 0.1]]));
    expect(f.value("happy")).toBeCloseTo(0.3, 3);
    expect(f.value("surprised")).toBe(0);
    f.update(1 / 60);
    expect(f.value("happy")).toBeCloseTo(0.3, 3);
  });

  it("lets speech win the mouth and releases a shape it stopped writing", () => {
    const f = new Face(sink(), { resting: {} });
    f.mouth.setValue("aa", 0.7);
    f.update(1 / 60, new Map([["aa", 0.2]]));
    expect(f.value("aa")).toBe(0.7);
    f.update(1 / 60);
    expect(f.value("aa")).toBe(0);
  });

  it("writes the lid, and 0 at once when blinking turns off mid blink", () => {
    const s = sink();
    const f = new Face(s);
    f.lid(0.8);
    f.update(1 / 60);
    expect(s.v.get("blink")).toBe(0.8);
    f.blink = false;
    expect(s.v.get("blink")).toBe(0);
    f.lid(1);
    f.update(1 / 60);
    expect(s.v.get("blink")).toBe(0);
  });
});

describe("clip face tracks", () => {
  const clip = (faces: Clip["faces"]): Clip => ({ name: "smile", fps: 10, frames: 11, bones: 1, loop: false, rotations: new Float32Array(11 * 4).map((_, i) => (i % 4 === 3 ? 1 : 0)), ...(faces ? { faces } : {}) });

  it("samples between frames", () => {
    const c = clip([{ name: "happy", weights: Float32Array.from({ length: 11 }, (_, i) => i / 10) }]);
    expect(sampleFace(c, c.faces![0]!, 0.25)).toBeCloseTo(0.25, 6);
    expect(sampleFace(c, c.faces![0]!, 9)).toBeCloseTo(1, 6);
  });

  it("hands the player's face weights over by layer weight", () => {
    const idle = clip(undefined);
    const p = new ClipPlayer({ idle });
    p.play(clip([{ name: "happy", weights: new Float32Array(11).fill(1) }]), { fade: 0.1, hold: 0.5 });
    p.update(0.05);
    const early = p.faces.get("happy")!;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(1);
    p.update(0.2);
    expect(p.faces.get("happy")).toBeCloseTo(1, 6);
    for (let i = 0; i < 40; i++) p.update(0.05);
    expect(p.faces.get("happy") ?? 0).toBe(0);
  });
});

describe("rest stance", () => {
  // shoulders at 1.4 m, arms out along +-X, the left arm bones rest turned -90 degrees about Y
  function rig() {
    const root = new THREE.Group();
    const chest = new THREE.Object3D();
    chest.position.set(0, 1.3, 0);
    root.add(chest);
    const make = (name: string, parent: THREE.Object3D, pos: [number, number, number]) => {
      const b = new THREE.Object3D();
      b.name = name;
      b.position.set(...pos);
      parent.add(b);
      return b;
    };
    const lu = make("leftUpperArm", chest, [0.18, 0.1, 0]);
    lu.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    // under a turned parent, local -Z points along world +X
    const ll = make("leftLowerArm", lu, [0, 0, -0.28]);
    const lh = make("leftHand", ll, [0, 0, -0.25]);
    const ru = make("rightUpperArm", chest, [-0.18, 0.1, 0]);
    const rl = make("rightLowerArm", ru, [-0.28, 0, 0]);
    const rh = make("rightHand", rl, [-0.25, 0, 0]);
    root.updateMatrixWorld(true);
    return { root, bones: [lu, ll, lh, ru, rl, rh], names: ["leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand"] };
  }
  const y = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3()).y;

  it("keeps hands below shoulders on a rig whose bones rest in other frames", () => {
    const r = rig();
    expect(y(r.bones[2]!)).toBeCloseTo(1.4, 6);
    const c = restStanceFromThree(r.bones, r.names, r.root);
    const p = new ClipPlayer({ idle: c });
    applyPose(p.update(1 / 60), r.bones);
    r.root.updateMatrixWorld(true);
    for (const [hand, shoulder] of [[2, 0], [5, 3]] as const) expect(y(r.bones[hand]!)).toBeLessThan(y(r.bones[shoulder]!) - 0.4);
    // the arms hang beside the body, not in front or behind
    expect(Math.abs(r.bones[2]!.getWorldPosition(new THREE.Vector3()).z)).toBeLessThan(1e-6);
    expect(r.bones[2]!.getWorldPosition(new THREE.Vector3()).x).toBeGreaterThan(0);
  });

  it("matches the plain stance on identity rest bones", () => {
    const names = ["hips", "leftUpperArm", "rightLowerArm"];
    const c = restStance(names);
    const q = new THREE.Quaternion().fromArray(c.rotations, 4);
    expect(q.angleTo(new THREE.Quaternion())).toBeCloseTo(Math.abs(RELAXED.leftUpperArm!), 6);
    const v = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(v.y).toBeLessThan(-0.9);
    expect(new THREE.Quaternion().fromArray(c.rotations, 0).w).toBe(1);
  });
});
