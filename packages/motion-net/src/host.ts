// The message host that runs a CPU model. The same function runs inside a
// worker and, when the page refuses blob workers, in the page behind a
// zero delay hop, so both paths speak one protocol.
import { createCpuModel, type Accumulation, type CpuModel } from "./cpu.js";
import type { NetManifest } from "./manifest.js";

export type HostRequest =
  | { t: "load"; manifest: NetManifest; weights: ArrayBuffer; accum: Accumulation }
  | { t: "run"; id: number; input: Float32Array; frames: number }
  | { t: "dispose" };

export type HostReply =
  | { t: "ready"; bytes: number }
  | { t: "error"; id?: number; message: string }
  | { t: "out"; id: number; out: Float32Array; ms: number };

export type Post = (m: HostReply, transfer?: Transferable[]) => void;

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** A handler for host requests; replies go to `post`. `ready` loads the wasm first. */
export function createHost(post: Post, ready: () => Promise<void>): (m: HostRequest) => Promise<void> {
  let model: CpuModel | null = null;
  return async (m) => {
    try {
      if (m.t === "load") {
        await ready();
        model?.dispose();
        model = createCpuModel(m.manifest, m.weights, m.accum);
        post({ t: "ready", bytes: model.bytes });
      } else if (m.t === "run") {
        if (!model) throw new Error("motion-net: run before load");
        const t0 = now();
        const out = model.run(m.input, m.frames);
        post({ t: "out", id: m.id, out, ms: now() - t0 }, [out.buffer]);
      } else {
        model?.dispose();
        model = null;
      }
    } catch (e) {
      const reply: HostReply = { t: "error", message: e instanceof Error ? e.message : String(e) };
      if (m.t === "run") reply.id = m.id;
      post(reply);
    }
  };
}
