import { seededRng } from "@hackbuild/organic";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  Blink,
  Breath,
  type Clip,
  ClipPlayer,
  DEG,
  GazeController,
  HeadLevel,
  IdleScheduler,
  POINT_TIMING,
  SeamHold,
  clipDuration,
  createPose,
  planLoop,
  planReach,
  planThrow,
  pointGesture,
  quatAngle,
  quatPitch,
  reachWeight,
  sampleLoop,
  seamDegrees,
  throwPose,
  wrapAngle,
} from "../src/index.js";

const DT = 1 / 60;

/** Third difference of a sampled signal over dt cubed: jerk. */
function maxJerk(xs: number[], dt: number): number {
  let worst = 0;
  for (let i = 3; i < xs.length; i++) worst = Math.max(worst, Math.abs(xs[i]! - 3 * xs[i - 1]! + 3 * xs[i - 2]! - xs[i - 3]!) / dt ** 3);
  return worst;
}

describe("seam hold", () => {
  it("keeps the side when a target crosses directly behind", () => {
    const s = new SeamHold(2.2);
    s.update(2.9);
    expect(s.update(-3.0)).toBeCloseTo(-3.0 + 2 * Math.PI);
    // back in front on the other side: it lets go
    expect(s.update(-1.0)).toBeCloseTo(-1.0);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe("gaze", () => {
  it("never whips the head across the seam as a target circles behind", () => {
    const g = new GazeController({ rng: seededRng(3), organic: false });
    let prev = 0;
    let worstBehind = 0;
    let turned = false;
    // a target circling the head at 2 m, once around in 8 s, the body standing still
    for (let k = 0; k < 480; k++) {
      const a = (k / 480) * 2 * Math.PI;
      g.setTarget([2 * Math.sin(a), 1.6, 2 * Math.cos(a)]);
      const out = g.update(DT, [0, 1.6, 0], 0);
      // while the target passes behind (within 0.6 rad of the seam) the head holds its side
      if (Math.abs(wrapAngle(a - Math.PI)) < 0.6) worstBehind = Math.max(worstBehind, Math.abs(out.headYaw - prev));
      prev = out.headYaw;
      if (out.bodyTurn !== 0) turned = true;
    }
    // a whip across the seam would swing 2.6 rad within these frames
    expect(worstBehind).toBeLessThan(0.02);
    expect(turned).toBe(true);
  });

  it("follows a circling target with no head whip when the body turns as asked", () => {
    const g = new GazeController({ rng: seededRng(3) });
    let body = 0;
    let prev = 0;
    let worst = 0;
    for (let k = 0; k < 960; k++) {
      const a = (k / 480) * 2 * Math.PI;
      g.setTarget([2 * Math.sin(a), 1.6, 2 * Math.cos(a)]);
      const out = g.update(DT, [0, 1.6, 0], body);
      body += Math.max(-2 * DT, Math.min(2 * DT, out.bodyTurn));
      if (k > 0) worst = Math.max(worst, Math.abs(out.headYaw - prev));
      prev = out.headYaw;
    }
    expect(worst).toBeLessThan(0.1);
  });

  it("asks the body to turn for a target behind and keeps the head inside its range", () => {
    const g = new GazeController({ rng: seededRng(5) });
    g.setTarget([0.3, 1.6, -3]);
    let out = g.update(DT, [0, 1.6, 0], 0);
    for (let k = 0; k < 120; k++) out = g.update(DT, [0, 1.6, 0], 0);
    expect(Math.abs(out.bodyTurn)).toBeGreaterThan(1.5);
    expect(Math.abs(out.headYaw)).toBeLessThanOrEqual(1.3 + 1e-9);
  });

  it("holds the eyes inside their limits for any target and mode (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.tuple(fc.double({ min: -6, max: 6, noNaN: true }), fc.double({ min: -2, max: 4, noNaN: true }), fc.double({ min: -6, max: 6, noNaN: true })),
        fc.constantFrom("listen", "talk", "think" as const),
        (seed, target, mode) => {
          const g = new GazeController({ rng: seededRng(seed) });
          g.setMode(mode);
          g.setTarget(target);
          for (let k = 0; k < 90; k++) {
            const out = g.update(DT, [0, 1.6, 0], 0.4);
            if (Math.abs(out.eyeYaw) > 25 * DEG + 1e-9 || Math.abs(out.eyePitch) > 10 * DEG + 1e-9) return false;
          }
          return true;
        },
      ),
      { numRuns: 60 },
    );
  });

  it("moves only the eyes for a small offset and recruits the head for a large one", () => {
    const settle = (x: number) => {
      const g = new GazeController({ rng: seededRng(1), organic: false });
      g.setTarget([x, 1.6, 2]);
      let out = g.update(DT, [0, 1.6, 0], 0);
      for (let k = 0; k < 120; k++) out = g.update(DT, [0, 1.6, 0], 0);
      return out;
    };
    const big = settle(2);
    expect(big.headYaw).toBeGreaterThan(0.5);
    expect(Math.abs(big.headYaw + big.eyeYaw - Math.atan2(2, 2))).toBeLessThan(0.01);
    const organic = new GazeController({ rng: seededRng(1) });
    organic.setTarget([0.2, 1.6, 2]);
    let small = organic.update(DT, [0, 1.6, 0], 0);
    for (let k = 0; k < 30; k++) small = organic.update(DT, [0, 1.6, 0], 0);
    // inside the 16 degree eye only range the head stays put (within the micro saccade spread)
    expect(Math.abs(small.headYaw)).toBeLessThan(0.05);
  });

  it("averts more while thinking than talking, more while talking than listening", () => {
    const share = (mode: "listen" | "talk" | "think") => {
      const g = new GazeController({ rng: seededRng(11) });
      g.setMode(mode);
      g.setTarget([0, 1.6, 2]);
      let averted = 0;
      const n = 60 * 600;
      for (let k = 0; k < n; k++) if (g.update(DT, [0, 1.6, 0], 0).averted) averted++;
      return averted / n;
    };
    const listen = share("listen");
    const talk = share("talk");
    const think = share("think");
    expect(listen).toBeLessThan(talk);
    expect(talk).toBeLessThan(think);
    // Andrist 2014 ratios (vendor): about 0.16 listening and 0.41 talking
    expect(listen).toBeGreaterThan(0.08);
    expect(listen).toBeLessThan(0.25);
    expect(talk).toBeGreaterThan(0.3);
    expect(talk).toBeLessThan(0.55);
  });

  it("keeps head jerk bounded while tracking a moving target with aversion on", () => {
    const g = new GazeController({ rng: seededRng(21) });
    const ys: number[] = [];
    for (let k = 0; k < 600; k++) {
      const t = k * DT;
      g.setTarget([Math.sin(t * 0.7) * 1.5, 1.5, 2]);
      ys.push(g.update(DT, [0, 1.6, 0], 0).headYaw);
    }
    // a step would show as jerk near 1 / dt^3 = 216000; springs keep it far lower (computed bound)
    expect(maxJerk(ys, DT)).toBeLessThan(2000);
  });
});

describe("blink and breath", () => {
  it("blinks every 1 to 8 s with mostly single blinks", () => {
    const b = new Blink(seededRng(7));
    let prev = 0;
    const starts: number[] = [];
    for (let k = 0; k < 60 * 600; k++) {
      const w = b.update(DT);
      if (w > 0 && prev === 0) starts.push(k * DT);
      prev = w;
    }
    const gaps = starts.slice(1).map((t, i) => t - starts[i]!);
    const doubles = gaps.filter((g) => g < 0.5).length;
    const singles = gaps.filter((g) => g >= 0.5);
    expect(Math.min(...singles)).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(Math.max(...singles)).toBeLessThanOrEqual(8.4);
    expect(doubles / starts.length).toBeGreaterThan(0.05);
    expect(doubles / starts.length).toBeLessThan(0.25);
  });

  it("breathes at the set rate", () => {
    const br = new Breath(seededRng(2), 15);
    let cycles = 0;
    let prev = br.update(DT).phase;
    for (let k = 0; k < 60 * 120; k++) {
      const p = br.update(DT).phase;
      if (p < prev) cycles++;
      prev = p;
    }
    expect(cycles).toBeGreaterThanOrEqual(27);
    expect(cycles).toBeLessThanOrEqual(33);
  });
});

describe("gestures", () => {
  it("points with apex at 1.37 s and a continuous arm weight", () => {
    let prev = 0;
    let apexAt = -1;
    let worst = 0;
    for (let t = 0; t <= POINT_TIMING.end + 0.1; t += DT) {
      const p = pointGesture(t);
      if (p.apex && apexAt < 0) apexAt = t;
      worst = Math.max(worst, Math.abs(p.weight - prev));
      prev = p.weight;
    }
    expect(apexAt).toBeGreaterThanOrEqual(1.37 - 1e-9);
    expect(apexAt).toBeLessThan(1.37 + DT + 1e-9);
    expect(worst).toBeLessThan(0.06);
    expect(pointGesture(1.37).weight).toBeCloseTo(1, 5);
    expect(pointGesture(POINT_TIMING.end).done).toBe(true);
    expect(pointGesture(POINT_TIMING.end).weight).toBe(0);
  });

  it("reaches farther targets more slowly and returns to rest", () => {
    const rng = seededRng(4);
    const near = planReach(0.1, rng);
    const far = planReach(0.6, rng);
    expect(far.duration).toBeGreaterThan(near.duration);
    expect(reachWeight(far.duration, far)).toBeCloseTo(1, 5);
    expect(reachWeight(far.duration + far.hold + far.retract, far)).toBeCloseTo(0, 12);
  });

  it("plans throws with ordered phases, repeatable for a seed", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e6 }), fc.double({ min: 0, max: 1, noNaN: true }), (seed, effort) => {
        const p = planThrow(effort, seededRng(seed));
        const q = planThrow(effort, seededRng(seed));
        expect(q).toEqual(p);
        return p.stride < p.cock && p.cock < p.release && p.release < p.decel && p.decel < p.T && Math.abs(p.T - 1.05 / (0.8 + 0.4 * p.effort)) < 1e-9;
      }),
      { numRuns: 100 },
    );
    const p = planThrow(0.8, seededRng(9));
    expect(throwPose(p, p.release - 1e-3).released).toBe(false);
    expect(throwPose(p, p.release).released).toBe(true);
    const end = throwPose(p, p.T);
    expect(end.done).toBe(true);
    expect(end.pelvis).toBeCloseTo(0);
    expect(end.shoulder).toBeCloseTo(2 * Math.PI);
  });

  it("schedules idle changes about every 20 s and stops when the body moves", () => {
    const s = new IdleScheduler(seededRng(8));
    let changes = 0;
    let faces = 0;
    const hours = 2;
    for (let k = 0; k < hours * 3600 * 10; k++) {
      const st = s.update(0.1, true);
      for (const e of st.started) {
        if (e.kind === "faceTouch") faces++;
        else changes++;
      }
    }
    const perMinute = changes / (hours * 60);
    expect(perMinute).toBeGreaterThan(2.4);
    expect(perMinute).toBeLessThan(3.6);
    expect(faces / hours).toBeGreaterThan(14);
    expect(faces / hours).toBeLessThan(32);
    const moving = s.update(0.1, false);
    expect(moving.active).toEqual([]);
    expect(moving.shift).toBe(0);
  });
});

