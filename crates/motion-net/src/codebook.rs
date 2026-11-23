//! Codebook matching with a FiLM decoder, written from the published
//! description of the architecture (Starke et al., codebook matching for
//! character control):
//!
//! - x is the normalized input.
//! - The estimator, three dense layers with ELU between them, maps x to
//!   `latent` logits read as `latent / group` groups; a softmax per group
//!   gives a soft code.
//! - The denoiser, the same shape over `[code, x]`, refines the code a
//!   fixed number of times.
//! - The decoder, three FiLM dense layers over `[code, x]`, is conditioned
//!   on a normalized time per output frame: each layer scales and shifts
//!   its input by affine functions of t before its dense product, so one
//!   pass gives every frame of the sequence.
//! - Outputs are denormalized per value.
//!
//! The first decoder layer sees the same `[code, x]` for every frame and
//! its FiLM terms are affine in t, so its product splits into two matrix
//! vector products, `W (sb z + hb) + b` and `t W (sw z + hw)`, shared by
//! every frame. `frames` below the sequence length skips the later frames.
//!
//! Tensor names follow the layout of the weight files this runs:
//! `estimator.l{1,2,3}`, `denoiser.l{1,2,3}`, `decoder.l{1,2,3}.linear`,
//! `decoder.l{1,2,3}.film.{scale,shift}.{weight,bias}`, `input_stats`,
//! `output_stats`, `time_stats` and `timing`.

use crate::kernels::{Accum, Activation, dot_acc, matvec, matvec_batch, softmax_groups};
use crate::mlp::{Dense, Stats};
use crate::store::Store;
use alloc::string::String;
use alloc::vec::Vec;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CodebookDims {
    pub input: usize,
    pub latent: usize,
    /// Values per codebook group (the softmax width).
    pub group: usize,
    pub iterations: usize,
    /// Frames per output sequence.
    pub frames: usize,
    pub output: usize,
}

#[derive(Clone, Debug)]
struct Film {
    sw: Vec<f32>,
    sb: Vec<f32>,
    hw: Vec<f32>,
    hb: Vec<f32>,
    dense: Dense,
}

impl Film {
    fn take(store: &mut Store, name: &str, rows: usize, cols: usize) -> Result<Film, String> {
        let f = |s: &mut Store, k: &str| s.take(&alloc::format!("{name}.film.{k}"), cols);
        Ok(Film {
            sw: f(store, "scale.weight")?,
            sb: f(store, "scale.bias")?,
            hw: f(store, "shift.weight")?,
            hb: f(store, "shift.bias")?,
            dense: Dense::take(store, &alloc::format!("{name}.linear"), rows, cols, true)?,
        })
    }
    /// `z = (sw t + sb) y + hw t + hb`, one frame.
    fn modulate(&self, t: f32, y: &[f32], z: &mut [f32]) {
        let t = t as f64;
        for i in 0..z.len() {
            z[i] = ((self.sw[i] as f64 * t + self.sb[i] as f64) * y[i] as f64
                + self.hw[i] as f64 * t
                + self.hb[i] as f64) as f32;
        }
    }
}

#[derive(Clone, Debug)]
pub struct Codebook {
    pub dims: CodebookDims,
    pub accum: Accum,
    estimator: [Dense; 3],
    denoiser: [Dense; 3],
    decoder: [Film; 3],
    input: Stats,
    output: Stats,
    /// Normalized time per frame.
    times: Vec<f32>,
    x: Vec<f32>,
    h1: Vec<f32>,
    h2: Vec<f32>,
    code: Vec<f32>,
    cat: Vec<f32>,
    u: Vec<f32>,
    v: Vec<f32>,
    a: Vec<f32>,
    c: Vec<f32>,
    y1: Vec<f32>,
    z: Vec<f32>,
    y2: Vec<f32>,
}

impl Codebook {
    pub fn from_store(
        store: &mut Store,
        dims: CodebookDims,
        accum: Accum,
    ) -> Result<Codebook, String> {
        let CodebookDims {
            input: n,
            latent: h,
            frames: s,
            output: o,
            group,
            ..
        } = dims;
        if group == 0 || h % group != 0 {
            return Err(String::from(
                "codebook: latent size must be a multiple of the group size",
            ));
        }
        let c = h + n;
        let mlp = |st: &mut Store, k: &str, first: usize| -> Result<[Dense; 3], String> {
            Ok([
                Dense::take(st, &alloc::format!("{k}.l1"), h, first, true)?,
                Dense::take(st, &alloc::format!("{k}.l2"), h, h, true)?,
                Dense::take(st, &alloc::format!("{k}.l3"), h, h, true)?,
            ])
        };
        let estimator = mlp(store, "estimator", n)?;
        let denoiser = mlp(store, "denoiser", c)?;
        let decoder = [
            Film::take(store, "decoder.l1", h, c)?,
            Film::take(store, "decoder.l2", h, h)?,
            Film::take(store, "decoder.l3", o, h)?,
        ];
        let input = Stats::take(store, "input_stats", n)?;
        let output = Stats::take(store, "output_stats", o)?;
        let tm = store.take("time_stats.mean", 1)?[0] as f64;
        let ts = store.take("time_stats.std", 1)?[0] as f64;
        let times = store
            .take("timing", s)?
            .iter()
            .map(|t| ((*t as f64 - tm) / ts) as f32)
            .collect();
        let z = alloc::vec![0.0f32; s * h];
        Ok(Codebook {
            dims,
            accum,
            estimator,
            denoiser,
            decoder,
            input,
            output,
            times,
            x: alloc::vec![0.0; n],
            h1: alloc::vec![0.0; h],
            h2: alloc::vec![0.0; h],
            code: alloc::vec![0.0; h],
            cat: alloc::vec![0.0; c],
            u: alloc::vec![0.0; c],
            v: alloc::vec![0.0; c],
            a: alloc::vec![0.0; h],
            c: alloc::vec![0.0; h],
            y1: z.clone(),
            z: z.clone(),
            y2: z,
        })
    }

