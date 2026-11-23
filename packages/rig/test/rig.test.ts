import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ARKIT_52,
  HUMAN_BONES,
  OCULUS_VISEMES,
  VISEME_TO_VOWELS,
  VRM_EXPRESSIONS,
  type HumanBone,
  type RigNodeInput,
  analyzeRest,
  goldenTrace,
  limbChains,
  load,
  mapRig,
  referenceRest,
  resolveExpressions,
  wasmBoneNames,
} from "../src/index.js";
import { applyRestFix, chainsOf, mapObject3D, restOf } from "../src/three.js";

const here = import.meta.dirname;
const golden = JSON.parse(readFileSync(join(here, "../../../crates/rig/tests/golden.json"), "utf8")) as { seed: number; values: number[] };

beforeAll(async () => {
  await load();
});

function mixamo(pre: string): RigNodeInput[] {
  const n: RigNodeInput[] = [];
  const add = (name: string, parent: string | null) => n.push({ name: pre + name, parent: parent && pre + parent });
  add("Hips", null);
  add("Spine", "Hips");
  add("Spine1", "Spine");
  add("Spine2", "Spine1");
  add("Neck", "Spine2");
  add("Head", "Neck");
  add("HeadTop_End", "Head");
  for (const s of ["Left", "Right"]) {
    add(`${s}Shoulder`, "Spine2");
    add(`${s}Arm`, `${s}Shoulder`);
    add(`${s}ForeArm`, `${s}Arm`);
    add(`${s}Hand`, `${s}ForeArm`);
    for (const f of ["Thumb", "Index", "Middle", "Ring", "Pinky"]) {
      let p = `${s}Hand`;
      for (let k = 1; k <= 4; k++) {
        add(`${s}Hand${f}${k}`, p);
        p = `${s}Hand${f}${k}`;
      }
    }
    add(`${s}UpLeg`, "Hips");
    add(`${s}Leg`, `${s}UpLeg`);
    add(`${s}Foot`, `${s}Leg`);
    add(`${s}ToeBase`, `${s}Foot`);
  }
  return n;
}

function ual(): RigNodeInput[] {
  const n: RigNodeInput[] = [{ name: "root", parent: null }, { name: "pelvis", parent: "root" }];
  const add = (name: string, parent: string) => n.push({ name, parent });
  add("spine_01", "pelvis");
  add("spine_02", "spine_01");
  add("spine_03", "spine_02");
  add("neck_01", "spine_03");
  add("Head", "neck_01");
  for (const s of ["l", "r"]) {
    add(`clavicle_${s}`, "spine_03");
    add(`upperarm_${s}`, `clavicle_${s}`);
    add(`lowerarm_${s}`, `upperarm_${s}`);
    add(`hand_${s}`, `lowerarm_${s}`);
    for (const f of ["thumb", "index", "middle", "ring", "pinky"]) {
      let p = `hand_${s}`;
      for (let k = 1; k <= 3; k++) {
        add(`${f}_0${k}_${s}`, p);
        p = `${f}_0${k}_${s}`;
      }
    }
    add(`thigh_${s}`, "pelvis");
    add(`calf_${s}`, `thigh_${s}`);
    add(`foot_${s}`, `calf_${s}`);
    add(`ball_${s}`, `foot_${s}`);
  }
  return n;
}

const DOG = `root;hips<root;spine2<hips;spine_03<spine2;chest<spine_03;neck1<chest;head<neck1;ear.L_01<head;ear.R_01<head;clavicle.L<chest;frontUpr.L<clavicle.L;frontLeg.L_03<frontUpr.L;frontHorselink.L<frontLeg.L_03;frontToe.L<frontHorselink.L;clavicle.R<chest;frontUpr.R<clavicle.R;frontLeg.R_03<frontUpr.R;frontHorselink.R<frontLeg.R_03;frontToe.R<frontHorselink.R;rearUpr.L<hips;rearLwr.L<rearUpr.L;rearHorselink.L<rearLwr.L;rearFoot.L<rearHorselink.L;rearToe.L<rearFoot.L;rearUpr.R<hips;rearLwr.R<rearUpr.R;rearHorselink.R<rearLwr.R;rearFoot.R<rearHorselink.R;rearToe.R<rearFoot.R;tail1<hips;tail3<tail1;tail_03<tail3`
  .split(";")
  .map((s) => {
    const [name, parent] = s.split("<");
    return { name: name!, parent: parent ?? null };
  });

