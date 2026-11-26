// Small three.js stages for pages and examples: a lit stage that fills a
// host element and ticks, a turntable that shows one object at a time, a
// drag orbit both share, a dog of bones and boxes, and a walk written as
// bvh text for another rig. Everything is built in code; no model, clip or
// weight file. Each stage frees its renderer, geometry and materials on
// dispose.
import {
  AmbientLight, Bone, BoxGeometry, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, Spherical, Vector3, WebGLRenderer, type Object3D,
} from "three";

/** Drag to turn the camera round `target`, wheel or pinch to move in and out. */
export interface StageOrbit {
  /** The point the camera looks at and turns round. */
  readonly target: Vector3;
  /** Off, the pointer and update leave the camera alone (a page that drives it itself). */
  enabled: boolean;
  /** Points the camera at the target while enabled; the stage calls it each frame. */
  update(): void;
  dispose(): void;
}

/** A drag orbit on `el` for `camera`: horizontal drag turns, vertical drag tilts, the wheel moves in and out. */
export function stageOrbit(camera: PerspectiveCamera, el: HTMLElement): StageOrbit {
  const target = new Vector3();
  const s = new Spherical();
  let drag: { x: number; y: number; id: number } | null = null;
  const turn = (dTheta: number, dPhi: number, scale = 1) => {
    s.setFromVector3(camera.position.clone().sub(target));
    s.theta += dTheta;
    s.phi = Math.min(Math.PI * 0.49, Math.max(0.08, s.phi + dPhi));
    s.radius = Math.min(200, Math.max(0.3, s.radius * scale));
    camera.position.setFromSpherical(s).add(target);
  };
  const down = (e: PointerEvent) => {
    if (!orbit.enabled) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    el.setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id || !orbit.enabled) return;
    turn(-(e.clientX - drag.x) * 0.008, -(e.clientY - drag.y) * 0.008);
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const up = () => (drag = null);
  const wheel = (e: WheelEvent) => {
    if (!orbit.enabled) return;
    e.preventDefault();
    turn(0, 0, Math.exp(e.deltaY * 0.001));
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", wheel, { passive: false });
  const orbit: StageOrbit = {
    target,
    enabled: true,
    update: () => { if (orbit.enabled) camera.lookAt(target) },
    dispose() {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    },
  };
  return orbit;
}

/** Frees the geometry and materials of every mesh under `root`. */
export function freeMeshes(root: Object3D): void {
  root.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      for (const m of [o.material].flat()) m.dispose();
    }
  });
}

/** A running stage: its scene, camera, renderer and orbit, and how to stop it. */
export interface ThreeStage {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  /** The drag orbit; set `orbit.enabled = false` to drive the camera from the page. */
  orbit: StageOrbit;
  dispose(): void;
}

/** Options of `threeStage`. */
export interface ThreeStageOptions {
  /** A paper coloured ground plane, 40 m square. Default on. */
  ground?: boolean;
  /** Pass a renderer the page already made; the stage still sizes and frees it. */
  renderer?: WebGLRenderer;
}

/**
 * A stage lit in paper light that fills `host`: it sizes with the host,
 * calls `tick(dt, t)` each frame (dt capped at 50 ms), draws, and on
 * dispose stops the loop and frees the renderer, the orbit and every mesh.
 */
