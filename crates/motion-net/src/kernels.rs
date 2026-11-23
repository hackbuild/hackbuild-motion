//! Dense kernels. Every dot product keeps four partial sums by index modulo
//! four, starts the first with the bias, adds a tail to the first, and
//! reduces left to right. The wasm build does this with SIMD128 lanes and
//! the native build with scalars, so the two give the same bits. Products
//! of two f32 are exact in f64, so f64 accumulation only rounds at the sums.

/// Accumulator width for dot products.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Accum {
    /// f32 partial sums: about twice the speed of f64 on wasm (inferred).
    F32,
    /// f64 partial sums, one rounding to f32 per output.
    F64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Activation {
    None,
    /// x for x > 0, exp(x) - 1 otherwise.
    Elu,
    Relu,
    Tanh,
}

impl Activation {
    pub fn from_code(c: u8) -> Activation {
        match c {
            1 => Activation::Elu,
            2 => Activation::Relu,
            3 => Activation::Tanh,
            _ => Activation::None,
        }
    }
    #[inline]
    pub fn apply64(self, x: f64) -> f64 {
        match self {
            Activation::None => x,
            Activation::Elu => {
                if x > 0.0 {
                    x
                } else {
                    libm::exp(x) - 1.0
                }
            }
            Activation::Relu => x.max(0.0),
            Activation::Tanh => libm::tanh(x),
        }
    }
    #[inline]
    pub fn apply32(self, x: f32) -> f32 {
        match self {
            Activation::None => x,
            Activation::Elu => {
                if x > 0.0 {
                    x
                } else {
                    libm::expf(x) - 1.0
                }
            }
            Activation::Relu => x.max(0.0),
            Activation::Tanh => libm::tanhf(x),
        }
    }
}

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
mod lanes {
    use core::arch::wasm32::*;

    #[inline]
    fn load(s: &[f32], i: usize) -> v128 {
        debug_assert!(i + 4 <= s.len());
        // SAFETY: i + 4 <= len, and wasm loads may be unaligned.
        unsafe { v128_load(s.as_ptr().add(i) as *const v128) }
    }

    #[inline]
    pub fn dot64(w: &[f32], x: &[f32], init: f64) -> f64 {
        let n = w.len().min(x.len());
        let n4 = n & !3;
        let mut lo = f64x2(init, 0.0);
        let mut hi = f64x2(0.0, 0.0);
        let mut i = 0;
        while i < n4 {
            let a = load(w, i);
            let b = load(x, i);
            let ah = i32x4_shuffle::<2, 3, 0, 1>(a, a);
            let bh = i32x4_shuffle::<2, 3, 0, 1>(b, b);
            lo = f64x2_add(
                lo,
                f64x2_mul(f64x2_promote_low_f32x4(a), f64x2_promote_low_f32x4(b)),
            );
            hi = f64x2_add(
                hi,
                f64x2_mul(f64x2_promote_low_f32x4(ah), f64x2_promote_low_f32x4(bh)),
            );
            i += 4;
        }
        let mut a0 = f64x2_extract_lane::<0>(lo);
        for k in n4..n {
            a0 += w[k] as f64 * x[k] as f64;
        }
        a0 + f64x2_extract_lane::<1>(lo) + f64x2_extract_lane::<0>(hi) + f64x2_extract_lane::<1>(hi)
    }

    #[inline]
    pub fn dot32(w: &[f32], x: &[f32], init: f32) -> f32 {
        let n = w.len().min(x.len());
        let n4 = n & !3;
        let mut acc = f32x4(init, 0.0, 0.0, 0.0);
        let mut i = 0;
        while i < n4 {
            acc = f32x4_add(acc, f32x4_mul(load(w, i), load(x, i)));
            i += 4;
        }
        let mut a0 = f32x4_extract_lane::<0>(acc);
        for k in n4..n {
            a0 += w[k] * x[k];
        }
        a0 + f32x4_extract_lane::<1>(acc)
            + f32x4_extract_lane::<2>(acc)
            + f32x4_extract_lane::<3>(acc)
    }
}

#[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
mod lanes {
    #[inline]
    pub fn dot64(w: &[f32], x: &[f32], init: f64) -> f64 {
        let n = w.len().min(x.len());
        let n4 = n & !3;
        let (mut a0, mut a1, mut a2, mut a3) = (init, 0.0f64, 0.0f64, 0.0f64);
        for (a, b) in w[..n4]
            .as_chunks::<4>()
            .0
            .iter()
            .zip(x[..n4].as_chunks::<4>().0)
        {
            a0 += a[0] as f64 * b[0] as f64;
            a1 += a[1] as f64 * b[1] as f64;
            a2 += a[2] as f64 * b[2] as f64;
            a3 += a[3] as f64 * b[3] as f64;
        }
        for k in n4..n {
            a0 += w[k] as f64 * x[k] as f64;
        }
        a0 + a1 + a2 + a3
    }

