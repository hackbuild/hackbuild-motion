// A three.js stage for the motion examples: renderer in #stage, camera,
// orbit controls, lights, a ground grid, and stick geometry for bare
// skeletons (procedural rigs built in code, so no asset file is needed).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { $ } from "./ui.js";

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

export function stage(target: [number, number, number] = [0, 0.4, 0], distance = 2): Stage {
  const host = $("#stage");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.append(renderer.domElement);
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(dark ? 0x1b1d20 : 0xffffff);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 200);
  camera.position.set(target[0] + distance * 0.8, target[1] + distance * 0.45, target[2] + distance);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...target);
  controls.update();
  scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x30343a : 0xb0aca0, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const grid = new THREE.GridHelper(40, 80, dark ? 0x4a4f57 : 0xb8b5ac, dark ? 0x2a2d32 : 0xdedbd2);
  scene.add(grid);
  const fit = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(host);
  fit();
  return { renderer, scene, camera, controls };
}

const stickMat = new THREE.MeshStandardMaterial({ color: 0xc8742c, roughness: 0.6 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.5 });

/** Adds a capsule from every bone to each child bone, parented so it follows the pose. */
export function sticks(root: THREE.Object3D, radius = 0.012): void {
  const bones: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o);
  });
  for (const b of bones) {
    b.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.5, 12, 8), jointMat));
    for (const c of b.children) {
      if (!(c as THREE.Bone).isBone) continue;
      const len = c.position.length();
      if (len < 1e-6) continue;
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(1e-4, len - 2 * radius), 4, 10), stickMat);
      m.position.copy(c.position).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.position.clone().normalize());
      b.add(m);
    }
  }
}

/** A seeded stream for the examples; library code takes it injected. */
export const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

export const DOG_NAMES = {
  hips: "hips",
  spine: ["spine2", "chest"],
  tail: ["tail1", "tail3", "tail_03"],
  ears: ["ear.L", "ear.R"] as [string, string],
  legs: {
    LF: { up: "frontUpr.L", mid: "frontLeg.L_03", end: "frontHorselink.L", toes: ["frontToe.L"] },
    RF: { up: "frontUpr.R", mid: "frontLeg.R_03", end: "frontHorselink.R", toes: ["frontToe.R"] },
    LH: { up: "rearUpr.L", mid: "rearLwr.L", end: "rearHorselink.L", toes: ["rearFoot.L", "rearToe.L"] },
    RH: { up: "rearUpr.R", mid: "rearLwr.R", end: "rearHorselink.R", toes: ["rearFoot.R", "rearToe.R"] },
  },
};

/** A bare dog skeleton built in code, facing +Z, feet at y = 0. */
export function dogRig(): THREE.Group {
  const root = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, p: [number, number, number]) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...p);
    parent.add(b);
    return b;
  };
  const hips = bone("hips", root, [0, 0.38, 0]);
  const spine = bone("spine2", hips, [0, 0, 0.1]);
  const chest = bone("chest", spine, [0, 0, 0.12]);
  const neck = bone("neck1", chest, [0, 0.08, 0.05]);
  const head = bone("head", neck, [0, 0.08, 0.06]);
  bone("nose", head, [0, -0.02, 0.1]);
  bone("ear.L", head, [0.04, 0.05, -0.01]);
  bone("ear.R", head, [-0.04, 0.05, -0.01]);
  for (const [s, x] of [["L", 0.09], ["R", -0.09]] as const) {
    const fu = bone(`frontUpr.${s}`, chest, [x, 0, 0]);
    const fm = bone(`frontLeg.${s}_03`, fu, [0, -0.18, -0.08]);
    const fe = bone(`frontHorselink.${s}`, fm, [0, -0.16, 0.08]);
    bone(`frontToe.${s}`, fe, [0, -0.02, 0.03]);
    const ru = bone(`rearUpr.${s}`, hips, [x, 0, -0.2]);
    const rm = bone(`rearLwr.${s}`, ru, [0, -0.17, 0.07]);
    const re = bone(`rearHorselink.${s}`, rm, [0, -0.15, -0.08]);
    const rf = bone(`rearFoot.${s}`, re, [0, -0.02, 0.01]);
    bone(`rearToe.${s}`, rf, [0, -0.02, 0.03]);
  }
  const t1 = bone("tail1", hips, [0, 0.02, -0.25]);
  const t2 = bone("tail3", t1, [0, 0, -0.08]);
  bone("tail_03", t2, [0, 0, -0.08]);
  return root;
}

export const TOES = ["frontToe.L", "frontToe.R", "rearToe.L", "rearToe.R"];

/** A bare humanoid skeleton in the normalized space: VRM 1.0 bone names, T pose, +Z forward, meters, feet at y = 0. */
export function humanoidRig(): THREE.Group {
  const root = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, p: [number, number, number]) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...p);
    parent.add(b);
    return b;
  };
  const hips = bone("hips", root, [0, 0.95, 0]);
  const spine = bone("spine", hips, [0, 0.1, 0]);
  const chest = bone("chest", spine, [0, 0.15, 0]);
  const upperChest = bone("upperChest", chest, [0, 0.12, 0]);
  const neck = bone("neck", upperChest, [0, 0.13, 0]);
  const head = bone("head", neck, [0, 0.08, 0.01]);
  bone("headTop", head, [0, 0.18, 0]);
  for (const [side, s] of [["left", 1], ["right", -1]] as const) {
    const sh = bone(`${side}Shoulder`, upperChest, [s * 0.04, 0.09, 0]);
    const ua = bone(`${side}UpperArm`, sh, [s * 0.13, 0, 0]);
    const la = bone(`${side}LowerArm`, ua, [s * 0.27, 0, 0]);
    const hand = bone(`${side}Hand`, la, [s * 0.25, 0, 0]);
    bone(`${side}MiddleProximal`, hand, [s * 0.09, 0, 0]);
    const ul = bone(`${side}UpperLeg`, hips, [s * 0.09, -0.05, 0]);
    const ll = bone(`${side}LowerLeg`, ul, [0, -0.42, 0]);
    const foot = bone(`${side}Foot`, ll, [0, -0.4, 0]);
    bone(`${side}Toes`, foot, [0, -0.06, 0.13]);
  }
  return root;
}

export function bonesByName(root: THREE.Object3D): Record<string, THREE.Object3D> {
  const out: Record<string, THREE.Object3D> = {};
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) out[o.name] = o;
  });
  return out;
}