export function threeStage(host: HTMLElement, tick: (dt: number, t: number) => void, opts: ThreeStageOptions = {}): ThreeStage {
  const renderer = opts.renderer ?? new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
  host.append(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color("#efe9db");
  const camera = new PerspectiveCamera(40, 1, 0.05, 200);
  camera.position.set(2.4, 1.6, 3.2);
  const orbit = stageOrbit(camera, renderer.domElement);
  orbit.target.set(0, 0.5, 0);
  scene.add(new AmbientLight("#ffffff", 1.1));
  const sun = new DirectionalLight("#ffffff", 1.6);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  if (opts.ground !== false) {
    const g = new PlaneGeometry(40, 40);
    g.rotateX(-Math.PI / 2);
    scene.add(new Mesh(g, new MeshStandardMaterial({ color: "#d9d0bd", roughness: 1 })));
  }
  const fit = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
  ro?.observe(host);
  fit();
  let raf = 0;
  let last = performance.now();
  let t = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt;
    tick(dt, t);
    orbit.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    scene, camera, renderer, orbit,
    dispose() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      orbit.dispose();
      freeMeshes(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** A running turntable: its stage, what it shows, and how to stop it. */
export interface MeshTurntable {
  stage: ThreeStage;
  /** Shows `o` in place of what was shown; the old one's meshes are freed. */
  show(o: Object3D): void;
  dispose(): void;
}

/**
 * A turntable that fills `host`: hemisphere light, drag to turn, one
 * object at a time, sized for a relief or a depth surface tens of units
 * across (the camera starts 80 units out, looking down at 30 degrees).
 */
export function meshTurntable(host: HTMLElement, opts: { renderer?: WebGLRenderer } = {}): MeshTurntable {
  const renderer = opts.renderer ?? new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const stage = threeStage(host, () => {}, { ground: false, renderer });
  stage.camera.position.set(0, -40, 70);
  stage.camera.near = 0.1;
  stage.camera.far = 1000;
  stage.camera.updateProjectionMatrix();
  stage.orbit.target.set(0, 0, 0);
  stage.scene.add(new HemisphereLight(0xffffff, 0x8a8170, 1.2));
  let shown: Object3D | null = null;
  return {
    stage,
    show(o) {
      if (shown) {
        stage.scene.remove(shown);
        freeMeshes(shown);
      }
      shown = o;
      stage.scene.add(o);
    },
    dispose: () => stage.dispose(),
  };
}

/** The bone names of `boxDog`, in the shape `@hackbuild/gait` reads (hips, spine, tail, four legs). */
export const BOX_DOG_BONES = {
  hips: "hips",
  spine: ["spine2", "chest"],
  tail: ["tail1", "tail3", "tail_03"],
  legs: {
    LF: { up: "frontUpr.L", mid: "frontLeg.L_03", end: "frontHorselink.L", toes: ["frontToe.L"] },
    RF: { up: "frontUpr.R", mid: "frontLeg.R_03", end: "frontHorselink.R", toes: ["frontToe.R"] },
    LH: { up: "rearUpr.L", mid: "rearLwr.L", end: "rearHorselink.L", toes: ["rearFoot.L", "rearToe.L"] },
    RH: { up: "rearUpr.R", mid: "rearLwr.R", end: "rearHorselink.R", toes: ["rearFoot.R", "rearToe.R"] },
  },
} as const;

/**
 * A dog of bones and boxes facing +z, about 0.78 m nose to tail with the
 * hips 0.38 m up; bone names are `BOX_DOG_BONES`. Each bone carries a box
 * to its child, so the legs show what a gait does to them.
 */
export function boxDog(color = "#c9a36b"): Group {
  const root = new Group();
  const bone = (name: string, parent: Object3D, p: [number, number, number]) => {
    const b = new Bone();
    b.name = name;
    b.position.set(...p);
    parent.add(b);
    return b;
  };
  const hips = bone("hips", root, [0, 0.38, 0]);
  const spine = bone("spine2", hips, [0, 0, 0.1]);
  const chest = bone("chest", spine, [0, 0, 0.12]);
  const head = bone("head", bone("neck1", chest, [0, 0.08, 0.05]), [0, 0.08, 0.06]);
  for (const [s, x] of [["L", 0.09], ["R", -0.09]] as const) {
    const fe = bone(`frontHorselink.${s}`, bone(`frontLeg.${s}_03`, bone(`frontUpr.${s}`, chest, [x, 0, 0]), [0, -0.18, -0.08]), [0, -0.16, 0.08]);
    bone(`frontToe.${s}`, fe, [0, -0.02, 0.03]);
    const re = bone(`rearHorselink.${s}`, bone(`rearLwr.${s}`, bone(`rearUpr.${s}`, hips, [x, 0, -0.2]), [0, -0.17, 0.07]), [0, -0.15, -0.08]);
    bone(`rearToe.${s}`, bone(`rearFoot.${s}`, re, [0, -0.02, 0.01]), [0, -0.02, 0.03]);
  }
  bone("tail_03", bone("tail3", bone("tail1", hips, [0, 0.02, -0.25]), [0, 0, -0.08]), [0, 0, -0.08]);
  const mat = new MeshStandardMaterial({ color, roughness: 0.7 });
  const Z = new Vector3(0, 0, 1);
  const parts: [Object3D, Mesh][] = [];
  root.traverse((o) => {
    if (!(o instanceof Bone)) return;
    for (const c of o.children) {
      if (!(c instanceof Bone) || c.position.length() < 1e-4) continue;
      const thick = c.name === "spine2" || c.name === "chest" ? 0.17 : /Upr/.test(c.name) ? 0.07 : /tail/.test(c.name) ? 0.03 : 0.045;
      const m = new Mesh(new BoxGeometry(thick, thick, c.position.length()), mat);
      m.position.copy(c.position).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(Z, c.position.clone().normalize());
      parts.push([o, m]);
    }
  });
  for (const [o, m] of parts) o.add(m);
  const skull = new Mesh(new BoxGeometry(0.11, 0.1, 0.18), mat);
  skull.position.set(0, 0.02, 0.05);
  head.add(skull);
  return root;
}

/** Options of `walkBvh`. */
export interface WalkBvhOptions {
  /** Loop length in seconds. Default 2.4. */
  seconds?: number;
  fps?: number;
  /** Stride scale: 0.6 strolls, 1.5 marches. Default 1. */
  swing?: number;
}

/**
 * A two step walk loop as bvh text for a humanoid that is not ours: other
 * bone names (Hips, LeftUpLeg, RightForeArm and so on), centimetres, arms
 * down, ZXY channels. A retarget has real work to do on it.
 */
export function walkBvh(o: WalkBvhOptions = {}): string {
  const { seconds = 2.4, fps = 30, swing = 1 } = o;
  const J: [string, number, number[]][] = [
    ["Hips", -1, [0, 0, 0]], ["Spine", 0, [0, 12, 0]], ["Spine1", 1, [0, 16, 0]], ["Neck", 2, [0, 26, 0]], ["Head", 3, [0, 11, 0]],
    ["LeftArm", 2, [18, 22, 0]], ["LeftForeArm", 5, [29, 0, 0]], ["LeftHand", 6, [26, 0, 0]],
    ["RightArm", 2, [-18, 22, 0]], ["RightForeArm", 8, [-29, 0, 0]], ["RightHand", 9, [-26, 0, 0]],
    ["LeftUpLeg", 0, [10, -6, 0]], ["LeftLeg", 11, [0, -47, 0]], ["LeftFoot", 12, [0, -45, 0]], ["LeftToeBase", 13, [0, -8, 14]],
    ["RightUpLeg", 0, [-10, -6, 0]], ["RightLeg", 15, [0, -47, 0]], ["RightFoot", 16, [0, -45, 0]], ["RightToeBase", 17, [0, -8, 14]],
  ];
  const kids = (i: number) => J.map((j, k) => [j, k] as const).filter(([j]) => j[1] === i).map(([, k]) => k);
  const order: number[] = [];
  const write = (i: number, pad: string): string => {
    order.push(i);
    const [name, parent, off] = J[i]!;
    const ch = parent < 0 ? "CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation" : "CHANNELS 3 Zrotation Xrotation Yrotation";
    const c = kids(i);
    const body = c.length ? c.map((k) => write(k, pad + "  ")).join("") : `${pad}  End Site\n${pad}  {\n${pad}    OFFSET 0 6 0\n${pad}  }\n`;
    return `${pad}${parent < 0 ? "ROOT" : "JOINT"} ${name}\n${pad}{\n${pad}  OFFSET ${off.join(" ")}\n${pad}  ${ch}\n${body}${pad}}\n`;
  };
  const tree = write(0, "");
  const n = Math.round(seconds * fps);
  const lines: string[] = [];
  for (let f = 0; f < n; f++) {
    const ph = (f / fps) * 2 * Math.PI * (1 / seconds) * 2;
    const s = Math.sin(ph) * swing;
    const rot: Record<string, number[]> = {
      LeftUpLeg: [0, -28 * s, 0], RightUpLeg: [0, 28 * s, 0],
      LeftLeg: [0, 45 * Math.max(0, Math.sin(ph + 1.4)) * swing, 0], RightLeg: [0, 45 * Math.max(0, Math.sin(ph + 1.4 + Math.PI)) * swing, 0],
      LeftArm: [-70, 22 * s, 0], RightArm: [70, -22 * s, 0], LeftForeArm: [0, 0, -15], RightForeArm: [0, 0, 15],
    };
    lines.push(order.map((i) => (i === 0 ? [0, 106 + 2.5 * Math.cos(2 * ph), 0, 2 * s, 0, 3 * s] : rot[J[i]![0]] ?? [0, 0, 0]).map((v) => v.toFixed(3)).join(" ")).join(" "));
  }
  return `HIERARCHY\n${tree}MOTION\nFrames: ${n}\nFrame Time: ${(1 / fps).toFixed(6)}\n${lines.join("\n")}\n`;
}
