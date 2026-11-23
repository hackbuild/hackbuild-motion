//! A small seeded network for the native and wasm agreement test, and the
//! same builder for tests that need a codebook net without a weight file.

use crate::codebook::{Codebook, CodebookDims};
use crate::kernels::{Accum, Activation};
use crate::mlp::Mlp;
use crate::store::Store;
use alloc::vec::Vec;

/// Mulberry32, the family's seeded stream.
pub struct Stream(u32);

impl Stream {
    pub fn new(seed: u32) -> Self {
        Stream(seed)
    }
    pub fn uniform(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b_79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
    }
    pub fn values(&mut self, n: usize, scale: f64) -> Vec<f32> {
        (0..n)
            .map(|_| ((self.uniform() - 0.5) * 2.0 * scale) as f32)
            .collect()
    }
}

pub const SMALL: CodebookDims = CodebookDims {
    input: 13,
    latent: 16,
    group: 4,
    iterations: 2,
    frames: 5,
    output: 7,
};

/// A store holding every tensor a codebook net of `d` needs, seeded.
pub fn codebook_store(d: CodebookDims, seed: u32) -> Store {
    let mut r = Stream::new(seed);
    let mut st = Store::new();
    let (n, h, o) = (d.input, d.latent, d.output);
    let c = n + h;
    let dense = |st: &mut Store, r: &mut Stream, name: &str, rows: usize, cols: usize| {
        let k = 1.0 / libm::sqrt(cols as f64);
        st.insert_f32(
            &alloc::format!("{name}.weight"),
            r.values(rows * cols, 1.7 * k),
            alloc::vec![rows, cols],
        );
        st.insert_f32(
            &alloc::format!("{name}.bias"),
            r.values(rows, 0.1),
            alloc::vec![rows],
        );
    };
    for (net, first) in [("estimator", n), ("denoiser", c)] {
        dense(&mut st, &mut r, &alloc::format!("{net}.l1"), h, first);
        dense(&mut st, &mut r, &alloc::format!("{net}.l2"), h, h);
        dense(&mut st, &mut r, &alloc::format!("{net}.l3"), h, h);
    }
    for (i, rows, cols) in [(1, h, c), (2, h, h), (3, o, h)] {
        for k in ["scale", "shift"] {
            let base = if k == "scale" { 1.0 } else { 0.0 };
            let w: Vec<f32> = r.values(cols, 0.2);
            let b: Vec<f32> = r.values(cols, 0.2).iter().map(|v| v + base).collect();
            st.insert_f32(
                &alloc::format!("decoder.l{i}.film.{k}.weight"),
                w,
                alloc::vec![cols, 1],
            );
            st.insert_f32(
                &alloc::format!("decoder.l{i}.film.{k}.bias"),
                b,
                alloc::vec![cols],
            );
        }
        dense(
            &mut st,
            &mut r,
            &alloc::format!("decoder.l{i}.linear"),
            rows,
            cols,
        );
    }
    let stats = |st: &mut Store, r: &mut Stream, name: &str, k: usize| {
        st.insert_f32(
            &alloc::format!("{name}.mean"),
            r.values(k, 0.5),
            alloc::vec![k],
        );
        st.insert_f32(
            &alloc::format!("{name}.std"),
            r.values(k, 0.4).iter().map(|v| v + 1.0).collect(),
            alloc::vec![k],
        );
    };
    stats(&mut st, &mut r, "input_stats", n);
    stats(&mut st, &mut r, "output_stats", o);
    st.insert_f32("time_stats.mean", alloc::vec![0.25], alloc::vec![1]);
    st.insert_f32("time_stats.std", alloc::vec![0.15], alloc::vec![1]);
    st.insert_f32(
        "timing",
        (0..d.frames)
            .map(|i| i as f32 / (d.frames - 1).max(1) as f32 * 0.5)
            .collect(),
        alloc::vec![d.frames],
    );
    st
}

/// A store for an mlp `13 -> 24 -> 24 -> 6` named `layer0` to `layer2`.
pub fn mlp_store(seed: u32) -> Store {
    let mut r = Stream::new(seed);
    let mut st = Store::new();
    for (i, (cols, rows)) in [(13usize, 24usize), (24, 24), (24, 6)].iter().enumerate() {
        st.insert_f32(
            &alloc::format!("layer{i}.weight"),
            r.values(rows * cols, 0.5),
            alloc::vec![*rows, *cols],
        );
        st.insert_f32(
            &alloc::format!("layer{i}.bias"),
            r.values(*rows, 0.1),
            alloc::vec![*rows],
        );
    }
    st
}

pub const MLP_ACTS: [Activation; 3] = [Activation::Elu, Activation::Tanh, Activation::None];

