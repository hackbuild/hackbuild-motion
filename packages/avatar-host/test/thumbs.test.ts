import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThumbQueue, type ThumbRenderer, tellingTime } from "../src/thumbs.js";
import { placeholderBody } from "../src/three.js";

interface Job {
  id: string;
  fail?: boolean;
}

function setup(extra: { lostAfter?: number } = {}) {
  const drawn: string[] = [];
  const saved: string[] = [];
  const failed: [string, string][] = [];
  const renderers: { disposed: boolean; lost: boolean }[] = [];
  const queue = new ThumbQueue<Job>({
    renderer: async () => {
      const r: ThumbRenderer<Job> & { disposed: boolean; lost: boolean } = {
        disposed: false,
        lost: false,
        async draw(job) {
          drawn.push(job.id);
          if (extra.lostAfter && drawn.length === extra.lostAfter) r.lost = true;
          if (job.fail) throw new Error("the clip moves no bone of this figure.");
          return new Blob([job.id]);
        },
        dispose() {
          r.disposed = true;
        },
      };
      renderers.push(r);
      return r;
    },
    save: async (id) => {
      saved.push(id);
    },
    failed: (id, reason) => failed.push([id, reason]),
    now: () => Date.now(),
    hidden: () => false,
  });
  return { queue, drawn, saved, failed, renderers };
}

const jobs = (...ids: string[]): Job[] => ids.map((id) => ({ id }));

describe("thumb queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts an urgent request ahead of the waiting ones", async () => {
    const { queue, drawn } = setup();
    queue.want(jobs("a", "b", "c"));
    queue.want(jobs("z"), true);
    // a waiting item asked for again as urgent moves up too
    queue.want(jobs("c"), true);
    await vi.runAllTimersAsync();
    expect(drawn).toEqual(["c", "z", "a", "b"]);
  });

  it("tries a clip once per session", async () => {
    const { queue, drawn } = setup();
    queue.want(jobs("a", "b"));
    await vi.runAllTimersAsync();
    queue.want(jobs("a", "b", "c"));
    queue.want(jobs("c"), true);
    await vi.runAllTimersAsync();
    expect(drawn).toEqual(["a", "b", "c"]);
    expect(queue.progress).toEqual({ active: false, done: 1, total: 1 });
  });

  it("empties the queue and disposes the figure after the linger", async () => {
    const { queue, saved, renderers } = setup();
    queue.want(jobs("a", "b"));
    // one rest between the two items, at most 400 ms
    await vi.advanceTimersByTimeAsync(400);
    expect(saved).toEqual(["a", "b"]);
    expect(queue.waiting).toEqual([]);
    expect(renderers).toHaveLength(1);
    expect(queue.holding).toBe(true);
    await vi.advanceTimersByTimeAsync(19_500);
    expect(renderers[0]!.disposed).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(renderers[0]!.disposed).toBe(true);
    expect(queue.holding).toBe(false);
    // a later request builds a new figure
    queue.want(jobs("c"));
    await vi.runAllTimersAsync();
    expect(renderers).toHaveLength(2);
  });

  it("reports a failed render with its reason and keeps going", async () => {
    const { queue, saved, failed } = setup();
    queue.want([{ id: "a" }, { id: "bad", fail: true }, { id: "c" }]);
    await vi.runAllTimersAsync();
    expect(failed).toEqual([["bad", "the clip moves no bone of this figure."]]);
    expect(saved).toEqual(["a", "c"]);
    expect(queue.progress.done).toBe(3);
  });

  it("rebuilds the figure after a lost context", async () => {
    const { queue, renderers, saved } = setup({ lostAfter: 1 });
    queue.want(jobs("a", "b"));
    await vi.runAllTimersAsync();
    expect(saved).toEqual(["a", "b"]);
    expect(renderers).toHaveLength(2);
    expect(renderers[0]!.disposed).toBe(true);
  });

  it("rests between items as long as the last render, inside 40 to 400 ms", async () => {
    const drawn: number[] = [];
    let clock = 0;
    const queue = new ThumbQueue<Job>({
      renderer: async () => ({
        lost: false,
        async draw() {
          drawn.push(Date.now());
          clock += 250;
          return new Blob(["x"]);
        },
        dispose() {},
      }),
      save: async () => {},
      now: () => clock,
      hidden: () => false,
    });
    queue.want(jobs("a", "b"));
    await vi.advanceTimersByTimeAsync(249);
    expect(drawn).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(drawn).toHaveLength(2);
  });

  it("fails every waiting item when no figure can be built", async () => {
    const failed: string[] = [];
    const queue = new ThumbQueue<Job>({
      renderer: async () => {
        throw new Error("no webgl context. previews are off.");
      },
      save: async () => {},
      failed: (id, reason) => failed.push(`${id}: ${reason}`),
      hidden: () => false,
    });
    queue.want(jobs("a", "b"));
    await vi.runAllTimersAsync();
    expect(failed).toEqual(["a: no webgl context. previews are off.", "b: no webgl context. previews are off."]);
  });
});

describe("telling frame", () => {
  it("picks the sampled frame furthest from rest and leaves the figure there", () => {
    const fig = placeholderBody();
    const q = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(deg)).toArray();
    const track = new THREE.QuaternionKeyframeTrack("leftUpperArm.quaternion", [0, 0.6, 1], [...q(0), ...q(-70), ...q(0)]);
    const clip = new THREE.AnimationClip("wave", 1, [track]);
    const t = tellingTime(fig, clip);
    // samples fall every 0.8 / 23 s from 0.1; the one nearest 0.6 wins (computed)
    expect(Math.abs(t - 0.6)).toBeLessThan(0.8 / 23 / 2 + 1e-9);
    expect(fig.bones.leftUpperArm!.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(THREE.MathUtils.degToRad(65));
    expect(tellingTime(placeholderBody(), clip, true)).toBe(1);
  });
});
