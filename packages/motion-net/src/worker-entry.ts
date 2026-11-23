// Worker bootstrap, bundled to one script string at build time with the
// wasm inlined, so a page from file:// starts it from a blob.
import { createHost, type HostRequest } from "./host.js";
import { loadWasm } from "./load.js";

const scope = globalThis as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent) => void) | null };
const host = createHost((m, t) => scope.postMessage(m, t ?? []), () => loadWasm());
scope.onmessage = (e: MessageEvent) => void host(e.data as HostRequest);