describe("wasm and native agree", () => {
  it("golden trace is bit identical to the native build", () => {
    const got = Array.from(goldenTrace(golden.seed));
    expect(got.length).toBe(golden.values.length);
    got.forEach((v, i) => expect(Object.is(v, golden.values[i]), `value ${i}`).toBe(true));
  });

  it("bone order matches the Rust enum", () => {
    expect(wasmBoneNames()).toEqual([...HUMAN_BONES]);
  });
});

describe("mapper", () => {
  it("maps Mixamo with the prefix and Ready Player Me style without it", () => {
    for (const pre of ["mixamorig:", ""]) {
      const nodes = mixamo(pre);
      const r = mapRig(nodes);
      expect(r.missingRequired).toEqual([]);
      expect(nodes[r.byBone.upperChest!]!.name).toBe(`${pre}Spine2`);
      expect(nodes[r.byBone.leftIndexDistal!]!.name).toBe(`${pre}LeftHandIndex3`);
      expect(r.dialect).toBe(pre ? "mixamo" : "mixamo-like");
      expect(r.helpers.map((i) => nodes[i]!.name)).toContain(`${pre}HeadTop_End`);
    }
  });

  it("maps the UAL mannequin", () => {
    const nodes = ual();
    const r = mapRig(nodes);
    expect(r.missingRequired).toEqual([]);
    expect(nodes[r.byBone.hips!]!.name).toBe("pelvis");
    expect(nodes[r.byBone.leftToes!]!.name).toBe("ball_l");
    expect(nodes[r.byBone.rightThumbMetacarpal!]!.name).toBe("thumb_01_r");
  });

  it("finds four legs, a tail and ears on a Meshy dog rig", () => {
    const r = mapRig(DOG);
    expect(r.missingRequired.length).toBeGreaterThan(0);
    const chains = limbChains(DOG);
    const names = (c: string) => chains.find((x) => x.name === c)!.bones.map((i) => DOG[i]!.name);
    expect(names("LF")).toEqual(["frontUpr.L", "frontLeg.L_03", "frontHorselink.L", "frontToe.L"]);
    expect(names("LH")).toEqual(["rearUpr.L", "rearLwr.L", "rearHorselink.L", "rearFoot.L", "rearToe.L"]);
    expect(names("tail")).toEqual(["tail1", "tail3", "tail_03"]);
  });

  it("is stable under shuffles and namespaces (property)", () => {
    const base = mixamo("");
    const want = mapRig(base);
    fc.assert(
      fc.property(fc.shuffledSubarray(base.map((_, i) => i), { minLength: base.length, maxLength: base.length }), fc.constantFrom("", "Armature|", "rig:"), (perm, ns) => {
        const nodes = perm.map((o) => ({ name: ns + base[o]!.name, parent: base[o]!.parent === null ? null : ns + base[o]!.parent }));
        const r = mapRig(nodes);
        return (Object.entries(want.byBone) as [HumanBone, number][]).every(([b, i]) => nodes[r.byBone[b]!]?.name === ns + base[i]!.name);
      }),
      { numRuns: 50 },
    );
  });
});

