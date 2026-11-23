//! The dot product and the dense layers built on it.
//!
//! Summation order is fixed: sixteen running sums, element i going to sum
//! i mod 16, then a fixed tree. On wasm32 with SIMD128 the sixteen sums are
//! four f32x4 registers; elsewhere they are a plain array. Lane wise f32
//! multiply and add round the same way as scalar f32 multiply and add, and
//! Rust never fuses them, so the two builds give the same bits.

const LANES: usize = 16;

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
fn body(a: &[f32], b: &[f32], acc: &mut [f32; LANES]) -> usize {
    use core::arch::wasm32::*;
    let n = a.len() / LANES * LANES;
    let mut v = [f32x4_splat(0.0); 4];
    let (pa, pb) = (a.as_ptr(), b.as_ptr());
    let mut i = 0;
    while i < n {
        for q in 0..4 {
            // SAFETY: i + 4q + 3 < n <= a.len() == b.len(); v128_load allows any alignment
            let (x, y) = unsafe {
                (
                    v128_load(pa.add(i + 4 * q) as *const v128),
                    v128_load(pb.add(i + 4 * q) as *const v128),
                )
            };
            v[q] = f32x4_add(v[q], f32x4_mul(x, y));
        }
        i += LANES;
    }
    for q in 0..4 {
        acc[4 * q] = f32x4_extract_lane::<0>(v[q]);
        acc[4 * q + 1] = f32x4_extract_lane::<1>(v[q]);
        acc[4 * q + 2] = f32x4_extract_lane::<2>(v[q]);
        acc[4 * q + 3] = f32x4_extract_lane::<3>(v[q]);
    }
    n
}

#[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
fn body(a: &[f32], b: &[f32], acc: &mut [f32; LANES]) -> usize {
    let n = a.len() / LANES * LANES;
    for (ca, cb) in a[..n].chunks_exact(LANES).zip(b[..n].chunks_exact(LANES)) {
        for l in 0..LANES {
            acc[l] += ca[l] * cb[l];
        }
    }
    n
}

/// Sum of a[i] b[i] in the fixed order described above.
#[inline]
pub fn dot(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len());
    let mut acc = [0.0f32; LANES];
    let n = body(a, b, &mut acc);
    for i in n..a.len() {
        acc[i - n] += a[i] * b[i];
    }
    let mut s = [0.0f32; 4];
    for j in 0..4 {
        s[j] = ((acc[j] + acc[4 + j]) + acc[8 + j]) + acc[12 + j];
    }
    (s[0] + s[1]) + (s[2] + s[3])
}

/// y = W x + b for a row major W of `rows` by `x.len()`. `b` may be empty.
pub fn matvec(w: &[f32], b: &[f32], x: &[f32], y: &mut [f32]) {
    let cols = x.len();
    for (o, yo) in y.iter_mut().enumerate() {
        let d = dot(&w[o * cols..(o + 1) * cols], x);
        *yo = if b.is_empty() { d } else { d + b[o] };
    }
}

/// The same layer applied to `n` inputs stored one after another in `xs`;
/// each weight row is read once for all of them.
pub fn matmul(w: &[f32], b: &[f32], xs: &[f32], n: usize, ys: &mut [f32]) {
    let cols = xs.len() / n;
    let rows = ys.len() / n;
    for o in 0..rows {
        let row = &w[o * cols..(o + 1) * cols];
        for k in 0..n {
            ys[k * rows + o] = dot(row, &xs[k * cols..(k + 1) * cols]) + b[o];
        }
    }
}

pub fn elu(v: &mut [f32]) {
    for x in v {
        if *x <= 0.0 {
            *x = libm::expm1f(*x);
        }
    }
}

/// Softmax over each consecutive group of `g` entries.
pub fn group_softmax(v: &mut [f32], g: usize) {
    for grp in v.chunks_exact_mut(g) {
        let m = grp.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let mut s = 0.0f32;
        for x in grp.iter_mut() {
            *x = libm::expf(*x - m);
            s += *x;
        }
        for x in grp.iter_mut() {
            *x /= s;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dot_matches_a_double_sum() {
        for n in [0usize, 1, 7, 16, 17, 339, 1363] {
            let a: alloc::vec::Vec<f32> =
                (0..n).map(|i| ((i * 37 % 11) as f32 - 5.0) * 0.1).collect();
            let b: alloc::vec::Vec<f32> =
                (0..n).map(|i| ((i * 13 % 7) as f32 - 3.0) * 0.2).collect();
            let want: f64 = a.iter().zip(&b).map(|(x, y)| *x as f64 * *y as f64).sum();
            assert!((dot(&a, &b) as f64 - want).abs() < 1e-4, "n {n}");
        }
    }

    #[test]
    fn softmax_groups_sum_to_one() {
        let mut v = [1.0f32, 2.0, 3.0, 4.0, -50.0, 0.0, 50.0, 0.0];
        group_softmax(&mut v, 4);
        assert!((v[..4].iter().sum::<f32>() - 1.0).abs() < 1e-6);
        assert!((v[4..].iter().sum::<f32>() - 1.0).abs() < 1e-6);
        assert!(v[6] > 0.999);
    }
}
