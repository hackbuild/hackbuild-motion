//! wasm-bindgen surface.

use crate::body::{BodyDynamics, BodyInput, BodyParams, dog_postures};
use crate::gait::{BodyMotion, Gait, LegSpec};
use crate::secondary::{EarPair, Wag, WagInput};
use crate::steer::{Obstacle, SteerParams, steer as steer_core};
use crate::table::quadruped;
use alloc::vec::Vec;
use organic::{Mulberry32, Vec3};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = goldenTrace)]
pub fn golden_trace(seed: u32) -> Vec<f64> {
    crate::golden::trace(seed)
}

/// Quadruped footfall tables, 9 numbers each: four offsets, duty, clearance,
/// freq0, freqV, freqW.
#[wasm_bindgen(js_name = quadrupedTables)]
pub fn quadruped_tables() -> Vec<f64> {
    quadruped()
        .iter()
        .flat_map(|t| {
            [
                t.offsets[0],
                t.offsets[1],
                t.offsets[2],
                t.offsets[3],
                t.duty,
                t.clearance,
                t.freq0,
                t.freq_v,
                t.freq_w,
            ]
        })
        .collect()
}

/// A gait with its own seeded stream. `legs` holds `x z toe front` per leg
/// (front 1 or 0), in LF RF LH RH order for a quadruped.
#[wasm_bindgen(js_name = Gait)]
pub struct GaitJs {
    gait: Gait,
    rng: Mulberry32,
}

#[wasm_bindgen(js_class = Gait)]
impl GaitJs {
    #[wasm_bindgen(constructor)]
    pub fn new(legs: &[f64], leg_length: f64, seed: u32) -> GaitJs {
        let specs = legs
            .as_chunks::<4>()
            .0
            .iter()
            .map(|c| LegSpec {
                x: c[0],
                z: c[1],
                toe: c[2],
                front: c[3] > 0.5,
            })
            .collect();
        GaitJs {
            gait: Gait::quadruped(specs, leg_length),
            rng: Mulberry32::new(seed),
        }
    }
    pub fn reset(&mut self, x: f64, z: f64, yaw: f64) {
        self.gait.reset(x, z, yaw);
    }
    /// World nominal spots `x z` per leg for a body at `x z yaw`.
    pub fn nominal(&self, x: f64, z: f64, yaw: f64) -> Vec<f64> {
        (0..self.gait.legs.len())
            .flat_map(|i| self.gait.nominal(i, x, z, yaw))
            .collect()
    }
    /// Per leg posture offsets, `x z` per leg in the body frame.
    #[wasm_bindgen(js_name = setOffsets)]
    pub fn set_offsets(&mut self, xz: &[f64]) {
        for (i, o) in self.gait.offsets.iter_mut().enumerate() {
            if xz.len() >= i * 2 + 2 {
                *o = [xz[i * 2], xz[i * 2 + 1]];
            }
        }
    }
    #[wasm_bindgen(js_name = setPaceBias)]
    pub fn set_pace_bias(&mut self, bias: f64) {
        self.gait.froude.pace_bias = bias;
    }
    /// Advances one frame; returns a bit per leg that touched down.
    pub fn update(&mut self, dt: f64, x: f64, z: f64, yaw: f64, v: f64, w: f64, posed: f64) -> u32 {
        self.gait.update(
            dt,
            BodyMotion {
                x,
                z,
                yaw,
                v,
                w,
                posed,
            },
            &mut self.rng,
        )
    }
    /// `x height z stance swing` per foot; height is above the ground.
    pub fn feet(&self) -> Vec<f64> {
        self.gait
            .feet
            .iter()
            .flat_map(|f| [f.x, f.y, f.z, if f.stance { 1.0 } else { 0.0 }, f.swing])
            .collect()
    }
    pub fn weights(&self) -> Vec<f64> {
        self.gait.weights.clone()
    }
    pub fn phase(&self) -> f64 {
        self.gait.phase
    }
    pub fn standing(&self) -> bool {
        self.gait.standing
    }
    pub fn frequency(&self) -> f64 {
        self.gait.freq
    }
    pub fn duty(&self) -> f64 {
        self.gait.duty
    }
    pub fn froude(&self) -> f64 {
        self.gait.froude.froude()
    }
}

/// Body dynamics with the dog postures (sit, down, bow, reach).
#[wasm_bindgen(js_name = BodyDynamics)]
pub struct BodyJs {
    body: BodyDynamics,
    rng: Mulberry32,
}

