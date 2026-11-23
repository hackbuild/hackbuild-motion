//! wasm-bindgen surface. Flat `Float64Array` layouts: rotations are `x y z w`
//! per bone, positions `x y z` per point.

use crate::inertialize::Inertializer;
use crate::math::{Quat, Vec3};
use crate::noise::{Ou, Pink};
use crate::rng::{Mulberry32, Rng, hash_seed};
use crate::spring::{Exp, SpringBank};
use crate::{golden, sample};
use alloc::vec::Vec;
use wasm_bindgen::prelude::*;

fn exp_of(fast: bool) -> Exp {
    if fast { Exp::Fast } else { Exp::Exact }
}

#[wasm_bindgen(js_name = goldenTrace)]
pub fn golden_trace(seed: u32) -> Vec<f64> {
    golden::trace(seed)
}

#[wasm_bindgen(js_name = hashSeed)]
pub fn hash_seed_js(s: &str) -> u32 {
    hash_seed(s)
}

/// Seeded Mulberry32 stream with the samplers on it.
#[wasm_bindgen]
pub struct SeededRng(Mulberry32);

#[wasm_bindgen]
impl SeededRng {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> SeededRng {
        SeededRng(Mulberry32::new(seed))
    }
    pub fn next(&mut self) -> f64 {
        self.0.next_f64()
    }
    pub fn fill(&mut self, out: &mut [f64]) {
        for x in out.iter_mut() {
            *x = self.0.next_f64();
        }
    }
    pub fn gauss(&mut self) -> f64 {
        sample::gauss(&mut self.0)
    }
    #[wasm_bindgen(js_name = exGaussian)]
    pub fn ex_gaussian(&mut self, mu: f64, sigma: f64, tau: f64) -> f64 {
        sample::ex_gaussian(mu, sigma, tau, &mut self.0)
    }
    #[wasm_bindgen(js_name = truncatedPowerLaw)]
    pub fn truncated_power_law(&mut self, min: f64, mu: f64, max: f64) -> f64 {
        sample::truncated_power_law(min, mu, max, &mut self.0)
    }
    #[wasm_bindgen(js_name = vonMises)]
    pub fn von_mises(&mut self, kappa: f64) -> f64 {
        sample::von_mises(kappa, &mut self.0)
    }
    #[wasm_bindgen(js_name = poissonGap)]
    pub fn poisson_gap(&mut self, rate: f64) -> f64 {
        sample::poisson_gap(rate, &mut self.0)
    }
    pub fn gamma(&mut self, k: f64, theta: f64) -> f64 {
        sample::gamma(k, theta, &mut self.0)
    }
    #[wasm_bindgen(js_name = logNormal)]
    pub fn log_normal(&mut self, median: f64, sigma: f64) -> f64 {
        sample::log_normal(median, sigma, &mut self.0)
    }
}

/// Many scalar springs stepped in one call.
#[wasm_bindgen(js_name = SpringBank)]
pub struct WasmSpringBank(SpringBank);

#[wasm_bindgen(js_class = SpringBank)]
impl WasmSpringBank {
    #[wasm_bindgen(constructor)]
    pub fn new(n: usize) -> WasmSpringBank {
        WasmSpringBank(SpringBank::new(n))
    }
    pub fn len(&self) -> usize {
        self.0.x.len()
    }
    #[wasm_bindgen(js_name = isEmpty)]
    pub fn is_empty(&self) -> bool {
        self.0.x.is_empty()
    }
    pub fn positions(&self) -> Vec<f64> {
        self.0.x.clone()
    }
    pub fn velocities(&self) -> Vec<f64> {
        self.0.v.clone()
    }
    #[wasm_bindgen(js_name = setPositions)]
    pub fn set_positions(&mut self, x: &[f64]) {
        let n = self.0.x.len().min(x.len());
        self.0.x[..n].copy_from_slice(&x[..n]);
    }
    /// Steps every spring toward `goals` and writes the positions into `out`.
    pub fn step(&mut self, goals: &[f64], halflife: f64, dt: f64, fast: bool, out: &mut [f64]) {
        self.0.step(goals, halflife, dt, exp_of(fast));
        let n = out.len().min(self.0.x.len());
        out[..n].copy_from_slice(&self.0.x[..n]);
    }
    #[wasm_bindgen(js_name = stepEach)]
    pub fn step_each(
        &mut self,
        goals: &[f64],
        halflives: &[f64],
        dt: f64,
        fast: bool,
        out: &mut [f64],
    ) {
        self.0.step_each(goals, halflives, dt, exp_of(fast));
        let n = out.len().min(self.0.x.len());
        out[..n].copy_from_slice(&self.0.x[..n]);
    }
}