/** A synthetic clip: bone b turns about Y by f(t) radians. */
function synthClip(name: string, bones: number, frames: number, fps: number, f: (b: number, t: number) => number, loop = true): Clip {
  const rotations = new Float32Array(frames * bones * 4);
  for (let i = 0; i < frames; i++) {
    for (let b = 0; b < bones; b++) {
      const a = f(b, i / fps);
      const o = (i * bones + b) * 4;
      rotations[o + 1] = Math.sin(a / 2);
      rotations[o + 3] = Math.cos(a / 2);
    }
  }
  return { name, fps, frames, bones, loop, rotations };
}

const yawOf = (r: Float32Array, b: number) => 2 * Math.atan2(r[b * 4 + 1]!, r[b * 4 + 3]!);

describe("clip player", () => {
  it("one clip's root never leaks into another clip's seam blend", () => {
    const drift = (b: number, t: number) => 0.15 * t + 0.02 * Math.sin(t * 3) * (b + 1);
    const moving = synthClip("walk", 2, 61, 30, drift);
    moving.root = new Float32Array(61 * 3).map((_, i) => (i % 3 === 1 ? 1 : i * 0.05));
    const still = synthClip("idle", 2, 61, 30, drift);
    const out = createPose(2);
    sampleLoop(still, planLoop(still), 1.9, out);
    const alone = Array.from(out.root);
    sampleLoop(moving, planLoop(moving), 1.9, createPose(2));
    const after = createPose(2);
    sampleLoop(still, planLoop(still), 1.9, after);
    expect(Array.from(after.root)).toEqual(alone);
  });

  it("blends a loop seam so the wrap step matches an ordinary frame step", () => {
    // a drift of 0.3 rad over 2 s: first and last frames differ by about 17 degrees
    const c = synthClip("idle", 2, 61, 30, (b, t) => 0.15 * t + 0.02 * Math.sin(t * 3) * (b + 1));
    expect(seamDegrees(c)).toBeGreaterThan(15);
    const plan = planLoop(c);
    expect(plan.blend).toBeCloseTo(0.4);
    const pose = createPose(2);
    const prev = createPose(2);
    let worstSeam = 0;
    let worstBody = 0;
    const d = clipDuration(c);
    for (let k = 1; k < 60 * 7; k++) {
      sampleLoop(c, plan, (k - 1) * DT, prev);
      sampleLoop(c, plan, k * DT, pose);
      const step = quatAngle(pose.rotations, 0, prev.rotations, 0);
      const t = k * DT;
      const ct = t < d ? t : plan.restart + ((t - d) % (d - plan.restart));
      if (t > d && Math.abs(ct - plan.restart) < 2 * DT) worstSeam = Math.max(worstSeam, step);
      else worstBody = Math.max(worstBody, step);
    }
    // without the blend the wrap would jump by the full 0.3 rad seam
    expect(worstSeam).toBeLessThan(0.02);
    expect(worstBody).toBeLessThan(0.03);
  });

  it("hands a one shot back to the idle and emits ended and handback", () => {
    const idle = synthClip("idle", 3, 31, 30, () => 0);
    const wave = synthClip("wave", 3, 31, 30, () => 1, false);
    const p = new ClipPlayer({ idle });
    const ticket = p.play(wave, { fade: 0.12 });
    const events: string[] = [];
    let peak = 0;
    let last = 0;
    let worst = 0;
    for (let k = 0; k < 120; k++) {
      const pose = p.update(DT);
      for (const e of p.events) events.push(`${e.type}:${e.ticket}`);
      const y = yawOf(pose.rotations, 1);
      peak = Math.max(peak, y);
      worst = Math.max(worst, Math.abs(y - last));
      last = y;
    }
    expect(peak).toBeCloseTo(1, 3);
    expect(last).toBeCloseTo(0, 6);
    expect(events).toEqual([`started:${ticket}`, `ended:${ticket}`, "handback:0"]);
    expect(p.layerWeight("body")).toBe(0);
    // fades in and out over 0.12 s, so no frame jumps the whole radian
    expect(worst).toBeLessThan(0.3);
  });

  it("holds the last frame until release when hold is Infinity", () => {
    const idle = synthClip("idle", 1, 31, 30, () => 0);
    const sit = synthClip("sit", 1, 16, 30, () => 0.8, false);
    const p = new ClipPlayer({ idle });
    p.play(sit, { hold: Infinity });
    for (let k = 0; k < 300; k++) p.update(DT);
    expect(yawOf(p.pose.rotations, 0)).toBeCloseTo(0.8, 4);
    p.release();
    for (let k = 0; k < 30; k++) p.update(DT);
    expect(yawOf(p.pose.rotations, 0)).toBeCloseTo(0, 4);
  });

  it("makes a background loop wait for a running one shot", () => {
    const idle = synthClip("idle", 1, 31, 30, () => 0);
    const shot = synthClip("bow", 1, 31, 30, () => 0.5, false);
    const talk = synthClip("talk", 1, 31, 30, () => -0.4, true);
    const p = new ClipPlayer({ idle });
    p.play(shot);
    p.play(talk, { background: true });
    const seen: string[] = [];
    for (let k = 0; k < 40; k++) {
      p.update(DT);
      for (const e of p.events) if (e.type === "started") seen.push(e.name);
    }
    // halfway through the bow, only the bow has started
    expect(seen).toEqual(["bow"]);
    for (let k = 0; k < 60; k++) {
      p.update(DT);
      for (const e of p.events) if (e.type === "started") seen.push(e.name);
    }
    expect(seen).toEqual(["bow", "talk"]);
    expect(yawOf(p.pose.rotations, 0)).toBeCloseTo(-0.4, 3);
  });

  it("writes the upper layer only onto its masked bones", () => {
    const idle = synthClip("idle", 3, 31, 30, () => 0);
    const wave = synthClip("wave", 3, 31, 30, () => 0.7, true);
    const p = new ClipPlayer({ idle, upperBones: [2] });
    p.play(wave, { layer: "upper" });
    for (let k = 0; k < 30; k++) p.update(DT);
    expect(yawOf(p.pose.rotations, 0)).toBeCloseTo(0, 6);
    expect(yawOf(p.pose.rotations, 1)).toBeCloseTo(0, 6);
    expect(yawOf(p.pose.rotations, 2)).toBeCloseTo(0.7, 4);
  });

  it("matches cadence between walk and jog by a shared phase", () => {
    const idle = synthClip("idle", 1, 31, 30, () => 0);
    // one stride each: walk 1.0 s, jog 0.6 s; bone yaw is the stride phase
    const walk = synthClip("walk", 1, 31, 30, (_b, t) => 0.5 * Math.sin((2 * Math.PI * t) / 1.0));
    const jog = synthClip("jog", 1, 19, 30, (_b, t) => 0.5 * Math.sin((2 * Math.PI * t) / 0.6));
    const p = new ClipPlayer({ idle, locomotion: [{ clip: walk, speed: 1.2 }, { clip: jog, speed: 2.6 }] });
    p.setLocomotion(1.9);
    let worst = 0;
    let last = 0;
    for (let k = 0; k < 600; k++) {
      const y = yawOf(p.update(DT).rotations, 0);
      if (k > 120) worst = Math.max(worst, Math.abs(y - last));
      last = y;
    }
    // blending two strides out of phase would cancel or stutter; in phase the step stays small (computed)
    expect(worst).toBeLessThan(0.07);
  });
});