    /// The soft code after the last refinement.
    pub fn code(&self) -> &[f32] {
        &self.code
    }

    /// Multiply adds for one run decoding `frames` frames (computed).
    pub fn macs(&self, frames: usize) -> usize {
        let e: usize = self.estimator.iter().map(Dense::macs).sum();
        let d: usize = self.denoiser.iter().map(Dense::macs).sum();
        e + d * self.dims.iterations
            + 2 * self.decoder[0].dense.macs()
            + frames * (self.decoder[1].dense.macs() + self.decoder[2].dense.macs())
    }

    fn refine(&mut self, net: usize) {
        let acc = self.accum;
        let (layers, src_cat) = if net == 0 {
            (&self.estimator, false)
        } else {
            (&self.denoiser, true)
        };
        let src: &[f32] = if src_cat { &self.cat } else { &self.x };
        layers[0].run(src, &mut self.h1, Activation::Elu, acc);
        layers[1].run(&self.h1, &mut self.h2, Activation::Elu, acc);
        layers[2].run(&self.h2, &mut self.code, Activation::None, acc);
        softmax_groups(&mut self.code, self.dims.group);
        let h = self.dims.latent;
        self.cat[..h].copy_from_slice(&self.code);
        self.cat[h..].copy_from_slice(&self.x);
    }

    /// Runs the network on one raw input; returns `frames` frames of
    /// `output` values, frame after frame.
    pub fn run(&mut self, input: &[f32], frames: usize) -> Vec<f32> {
        let CodebookDims {
            latent: h,
            output: o,
            iterations,
            ..
        } = self.dims;
        let s = frames.clamp(1, self.dims.frames);
        let acc = self.accum;
        self.input.normalize(input, &mut self.x);
        self.refine(0);
        for _ in 0..iterations {
            self.refine(1);
        }
        // decoder layer 1, split by linearity in t
        let l1 = &self.decoder[0];
        for i in 0..self.cat.len() {
            let z = self.cat[i] as f64;
            self.u[i] = (l1.sb[i] as f64 * z + l1.hb[i] as f64) as f32;
            self.v[i] = (l1.sw[i] as f64 * z + l1.hw[i] as f64) as f32;
        }
        let cols = self.cat.len();
        matvec(
            &l1.dense.w,
            h,
            cols,
            &self.u,
            l1.dense.b.as_deref(),
            &mut self.a,
            Activation::None,
            acc,
        );
        for r in 0..h {
            self.c[r] = dot_acc(&l1.dense.w[r * cols..r * cols + cols], &self.v, 0.0, acc) as f32;
        }
        for f in 0..s {
            let t = self.times[f] as f64;
            for r in 0..h {
                self.y1[f * h + r] =
                    Activation::Elu.apply64(self.a[r] as f64 + t * self.c[r] as f64) as f32;
            }
        }
        // layers 2 and 3
        for f in 0..s {
            self.decoder[1].modulate(
                self.times[f],
                &self.y1[f * h..f * h + h],
                &mut self.z[f * h..f * h + h],
            );
        }
        let l2 = &self.decoder[1].dense;
        matvec_batch(
            &l2.w,
            h,
            h,
            &self.z,
            s,
            l2.b.as_deref(),
            &mut self.y2,
            h,
            Activation::Elu,
            acc,
        );
        for f in 0..s {
            self.decoder[2].modulate(
                self.times[f],
                &self.y2[f * h..f * h + h],
                &mut self.z[f * h..f * h + h],
            );
        }
        let mut out = alloc::vec![0.0f32; s * o];
        let l3 = &self.decoder[2].dense;
        matvec_batch(
            &l3.w,
            o,
            h,
            &self.z,
            s,
            l3.b.as_deref(),
            &mut out,
            o,
            Activation::None,
            acc,
        );
        self.output.denormalize(&mut out);
        out
    }
}