/// Offset inertialization over flat rotation and position arrays.
#[wasm_bindgen(js_name = Inertializer)]
pub struct WasmInertializer {
    inner: Inertializer,
    rot: Vec<Quat>,
    pos: Vec<Vec3>,
}

#[wasm_bindgen(js_class = Inertializer)]
impl WasmInertializer {
    #[wasm_bindgen(constructor)]
    pub fn new(rotations: usize, positions: usize) -> WasmInertializer {
        WasmInertializer {
            inner: Inertializer::new(rotations, positions),
            rot: alloc::vec![Quat::IDENTITY; rotations],
            pos: alloc::vec![Vec3::ZERO; positions],
        }
    }
    pub fn capture(&mut self) {
        self.inner.capture();
    }
    pub fn active(&self) -> bool {
        self.inner.active()
    }
    #[wasm_bindgen(js_name = setFast)]
    pub fn set_fast(&mut self, fast: bool) {
        self.inner.exp = exp_of(fast);
    }
    /// `rot` holds `x y z w` per rotation, `pos` `x y z` per position; both
    /// are read and written in place.
    pub fn apply(&mut self, rot: &mut [f64], pos: &mut [f64], dt: f64, halflife: f64) {
        for (i, q) in self.rot.iter_mut().enumerate() {
            if rot.len() >= i * 4 + 4 {
                *q = Quat::from_slice(&rot[i * 4..]);
            }
        }
        for (i, p) in self.pos.iter_mut().enumerate() {
            if pos.len() >= i * 3 + 3 {
                *p = Vec3::from_slice(&pos[i * 3..]);
            }
        }
        self.inner.apply(&mut self.rot, &mut self.pos, dt, halflife);
        for (i, q) in self.rot.iter().enumerate() {
            if rot.len() >= i * 4 + 4 {
                q.write(&mut rot[i * 4..]);
            }
        }
        for (i, p) in self.pos.iter().enumerate() {
            if pos.len() >= i * 3 + 3 {
                p.write(&mut pos[i * 3..]);
            }
        }
    }
}

/// A bank of OU and pink channels sharing one seeded stream.
#[wasm_bindgen]
pub struct NoiseBank {
    rng: Mulberry32,
    ou: Vec<Ou>,
    pink: Vec<Pink>,
}

#[wasm_bindgen]
impl NoiseBank {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> NoiseBank {
        NoiseBank {
            rng: Mulberry32::new(seed),
            ou: Vec::new(),
            pink: Vec::new(),
        }
    }
    /// Adds an OU channel; returns its index among OU channels.
    #[wasm_bindgen(js_name = addOu)]
    pub fn add_ou(&mut self, tau: f64, sigma: f64, mu: f64) -> usize {
        let o = Ou::with_rng(tau, sigma, mu, &mut self.rng);
        self.ou.push(o);
        self.ou.len() - 1
    }
    /// Adds a pink channel; returns its index among pink channels.
    #[wasm_bindgen(js_name = addPink)]
    pub fn add_pink(&mut self, tau0: f64, octaves: usize) -> usize {
        let p = Pink::new(tau0, octaves, &mut self.rng);
        self.pink.push(p);
        self.pink.len() - 1
    }
    /// Steps every channel: OU channels first, then pink, into `out`.
    pub fn step(&mut self, dt: f64, out: &mut [f64]) {
        let mut i = 0;
        for o in self.ou.iter_mut() {
            let x = o.step(dt, &mut self.rng);
            if i < out.len() {
                out[i] = x;
            }
            i += 1;
        }
        for p in self.pink.iter_mut() {
            let x = p.step(dt, &mut self.rng);
            if i < out.len() {
                out[i] = x;
            }
            i += 1;
        }
    }
    pub fn uniform(&mut self) -> f64 {
        self.rng.next_f64()
    }
}
