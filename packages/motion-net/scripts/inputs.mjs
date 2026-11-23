// Parity inputs for the quadruped codebook network: seeded, so the
// committed code regenerates them and no vector is committed. Values sit in
// the range of root local positions and velocities (meters, m/s).
export const PARITY_SEED = 20261122;
export const PARITY_CASES = 4;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `cases` input vectors of length `dim`; case 0 is all zeros. */
export function parityInputs(dim, cases = PARITY_CASES, seed = PARITY_SEED) {
  const rng = mulberry32(seed);
  const out = [];
  for (let c = 0; c < cases; c++) {
    const x = new Float32Array(dim);
    if (c > 0) for (let i = 0; i < dim; i++) x[i] = (rng() - 0.5) * c * 0.6;
    out.push(x);
  }
  return out;
}
