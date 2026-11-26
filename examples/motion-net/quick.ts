import { loadWeights, Predictor, QuadrupedHost } from "@hackbuild/motion-net";

// the weights are not in this package: give their urls as ?manifest=<url>&bin=<url>
const q = new URLSearchParams(location.search);
const manifest = q.get("manifest");
const bin = q.get("bin");
if (!manifest || !bin) throw new Error("give the weight urls as ?manifest=<url>&bin=<url>");
// onLicence gets the weights' own licence line (non commercial) before anything runs
const weights = await loadWeights({ manifest, bin, onLicence: (line) => document.body.append(line) });
const predictor = await Predictor.create(weights); // a blob worker, or the page when workers are refused
const host = new QuadrupedHost(predictor, weights.styles);

let last = performance.now();
function frame(now: number) {
  const root = host.update((now - last) / 1000, { speed: 1.2, turnRate: 0.3 });
  last = now;
  document.title = `${root.speed.toFixed(2)} m/s, ${host.motorState().contacts.filter(Boolean).length} paws down`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