describe("head level", () => {
  it("lifts a slumped idle head by up to 10 degrees and lets nods pass", () => {
    const h = new HeadLevel();
    let lift = 0;
    const nod: number[] = [];
    for (let k = 0; k < 60 * 10; k++) {
      const t = k * DT;
      // 15 degrees down, with a 3 Hz nod of 4 degrees
      const pitch = -15 * DEG + 4 * DEG * Math.sin(2 * Math.PI * 3 * t);
      lift = h.update(DT, pitch);
      if (k > 60 * 8) nod.push(pitch + lift);
    }
    expect(lift).toBeCloseTo(10 * DEG, 2);
    const amp = (Math.max(...nod) - Math.min(...nod)) / 2;
    expect(amp).toBeGreaterThan(3.5 * DEG);
  });

  it("applies the lift to a pose about the parent X axis", () => {
    const pose = createPose(1);
    const a = -15 * DEG;
    // head pitched 15 degrees down: rotation about +X by +15 degrees
    pose.rotations.set([Math.sin(-a / 2), 0, 0, Math.cos(-a / 2)]);
    expect(quatPitch(pose.rotations, 0)).toBeCloseTo(a, 6);
    const h = new HeadLevel();
    let lift = 0;
    for (let k = 0; k < 600; k++) {
      pose.rotations.set([Math.sin(-a / 2), 0, 0, Math.cos(-a / 2)]);
      lift = h.apply(DT, pose, 0);
    }
    expect(quatPitch(pose.rotations, 0)).toBeCloseTo(a + lift, 6);
  });
});
