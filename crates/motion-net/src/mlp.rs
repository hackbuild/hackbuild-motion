//! A stack of dense layers with an activation each and optional input and
//! output normalization: `y = act(W x + b)` per layer.

use crate::kernels::{Accum, Activation, matvec};
use crate::store::Store;
use alloc::string::String;
use alloc::vec::Vec;

#[derive(Clone, Debug)]
pub struct Dense {
    pub w: Vec<f32>,
    pub b: Option<Vec<f32>>,
    pub rows: usize,
    pub cols: usize,
}

impl Dense {
    /// Takes `<name>.weight` (rows by cols) and `<name>.bias` when present.
    pub fn take(
        store: &mut Store,
        name: &str,
        rows: usize,
        cols: usize,
        bias: bool,
    ) -> Result<Dense, String> {
        let w = store.take(&alloc::format!("{name}.weight"), rows * cols)?;
        let b = if bias {
            Some(store.take(&alloc::format!("{name}.bias"), rows)?)
        } else {
            None
        };
        Ok(Dense { w, b, rows, cols })
    }
    pub fn run(&self, x: &[f32], y: &mut [f32], act: Activation, accum: Accum) {
        matvec(
            &self.w,
            self.rows,
            self.cols,
            x,
            self.b.as_deref(),
            y,
            act,
            accum,
        );
    }
    pub fn macs(&self) -> usize {
        self.rows * self.cols
    }
}

/// Mean and standard deviation per value.
#[derive(Clone, Debug)]
pub struct Stats {
    pub mean: Vec<f32>,
    pub std: Vec<f32>,
}

impl Stats {
    pub fn take(store: &mut Store, name: &str, n: usize) -> Result<Stats, String> {
        Ok(Stats {
            mean: store.take(&alloc::format!("{name}.mean"), n)?,
            std: store.take(&alloc::format!("{name}.std"), n)?,
        })
    }
    pub fn normalize(&self, x: &[f32], out: &mut [f32]) {
        for i in 0..out.len() {
            out[i] = ((x[i] as f64 - self.mean[i] as f64) / self.std[i] as f64) as f32;
        }
    }
    pub fn denormalize(&self, y: &mut [f32]) {
        let n = self.mean.len();
        for (k, v) in y.iter_mut().enumerate() {
            let i = k % n;
            *v = (*v as f64 * self.std[i] as f64 + self.mean[i] as f64) as f32;
        }
    }
}

#[derive(Clone, Debug)]
pub struct Mlp {
    pub layers: Vec<(Dense, Activation)>,
    pub input: Option<Stats>,
    pub output: Option<Stats>,
    pub accum: Accum,
    a: Vec<f32>,
    b: Vec<f32>,
}

impl Mlp {
    /// Layers `<prefix>0`, `<prefix>1` and on, with sizes `dims[i]` to
    /// `dims[i + 1]`; stats from `input_stats` and `output_stats` when
    /// `stats` is set.
    pub fn from_store(
        store: &mut Store,
        prefix: &str,
        dims: &[usize],
        acts: &[Activation],
        stats: bool,
        accum: Accum,
    ) -> Result<Mlp, String> {
        if dims.len() < 2 || acts.len() + 1 != dims.len() {
            return Err(String::from("mlp: need one activation per layer"));
        }
        let mut layers = Vec::new();
        for i in 0..acts.len() {
            layers.push((
                Dense::take(
                    store,
                    &alloc::format!("{prefix}{i}"),
                    dims[i + 1],
                    dims[i],
                    true,
                )?,
                acts[i],
            ));
        }
        let (input, output) = if stats {
            (
                Some(Stats::take(store, "input_stats", dims[0])?),
                Some(Stats::take(store, "output_stats", dims[dims.len() - 1])?),
            )
        } else {
            (None, None)
        };
        let widest = dims.iter().copied().max().unwrap_or(0);
        Ok(Mlp {
            layers,
            input,
            output,
            accum,
            a: alloc::vec![0.0; widest],
            b: alloc::vec![0.0; widest],
        })
    }

    pub fn input_dim(&self) -> usize {
        self.layers.first().map_or(0, |l| l.0.cols)
    }
    pub fn output_dim(&self) -> usize {
        self.layers.last().map_or(0, |l| l.0.rows)
    }

    pub fn run(&mut self, x: &[f32]) -> Vec<f32> {
        let n = self.input_dim();
        match &self.input {
            Some(s) => s.normalize(&x[..n], &mut self.a[..n]),
            None => self.a[..n].copy_from_slice(&x[..n]),
        }
        let mut cur = n;
        for (layer, act) in &self.layers {
            layer.run(&self.a[..cur], &mut self.b[..layer.rows], *act, self.accum);
            cur = layer.rows;
            core::mem::swap(&mut self.a, &mut self.b);
        }
        let mut y = self.a[..cur].to_vec();
        if let Some(s) = &self.output {
            s.denormalize(&mut y);
        }
        y
    }
}
