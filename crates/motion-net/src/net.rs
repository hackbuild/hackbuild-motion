//! The network: tensor slots filled by manifest key, then the forward pass.
//!
//! Forward pass, for a raw input u:
//! 1. x = (u - mean) / std.
//! 2. p0 = GroupSoftmax(E3 ELU(E2 ELU(E1 x + e1) + e2) + e3).
//! 3. Three refinement passes with shared weights on [p; x].
//! 4. Decode [p; x] at each of the 16 frame times through three layers
//!    whose input is scaled and shifted by affine functions of time.
//! 5. y = v * out_std + out_mean.
//!
//! The first decoder layer sees the same [p; x] at every frame time, and
//! its scale and shift are affine in t, so its output is affine in t too:
//! D1 ((a t + b) c + (g t + d)) + d1 = (D1 (b c + d) + d1) + t D1 (a c + g).
//! Two matrix products replace sixteen. Layers 2 and 3 take a different
//! input per frame and run as one batched product over the 16 frames.

use crate::half::{decode_f16, decode_f32};
use crate::kernels::{elu, group_softmax, matmul, matvec};
use alloc::vec;
use alloc::vec::Vec;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Dims {
    pub d_in: usize,
    pub d_out: usize,
    /// Hidden width and code length.
    pub hidden: usize,
    /// Entries per categorical group.
    pub group: usize,
    /// Predicted frames per evaluation.
    pub frames: usize,
    /// Refinement passes.
    pub passes: usize,
}