/// The agreement trace: both accumulators of the small codebook net and
/// an mlp over seeded inputs, every output widened to f64.
pub fn trace(seed: u32) -> Vec<f64> {
    let mut out = Vec::new();
    let mut r = Stream::new(seed ^ 0x9e37_79b9);
    for accum in [Accum::F64, Accum::F32] {
        let mut st = codebook_store(SMALL, seed);
        let mut net = Codebook::from_store(&mut st, SMALL, accum).expect("small codebook");
        for k in 0..3 {
            let x = r.values(SMALL.input, 1.0 + k as f64);
            out.extend(net.run(&x, SMALL.frames - k).iter().map(|v| *v as f64));
        }
        let mut st = mlp_store(seed);
        let mut mlp = Mlp::from_store(&mut st, "layer", &[13, 24, 24, 6], &MLP_ACTS, false, accum)
            .expect("small mlp");
        for _ in 0..3 {
            let x = r.values(13, 2.0);
            out.extend(mlp.run(&x).iter().map(|v| *v as f64));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decoding_fewer_frames_gives_the_same_leading_frames() {
        let mut st = codebook_store(SMALL, 3);
        let mut net = Codebook::from_store(&mut st, SMALL, Accum::F64).unwrap();
        let x = Stream::new(4).values(SMALL.input, 1.0);
        let all = net.run(&x, SMALL.frames);
        let two = net.run(&x, 2);
        assert_eq!(&all[..2 * SMALL.output], &two[..]);
    }

    #[test]
    fn split_first_layer_equals_per_frame_film() {
        // the split by linearity in t against FiLM applied frame by frame
        let d = SMALL;
        let mut st = codebook_store(d, 5);
        let w = st.get("decoder.l1.linear.weight").unwrap().data.clone();
        let b = st.get("decoder.l1.linear.bias").unwrap().data.clone();
        let g = |k: &str| {
            st.get(&alloc::format!("decoder.l1.film.{k}"))
                .unwrap()
                .data
                .clone()
        };
        let (sw, sb, hw, hb) = (
            g("scale.weight"),
            g("scale.bias"),
            g("shift.weight"),
            g("shift.bias"),
        );
        let cols = d.input + d.latent;
        let z: Vec<f32> = Stream::new(6).values(cols, 1.0);
        for t in [-1.3f64, 0.0, 0.7] {
            for r in 0..d.latent {
                let direct: f64 = (0..cols)
                    .map(|i| {
                        w[r * cols + i] as f64
                            * ((sw[i] as f64 * t + sb[i] as f64) * z[i] as f64
                                + hw[i] as f64 * t
                                + hb[i] as f64)
                    })
                    .sum::<f64>()
                    + b[r] as f64;
                let a: f64 = (0..cols)
                    .map(|i| w[r * cols + i] as f64 * (sb[i] as f64 * z[i] as f64 + hb[i] as f64))
                    .sum::<f64>()
                    + b[r] as f64;
                let c: f64 = (0..cols)
                    .map(|i| w[r * cols + i] as f64 * (sw[i] as f64 * z[i] as f64 + hw[i] as f64))
                    .sum();
                assert!((direct - (a + t * c)).abs() < 1e-12);
            }
        }
        let _ = Codebook::from_store(&mut st, d, Accum::F64).unwrap();
    }

    #[test]
    fn codes_are_soft_one_hot_per_group() {
        let mut st = codebook_store(SMALL, 8);
        let mut net = Codebook::from_store(&mut st, SMALL, Accum::F64).unwrap();
        let x = Stream::new(9).values(SMALL.input, 1.0);
        let _ = net.run(&x, 1);
        for g in net_code(&net).chunks(SMALL.group) {
            assert!((g.iter().map(|v| *v as f64).sum::<f64>() - 1.0).abs() < 1e-6);
        }
    }

    fn net_code(n: &Codebook) -> Vec<f32> {
        n.code().to_vec()
    }

    #[test]
    fn f32_accumulation_stays_close_to_f64() {
        let mut st = codebook_store(SMALL, 10);
        let mut a = Codebook::from_store(&mut st, SMALL, Accum::F64).unwrap();
        let mut st = codebook_store(SMALL, 10);
        let mut b = Codebook::from_store(&mut st, SMALL, Accum::F32).unwrap();
        let x = Stream::new(11).values(SMALL.input, 1.0);
        let (ya, yb) = (a.run(&x, 5), b.run(&x, 5));
        let worst = ya
            .iter()
            .zip(&yb)
            .map(|(p, q)| (p - q).abs())
            .fold(0.0f32, f32::max);
        assert!(worst < 1e-4, "{worst}");
    }

    #[test]
    fn missing_tensors_are_named() {
        let mut st = codebook_store(SMALL, 1);
        let _ = st.take("denoiser.l2.bias", SMALL.latent);
        let e = Codebook::from_store(&mut st, SMALL, Accum::F64).unwrap_err();
        assert!(e.contains("denoiser.l2.bias"), "{e}");
    }
}