#[wasm_bindgen(js_class = BodyDynamics)]
impl BodyJs {
    /// `geometry` is `[frontZ, rearZ, halfWidth, size]`.
    #[wasm_bindgen(constructor)]
    pub fn new(geometry: &[f64], seed: u32) -> BodyJs {
        let mut rng = Mulberry32::new(seed);
        let mut p = BodyParams::default();
        if geometry.len() >= 4 {
            p.front_z = geometry[0];
            p.rear_z = geometry[1];
            p.half_width = geometry[2];
            p.size = geometry[3];
        }
        BodyJs {
            body: BodyDynamics::new(dog_postures(), p, &mut rng),
            rng,
        }
    }
    /// Returns `[rootY, drop, dz, pitch, roll, bend, flex, breathe, posture x4,
    /// legOffsets x8, tilt x4]`.
    pub fn update(
        &mut self,
        dt: f64,
        weights: &[f64],
        phase: f64,
        standing: bool,
        v: f64,
        w: f64,
        posture_goals: &[f64],
        ground: &[f64],
        breath_rate: f64,
        breath_depth: f64,
    ) -> Vec<f64> {
        let mut wg = [0.0; 5];
        for (i, x) in weights.iter().take(5).enumerate() {
            wg[i] = *x;
        }
        let mut gr = [0.0; 4];
        for (i, x) in ground.iter().take(4).enumerate() {
            gr[i] = *x;
        }
        let inp = BodyInput {
            weights: wg,
            phase,
            standing,
            v,
            w,
            posture_goals: posture_goals.to_vec(),
            ground: gr,
            breath_rate,
            breath_depth,
        };
        let p = self.body.update(dt, &inp, &mut self.rng);
        let mut o = alloc::vec![
            p.root_y, p.drop, p.dz, p.pitch, p.roll, p.bend, p.flex, p.breathe
        ];
        o.extend_from_slice(&p.posture);
        for l in &p.leg_offsets {
            o.extend_from_slice(l);
        }
        o.extend_from_slice(&p.tilt);
        o
    }
}

#[wasm_bindgen(js_name = Wag)]
pub struct WagJs {
    wag: Wag,
    rng: Mulberry32,
}

#[wasm_bindgen(js_class = Wag)]
impl WagJs {
    #[wasm_bindgen(constructor)]
    pub fn new(links: usize, halflife: f64, seed: u32) -> WagJs {
        WagJs {
            wag: Wag::new(links, halflife),
            rng: Mulberry32::new(seed),
        }
    }
    /// Returns `[mode, lift, yaw per link]`.
    pub fn update(
        &mut self,
        dt: f64,
        mode_weights: &[f64],
        arousal: f64,
        lift: f64,
        bias: f64,
        turn_rate: f64,
        amp_scale: f64,
        hz_scale: f64,
    ) -> Vec<f64> {
        let inp = WagInput {
            mode_weights: mode_weights.to_vec(),
            arousal,
            lift,
            bias,
            turn_rate,
            amp_scale,
            hz_scale,
        };
        let p = self.wag.update(dt, &inp, &mut self.rng);
        let mut o = alloc::vec![p.mode as f64, p.lift];
        o.extend_from_slice(&p.yaw);
        o
    }
}

#[wasm_bindgen(js_name = EarPair)]
pub struct EarsJs(EarPair);

#[wasm_bindgen(js_class = EarPair)]
impl EarsJs {
    #[wasm_bindgen(constructor)]
    pub fn new(halflife: f64) -> EarsJs {
        EarsJs(EarPair::new(halflife))
    }
    pub fn update(
        &mut self,
        dt: f64,
        perk: f64,
        negative: f64,
        head_yaw_rate: f64,
        flap: f64,
        bounce: f64,
    ) -> Vec<f64> {
        self.0
            .update(dt, perk, negative, head_yaw_rate, flap, bounce)
            .to_vec()
    }
}

/// `obstacles` holds `x z r` each; `params` is `[speed, stopDistance,
/// clearance, influence, turnSlow, turnFast, fence]` or empty for the
/// defaults. Returns `[v, w, arrived]`.
#[wasm_bindgen]
pub fn steer(
    x: f64,
    z: f64,
    yaw: f64,
    v: f64,
    tx: f64,
    tz: f64,
    obstacles: &[f64],
    params: &[f64],
) -> Vec<f64> {
    let obs: Vec<Obstacle> = obstacles
        .as_chunks::<3>()
        .0
        .iter()
        .map(|c| Obstacle {
            x: c[0],
            z: c[1],
            r: c[2],
        })
        .collect();
    let p = if params.len() >= 7 {
        SteerParams {
            speed: params[0],
            stop_distance: params[1],
            clearance: params[2],
            influence: params[3],
            turn_slow: params[4],
            turn_fast: params[5],
            fence: params[6],
        }
    } else {
        SteerParams::default()
    };
    let s = steer_core(x, z, yaw, v, tx, tz, &obs, &p);
    alloc::vec![s.v, s.w, if s.arrived { 1.0 } else { 0.0 }]
}

/// Two bone leg solve; see `@hackbuild/ik` `twoBone` for the layout.
#[wasm_bindgen(js_name = solveLeg)]
pub fn solve_leg(abc: &[f64], target: &[f64], pole: &[f64]) -> Vec<f64> {
    let v = |s: &[f64], i: usize| Vec3::from_slice(&s[i * 3..i * 3 + 3]);
    let s = ik::two_bone::two_bone(
        v(abc, 0),
        v(abc, 1),
        v(abc, 2),
        v(target, 0),
        v(pole, 0),
        0.0,
    );
    let mut o = alloc::vec![0.0; 15];
    s.mid.write(&mut o[0..3]);
    s.end.write(&mut o[3..6]);
    s.upper.write(&mut o[6..10]);
    s.lower.write(&mut o[10..14]);
    o[14] = if s.reached { 1.0 } else { 0.0 };
    o
}