    #[inline]
    pub fn dot32(w: &[f32], x: &[f32], init: f32) -> f32 {
        let n = w.len().min(x.len());
        let n4 = n & !3;
        let (mut a0, mut a1, mut a2, mut a3) = (init, 0.0f32, 0.0f32, 0.0f32);
        for (a, b) in w[..n4]
            .as_chunks::<4>()
            .0
            .iter()
            .zip(x[..n4].as_chunks::<4>().0)
        {
            a0 += a[0] * b[0];
            a1 += a[1] * b[1];
            a2 += a[2] * b[2];
            a3 += a[3] * b[3];
        }
        for k in n4..n {
            a0 += w[k] * x[k];
        }
        a0 + a1 + a2 + a3
    }
}

pub use lanes::{dot32, dot64};

/// One output before rounding, in f64, so callers that add more terms in
/// f64 (a FiLM split) round once.
#[inline]
pub fn dot_acc(w: &[f32], x: &[f32], init: f64, accum: Accum) -> f64 {
    match accum {
        Accum::F64 => dot64(w, x, init),
        Accum::F32 => dot32(w, x, init as f32) as f64,
    }
}

/// `y[o * stride] = act(b[o] + W[o] . x)` for a row major `rows` by `cols`
/// matrix.
pub fn matvec(
    w: &[f32],
    rows: usize,
    cols: usize,
    x: &[f32],
    bias: Option<&[f32]>,
    y: &mut [f32],
    act: Activation,
    accum: Accum,
) {
    for o in 0..rows {
        let row = &w[o * cols..o * cols + cols];
        let b = bias.map_or(0.0, |b| b[o]);
        y[o] = match accum {
            Accum::F64 => act.apply64(dot64(row, &x[..cols], b as f64)) as f32,
            Accum::F32 => act.apply32(dot32(row, &x[..cols], b)),
        };
    }
}

/// `matvec` over `n` inputs laid end to end, each row read once for all of
/// them. Output `s` starts at `s * y_stride`.
pub fn matvec_batch(
    w: &[f32],
    rows: usize,
    cols: usize,
    x: &[f32],
    n: usize,
    bias: Option<&[f32]>,
    y: &mut [f32],
    y_stride: usize,
    act: Activation,
    accum: Accum,
) {
    for o in 0..rows {
        let row = &w[o * cols..o * cols + cols];
        let b = bias.map_or(0.0, |b| b[o]);
        for s in 0..n {
            let xs = &x[s * cols..s * cols + cols];
            y[s * y_stride + o] = match accum {
                Accum::F64 => act.apply64(dot64(row, xs, b as f64)) as f32,
                Accum::F32 => act.apply32(dot32(row, xs, b)),
            };
        }
    }
}

/// Softmax over consecutive groups of `g` values. Each exponential is kept
/// as f32 and the sum in f64, then each value is divided by the sum.
pub fn softmax_groups(p: &mut [f32], g: usize) {
    for grp in p.chunks_mut(g) {
        let m = grp.iter().copied().fold(f32::NEG_INFINITY, f32::max) as f64;
        let mut s = 0.0f64;
        for v in grp.iter_mut() {
            let e = libm::exp(*v as f64 - m);
            *v = e as f32;
            s += e;
        }
        for v in grp.iter_mut() {
            *v = (*v as f64 / s) as f32;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dot_matches_a_plain_sum() {
        let w: alloc::vec::Vec<f32> = (0..1363)
            .map(|i| ((i * 37 % 101) as f32 - 50.0) / 64.0)
            .collect();
        let x: alloc::vec::Vec<f32> = (0..1363)
            .map(|i| ((i * 13 % 89) as f32 - 44.0) / 32.0)
            .collect();
        let plain: f64 = w
            .iter()
            .zip(&x)
            .map(|(a, b)| *a as f64 * *b as f64)
            .sum::<f64>()
            + 0.25;
        assert!((dot64(&w, &x, 0.25) - plain).abs() < 1e-9);
        assert!((dot32(&w, &x, 0.25) as f64 - plain).abs() < 1e-2);
    }

    #[test]
    fn softmax_groups_sum_to_one() {
        let mut p = [1.0f32, 2.0, 3.0, 4.0, -1.0, 0.0, 0.0, 9.0];
        softmax_groups(&mut p, 4);
        for g in p.chunks(4) {
            assert!((g.iter().sum::<f32>() - 1.0).abs() < 1e-6);
        }
        assert!(p[3] > p[2] && p[7] > 0.99);
    }

    #[test]
    fn batch_equals_one_at_a_time() {
        let w: alloc::vec::Vec<f32> = (0..24).map(|i| i as f32 * 0.1 - 1.0).collect();
        let x: alloc::vec::Vec<f32> = (0..18).map(|i| (i as f32 * 0.7).sin()).collect();
        let b = [0.1f32, -0.2, 0.3, 0.0];
        let mut y = [0.0f32; 12];
        matvec_batch(
            &w,
            4,
            6,
            &x,
            3,
            Some(&b),
            &mut y,
            4,
            Activation::Elu,
            Accum::F64,
        );
        for s in 0..3 {
            let mut one = [0.0f32; 4];
            matvec(
                &w,
                4,
                6,
                &x[s * 6..s * 6 + 6],
                Some(&b),
                &mut one,
                Activation::Elu,
                Accum::F64,
            );
            assert_eq!(&y[s * 4..s * 4 + 4], &one);
        }
    }
}
