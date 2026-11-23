//! A seeded random network for the native and wasm agreement test. Linear
//! weights go in as binary16 bytes and everything else as binary32 bytes,
//! so the test covers the loader as well as the kernels.

use crate::half::f16_to_f32;
use crate::net::{Dims, Dtype, Network, Prediction, Workspace, tensor_keys};
use crate::rng::Lcg;
use alloc::vec::Vec;

/// Small dimensions with a hidden width that is not a multiple of 16 on the
/// input side, so the kernel tails run too.
pub const GOLDEN_DIMS: Dims = Dims {
    d_in: 23,
    d_out: 19,
    hidden: 40,
    group: 4,
    frames: 16,
    passes: 3,
};

/// Truncating binary32 to binary16 for normal values; small values go to
/// zero. Test data only.
fn to_f16_bits(v: f32) -> u16 {
    let b = v.to_bits();
    let sign = ((b >> 16) & 0x8000) as u16;
    let e = ((b >> 23) & 0xff) as i32 - 112;
    if e <= 0 {
        return sign;
    }
    sign | ((e.min(30) as u16) << 10) | ((b >> 13) & 0x3ff) as u16
}

pub fn random_network(dims: Dims, seed: u32) -> (Network, Vec<f32>) {
    let mut r = Lcg::new(seed);
    let mut net = Network::new(dims);
    for key in tensor_keys() {
        let n = net.expected_count(key).unwrap();
        let mut sym = |s: f64| ((r.next_f64() * 2.0 - 1.0) * s) as f32;
        let (dtype, bytes): (Dtype, Vec<u8>) = if key.ends_with("weight") && !key.contains("film") {
            let cols = n / if key.starts_with("decoder.l3") {
                dims.d_out
            } else {
                dims.hidden
            };
            let s = 1.5 / libm::sqrt(cols as f64);
            (
                Dtype::F16,
                (0..n)
                    .flat_map(|_| to_f16_bits(sym(s)).to_le_bytes())
                    .collect(),
            )
        } else {
            let v: Vec<f32> = match key {
                "input_stats.std" | "output_stats.std" => {
                    (0..n).map(|_| 0.2 + sym(1.0).abs()).collect()
                }
                "time_stats.mean" => alloc::vec![0.25],
                "time_stats.std" => alloc::vec![0.153_7],
                "timing" => (0..n).map(|k| k as f32 / 30.0).collect(),
                _ if key.contains("film.scale.bias") => (0..n).map(|_| 1.0 + sym(0.3)).collect(),
                _ => (0..n).map(|_| sym(0.3)).collect(),
            };
            (Dtype::F32, v.iter().flat_map(|x| x.to_le_bytes()).collect())
        };
        net.set(key, dtype, n, &bytes).unwrap();
    }
    let u = (0..dims.d_in)
        .map(|_| (r.next_f64() * 2.0 - 1.0) as f32)
        .collect();
    (net, u)
}

/// Every output of two evaluations on the golden network, then the
/// binary16 decode of a spread of bit patterns.
pub fn trace(seed: u32) -> Vec<f64> {
    let d = GOLDEN_DIMS;
    let (net, u) = random_network(d, seed);
    let mut ws = Workspace::new(&d);
    let mut p = Prediction::new(&d);
    let mut out = Vec::new();
    let u2: Vec<f32> = u.iter().map(|x| x * -0.7 + 0.1).collect();
    for inp in [&u, &u2] {
        net.forward(inp, &mut ws, &mut p);
        out.extend(p.code0.iter().map(|x| *x as f64));
        out.extend(p.code.iter().map(|x| *x as f64));
        out.extend(p.frames.iter().map(|x| *x as f64));
    }
    out.extend((0..=0xffffu32).step_by(257).map(|h| {
        let v = f16_to_f32(h as u16);
        // JSON has no infinity or NaN
        if v.is_finite() { v as f64 } else { -1.0 }
    }));
    out
}