impl Dims {
    /// The published quadruped network.
    pub const QUADRUPED: Dims = Dims {
        d_in: 339,
        d_out: 412,
        hidden: 1024,
        group: 4,
        frames: 16,
        passes: 3,
    };
    pub fn cat(&self) -> usize {
        self.hidden + self.d_in
    }
    pub fn valid(&self) -> bool {
        self.d_in > 0
            && self.d_out > 0
            && self.group > 0
            && self.hidden > 0
            && self.hidden.is_multiple_of(self.group)
            && self.frames > 0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Dtype {
    F16,
    F32,
}

impl Dtype {
    pub fn size(self) -> usize {
        match self {
            Dtype::F16 => 2,
            Dtype::F32 => 4,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SetError {
    /// The key names no tensor this network reads (style poses, for one).
    Unused,
    /// The element count differs from the one the dimensions imply.
    Count { want: usize, got: usize },
    /// Fewer bytes than count times the element size.
    Short,
}

/// Slot ids in a fixed order; `KEYS[i]` is the manifest key of slot i.
const KEYS: [&str; 36] = [
    "estimator.l1.weight",
    "estimator.l1.bias",
    "estimator.l2.weight",
    "estimator.l2.bias",
    "estimator.l3.weight",
    "estimator.l3.bias",
    "denoiser.l1.weight",
    "denoiser.l1.bias",
    "denoiser.l2.weight",
    "denoiser.l2.bias",
    "denoiser.l3.weight",
    "denoiser.l3.bias",
    "decoder.l1.linear.weight",
    "decoder.l1.linear.bias",
    "decoder.l2.linear.weight",
    "decoder.l2.linear.bias",
    "decoder.l3.linear.weight",
    "decoder.l3.linear.bias",
    "decoder.l1.film.scale.weight",
    "decoder.l1.film.scale.bias",
    "decoder.l1.film.shift.weight",
    "decoder.l1.film.shift.bias",
    "decoder.l2.film.scale.weight",
    "decoder.l2.film.scale.bias",
    "decoder.l2.film.shift.weight",
    "decoder.l2.film.shift.bias",
    "decoder.l3.film.scale.weight",
    "decoder.l3.film.scale.bias",
    "decoder.l3.film.shift.weight",
    "decoder.l3.film.shift.bias",
    "input_stats.mean",
    "input_stats.std",
    "output_stats.mean",
    "output_stats.std",
    "time_stats.mean",
    "time_stats.std",
];
const TIMING: usize = 36;
const SLOTS: usize = 37;

pub fn tensor_keys() -> impl Iterator<Item = &'static str> {
    KEYS.iter().copied().chain(core::iter::once("timing"))
}

/// Scratch buffers for one forward pass, sized once.
pub struct Workspace {
    x: Vec<f32>,
    cat: Vec<f32>,
    h1: Vec<f32>,
    h2: Vec<f32>,
    base: Vec<f32>,
    slope: Vec<f32>,
    zs: Vec<f32>,
    ins: Vec<f32>,
    vs: Vec<f32>,
}

impl Workspace {
    pub fn new(d: &Dims) -> Self {
        let f = d.frames;
        Workspace {
            x: vec![0.0; d.d_in],
            cat: vec![0.0; d.cat()],
            h1: vec![0.0; d.hidden],
            h2: vec![0.0; d.hidden],
            base: vec![0.0; d.hidden],
            slope: vec![0.0; d.hidden],
            zs: vec![0.0; f * d.hidden],
            ins: vec![0.0; f * d.cat().max(d.hidden)],
            vs: vec![0.0; f * d.d_out],
        }
    }
}

/// Outputs of one evaluation.
pub struct Prediction {
    /// The code estimate before refinement, `hidden` long.
    pub code0: Vec<f32>,
    /// The refined code.
    pub code: Vec<f32>,
    /// `frames` rows of `d_out` denormalized values.
    pub frames: Vec<f32>,
}

impl Prediction {
    pub fn new(d: &Dims) -> Self {
        Prediction {
            code0: vec![0.0; d.hidden],
            code: vec![0.0; d.hidden],
            frames: vec![0.0; d.frames * d.d_out],
        }
    }
}

pub struct Network {
    pub dims: Dims,
    t: [Vec<f32>; SLOTS],
}

impl Network {
    pub fn new(dims: Dims) -> Self {
        Network {
            dims,
            t: core::array::from_fn(|_| Vec::new()),
        }
    }

    fn slot(key: &str) -> Option<usize> {
        if key == "timing" {
            return Some(TIMING);
        }
        KEYS.iter().position(|k| *k == key)
    }

    /// Element count the dimensions imply for a slot.
    fn want(&self, slot: usize) -> usize {
        let d = &self.dims;
        let (h, c) = (d.hidden, d.cat());
        match slot {
            0 => h * d.d_in,
            2 | 4 | 8 | 10 | 14 => h * h,
            6 | 12 => h * c,
            16 => d.d_out * h,
            17 => d.d_out,
            1 | 3 | 5 | 7 | 9 | 11 | 13 | 15 => h,
            18..=21 => c,
            22..=29 => h,
            30 | 31 => d.d_in,
            32 | 33 => d.d_out,
            34 | 35 => 1,
            TIMING => d.frames,
            _ => 0,
        }
    }

    /// Expected element count for a manifest key, or None when unused.
    pub fn expected_count(&self, key: &str) -> Option<usize> {
        Self::slot(key).map(|s| self.want(s))
    }

    /// Fills the tensor `key` from little endian bytes.
    pub fn set(
        &mut self,
        key: &str,
        dtype: Dtype,
        count: usize,
        bytes: &[u8],
    ) -> Result<(), SetError> {
        let s = Self::slot(key).ok_or(SetError::Unused)?;
        let want = self.want(s);
        if count != want {
            return Err(SetError::Count { want, got: count });
        }
        if bytes.len() < count * dtype.size() {
            return Err(SetError::Short);
        }
        let mut v = vec![0.0f32; count];
        match dtype {
            Dtype::F16 => decode_f16(&bytes[..count * 2], &mut v),
            Dtype::F32 => decode_f32(&bytes[..count * 4], &mut v),
        }
        self.t[s] = v;
        Ok(())
    }

    /// Fills a tensor from values already in f32.
    pub fn set_values(&mut self, key: &str, values: Vec<f32>) -> Result<(), SetError> {
        let s = Self::slot(key).ok_or(SetError::Unused)?;
        let want = self.want(s);
        if values.len() != want {
            return Err(SetError::Count {
                want,
                got: values.len(),
            });
        }
        self.t[s] = values;
        Ok(())
    }

    /// The first key not yet filled, or None when the network can run.
    pub fn missing(&self) -> Option<&'static str> {
        (0..SLOTS)
            .find(|&s| self.t[s].len() != self.want(s))
            .map(|s| if s == TIMING { "timing" } else { KEYS[s] })
    }

    fn mlp3(
        &self,
        first: usize,
        input: &[f32],
        ws_h1: &mut [f32],
        ws_h2: &mut [f32],
        out: &mut [f32],
    ) {
        let t = &self.t;
        matvec(&t[first], &t[first + 1], input, ws_h1);
        elu(ws_h1);
        matvec(&t[first + 2], &t[first + 3], ws_h1, ws_h2);
        elu(ws_h2);
        matvec(&t[first + 4], &t[first + 5], ws_h2, out);
        group_softmax(out, self.dims.group);
    }

    /// One evaluation. `u` is the raw input, `d_in` long. Panics when a
    /// tensor is missing; check [`Network::missing`] first.
    pub fn forward(&self, u: &[f32], ws: &mut Workspace, out: &mut Prediction) {
        assert!(self.missing().is_none(), "motion-net: tensors missing");
        let d = self.dims;
        let (h, c, f) = (d.hidden, d.cat(), d.frames);
        let t = &self.t;
        for i in 0..d.d_in {
            ws.x[i] = (u[i] - t[30][i]) / t[31][i];
        }
        let Workspace {
            x,
            cat,
            h1,
            h2,
            base,
            slope,
            zs,
            ins,
            vs,
        } = ws;
        self.mlp3(0, x, h1, h2, &mut out.code0);
        cat[h..].copy_from_slice(x);
        cat[..h].copy_from_slice(&out.code0);
        for _ in 0..d.passes {
            self.mlp3(6, cat, h1, h2, &mut out.code);
            cat[..h].copy_from_slice(&out.code);
        }
        if d.passes == 0 {
            out.code.copy_from_slice(&out.code0);
        }
        // decoder layer 1, affine in t
        let (sa, sb, ga, gb) = (&t[18], &t[19], &t[20], &t[21]);
        let ins_c = &mut ins[..c];
        for i in 0..c {
            ins_c[i] = sb[i] * cat[i] + gb[i];
        }
        matvec(&t[12], &t[13], ins_c, base);
        for i in 0..c {
            ins_c[i] = sa[i] * cat[i] + ga[i];
        }
        matvec(&t[12], &[], ins_c, slope);
        let times: Vec<f32> = (0..f)
            .map(|k| (t[TIMING][k] - t[34][0]) / t[35][0])
            .collect();
        for k in 0..f {
            let z = &mut zs[k * h..(k + 1) * h];
            for i in 0..h {
                z[i] = base[i] + times[k] * slope[i];
            }
            elu(z);
        }
        // decoder layer 2
        self.film(22, &times, zs, &mut ins[..f * h]);
        matmul(&t[14], &t[15], &ins[..f * h], f, zs);
        elu(zs);
        // decoder layer 3
        self.film(26, &times, zs, &mut ins[..f * h]);
        matmul(&t[16], &t[17], &ins[..f * h], f, vs);
        let (om, os) = (&t[32], &t[33]);
        for k in 0..f {
            for i in 0..d.d_out {
                out.frames[k * d.d_out + i] = vs[k * d.d_out + i] * os[i] + om[i];
            }
        }
    }

    /// (a t + b) z + (g t + d) for every frame.
    fn film(&self, first: usize, times: &[f32], zs: &[f32], out: &mut [f32]) {
        let n = self.dims.hidden;
        let t = &self.t;
        let (sa, sb, ga, gb) = (&t[first], &t[first + 1], &t[first + 2], &t[first + 3]);
        for (k, tk) in times.iter().enumerate() {
            for i in 0..n {
                let j = k * n + i;
                out[j] = (sa[i] * tk + sb[i]) * zs[j] + (ga[i] * tk + gb[i]);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::golden::random_network;

    /// The forward pass written plainly from the equations, in f64, one
    /// frame at a time with no affine split of the first decoder layer.
    fn reference(net: &Network, u: &[f32]) -> Vec<f64> {
        let d = net.dims;
        let t: Vec<Vec<f64>> = net
            .t
            .iter()
            .map(|v| v.iter().map(|x| *x as f64).collect())
            .collect();
        let lin = |w: &[f64], b: Option<&[f64]>, x: &[f64], rows: usize| -> Vec<f64> {
            (0..rows)
                .map(|o| {
                    let s: f64 = (0..x.len()).map(|i| w[o * x.len() + i] * x[i]).sum();
                    s + b.map_or(0.0, |b| b[o])
                })
                .collect()
        };
        let elu = |v: Vec<f64>| -> Vec<f64> {
            v.into_iter()
                .map(|z| if z > 0.0 { z } else { libm::exp(z) - 1.0 })
                .collect()
        };
        let gs = |v: Vec<f64>| -> Vec<f64> {
            let mut o = v.clone();
            for g in o.chunks_mut(d.group) {
                let m = g.iter().copied().fold(f64::MIN, f64::max);
                let s: f64 = g.iter().map(|z| libm::exp(z - m)).sum();
                for z in g.iter_mut() {
                    *z = libm::exp(*z - m) / s;
                }
            }
            o
        };
        let mlp = |f: usize, x: &[f64]| -> Vec<f64> {
            let a = elu(lin(&t[f], Some(&t[f + 1]), x, d.hidden));
            let b = elu(lin(&t[f + 2], Some(&t[f + 3]), &a, d.hidden));
            gs(lin(&t[f + 4], Some(&t[f + 5]), &b, d.hidden))
        };
        let x: Vec<f64> = (0..d.d_in)
            .map(|i| (u[i] as f64 - t[30][i]) / t[31][i])
            .collect();
        let mut p = mlp(0, &x);
        for _ in 0..d.passes {
            let c: Vec<f64> = p.iter().chain(&x).copied().collect();
            p = mlp(6, &c);
        }
        let c: Vec<f64> = p.iter().chain(&x).copied().collect();
        let mut out = Vec::new();
        for k in 0..d.frames {
            let tk = (t[TIMING][k] - t[34][0]) / t[35][0];
            let m = |j: usize, z: &[f64], rows: usize| -> Vec<f64> {
                let f = 18 + 4 * j;
                let zz: Vec<f64> = (0..z.len())
                    .map(|i| (t[f][i] * tk + t[f + 1][i]) * z[i] + (t[f + 2][i] * tk + t[f + 3][i]))
                    .collect();
                lin(&t[12 + 2 * j], Some(&t[13 + 2 * j]), &zz, rows)
            };
            let z1 = elu(m(0, &c, d.hidden));
            let z2 = elu(m(1, &z1, d.hidden));
            let v = m(2, &z2, d.d_out);
            out.extend((0..d.d_out).map(|i| v[i] * t[33][i] + t[32][i]));
        }
        out
    }

    #[test]
    fn matches_a_plain_double_precision_evaluation() {
        let dims = Dims {
            d_in: 23,
            d_out: 19,
            hidden: 32,
            group: 4,
            frames: 16,
            passes: 3,
        };
        let (net, u) = random_network(dims, 7);
        let mut ws = Workspace::new(&dims);
        let mut p = Prediction::new(&dims);
        net.forward(&u, &mut ws, &mut p);
        let want = reference(&net, &u);
        let mut worst: f64 = 0.0;
        for (a, b) in p.frames.iter().zip(&want) {
            worst = worst.max((*a as f64 - b).abs() / b.abs().max(1.0));
        }
        assert!(worst < 1e-5, "{worst}");
    }

    #[test]
    fn rejects_wrong_counts_and_reports_missing() {
        let mut n = Network::new(Dims::QUADRUPED);
        assert_eq!(n.missing(), Some("estimator.l1.weight"));
        assert_eq!(
            n.set("guidance.Trot", Dtype::F32, 81, &[0; 324]),
            Err(SetError::Unused)
        );
        assert_eq!(
            n.set("timing", Dtype::F32, 15, &[0; 60]),
            Err(SetError::Count { want: 16, got: 15 })
        );
        assert_eq!(
            n.set("timing", Dtype::F32, 16, &[0; 60]),
            Err(SetError::Short)
        );
        assert_eq!(n.expected_count("denoiser.l1.weight"), Some(1024 * 1363));
        assert_eq!(n.expected_count("decoder.l1.film.scale.weight"), Some(1363));
    }
}