describe("rest analysis", () => {
  it("reference skeleton is already normalized", () => {
    const r = analyzeRest(referenceRest())!;
    expect(r.units).toBe("meters");
    expect(r.aPose).toBe(false);
    expect(Math.abs(r.fix[3])).toBeCloseTo(1, 9);
  });

  it("three adapter fixes a turned, centimeter, A pose model", () => {
    const ref = referenceRest();
    // build a Mixamo named skeleton from the reference, in centimeters, turned 180 degrees, arms down 35 degrees
    const nodes = mixamo("mixamorig:");
    const map = mapRig(nodes);
    const boneOf = new Map(Object.entries(map.byBone).map(([b, i]) => [i, b as HumanBone]));
    const objs = nodes.map((n) => {
      const b = new THREE.Bone();
      b.name = n.name;
      return b;
    });
    const world: THREE.Vector3[] = nodes.map((_, i) => {
      let j: number | null = i;
      while (j !== null) {
        const hb = boneOf.get(j);
        if (hb) return new THREE.Vector3(...ref[hb]);
        const p: string | number | null = nodes[j]!.parent;
        j = p === null ? null : nodes.findIndex((x) => x.name === p);
      }
      return new THREE.Vector3();
    });
    const lower = (side: "left" | "right", sign: number) => {
      const pivot = world[map.byBone[`${side}UpperArm`]!]!.clone();
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (sign * 35 * Math.PI) / 180);
      nodes.forEach((n, i) => {
        if (n.name.includes(side === "left" ? "Left" : "Right") && /ForeArm|Hand/.test(n.name)) world[i]!.sub(pivot).applyQuaternion(q).add(pivot);
      });
    };
    lower("left", -1);
    lower("right", 1);
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const scene = new THREE.Group();
    objs.forEach((o, i) => {
      const p = nodes[i]!.parent;
      const pi = p === null ? -1 : nodes.findIndex((x) => x.name === p);
      const wp = world[i]!.clone().applyQuaternion(turn).multiplyScalar(100);
      const pp = pi < 0 ? new THREE.Vector3() : world[pi]!.clone().applyQuaternion(turn).multiplyScalar(100);
      o.position.copy(wp.sub(pp));
      (pi < 0 ? scene : objs[pi]!).add(o);
    });
    const mapped = mapObject3D(scene);
    expect(mapped.report.missingRequired).toEqual([]);
    const rep = restOf(mapped.bones)!;
    expect(rep.units).toBe("centimeters");
    expect(rep.aPose).toBe(true);
    expect(rep.armDown[0]).toBeCloseTo(35, 6);
    const holder = new THREE.Group();
    holder.add(scene);
    applyRestFix(scene, mapped.bones, rep);
    holder.updateMatrixWorld(true);
    const pos = (b: HumanBone) => mapped.bones[b]!.getWorldPosition(new THREE.Vector3());
    const arm = pos("leftLowerArm").sub(pos("leftUpperArm")).normalize();
    expect(arm.x).toBeCloseTo(1, 6);
    expect(pos("leftUpperArm").x).toBeGreaterThan(0);
    expect(pos("head").z).toBeCloseTo(0, 6);
    const toes = Math.min(pos("leftToes").y, pos("rightToes").y);
    expect(toes).toBeCloseTo(0, 6);
    expect(pos("head").y).toBeCloseTo(1.56 - 0.02, 4);
    const chains = chainsOf(holder);
    expect(chains.chains.find((c) => c.name === "LF")).toBeDefined();
  });
});

describe("expression and viseme table", () => {
  it("has the sizes the standards give", () => {
    expect(ARKIT_52.length).toBe(52);
    expect(new Set(ARKIT_52).size).toBe(52);
    expect(OCULUS_VISEMES.length).toBe(15);
    expect(VRM_EXPRESSIONS.length).toBe(18);
    for (const v of OCULUS_VISEMES) expect(VISEME_TO_VOWELS[v]).toBeDefined();
  });

  it("resolves VRChat, MMD, ARKit and Oculus style models", () => {
    const vrc = resolveExpressions(["vrc.v_aa", "vrc.v_ih", "vrc.v_ou", "vrc.v_e", "vrc.v_oh", "vrc.blink", "Smile"]);
    expect(vrc.aa?.binds[0]!.morph).toBe("vrc.v_aa");
    expect(vrc.blink?.source).toBe("alias");
    expect(vrc.happy?.binds[0]!.morph).toBe("Smile");
    const mmd = resolveExpressions(["あ", "い", "う", "え", "お", "まばたき", "笑い", "怒り", "困る", "びっくり"]);
    expect(mmd.oh?.binds[0]!.morph).toBe("お");
    expect(mmd.sad?.binds[0]!.morph).toBe("困る");
    const ark = resolveExpressions([...ARKIT_52]);
    expect(ark.happy?.source).toBe("arkit");
    expect(ark.blink?.binds.map((b) => b.morph)).toEqual(["eyeBlinkLeft", "eyeBlinkRight"]);
    const rpm = resolveExpressions([...ARKIT_52, ...OCULUS_VISEMES.map((v) => `viseme_${v}`)]);
    expect(rpm.aa?.binds[0]!.morph).toBe("viseme_aa");
    expect(rpm.ih?.binds[0]!.morph).toBe("viseme_I");
  });

  it("angry and sad never share a morph", () => {
    const r = resolveExpressions(["frown", "angry"]);
    expect(r.sad?.binds[0]!.morph).toBe("frown");
    expect(r.angry?.binds[0]!.morph).toBe("angry");
  });
});
