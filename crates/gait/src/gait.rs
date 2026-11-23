//! The leg oscillator: a stride phase, one phase per leg pulled toward its
//! table offset, stance while the leg phase is under the duty factor, and a
//! minimum jerk swing to a predicted landing spot.

use crate::froude::{FroudeSelector, FroudeThresholds};
use crate::table::{GaitTable, blend_offsets, quadruped};
use alloc::vec::Vec;
use organic::Rng;
use organic::curve::minimum_jerk;
use organic::math::{clamp, frac, lerp, wrap_half};

/// A leg's rest geometry in the body frame (x to the body's left, z
/// forward), measured from the rig's rest pose.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LegSpec {
    /// Nominal foot spot under the body, meters.
    pub x: f64,
    pub z: f64,
    /// Toe height above the ground at rest.
    pub toe: f64,
    /// Front legs lift 15 percent higher.
    pub front: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Foot {
    pub x: f64,
    /// Height above the ground.
    pub y: f64,
    pub z: f64,
    pub stance: bool,
    pub phase: f64,
    /// Progress through the current swing, 0 to 1.
    pub swing: f64,
    lift: [f64; 2],
    land: [f64; 2],
    step: Option<(f64, [f64; 2])>,
}

/// The body's motion this frame.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct BodyMotion {
    pub x: f64,
    pub z: f64,
    pub yaw: f64,
    /// Forward speed, meters per second.
    pub v: f64,
    /// Turn rate, radians per second.
    pub w: f64,
    /// Sum of posture weights (sit, down, bow, reach): above 0.2 the legs stay put.
    pub posed: f64,
}

#[derive(Clone, Debug)]
pub struct GaitParams {
    /// Leg length used for the Froude number.
    pub leg_length: f64,
    /// A stance foot left this far behind its nominal spot lifts at once.
    pub relift: f64,
    /// Standing step duration in seconds.
    pub step_time: f64,
    /// A standing foot this far off its spot steps back.
    pub step_threshold: f64,
    /// Swing height scale; tables are written for a leg about 0.4 m long.
    pub clearance_scale: f64,
}

impl GaitParams {
    pub fn for_leg(leg_length: f64) -> Self {
        let k = leg_length / 0.4;
        GaitParams {
            leg_length,
            relift: 0.55 * k,
            step_time: 0.26,
            step_threshold: 0.06 * k,
            clearance_scale: k,
        }
    }
}

pub struct Gait {
    pub legs: Vec<LegSpec>,
    pub feet: Vec<Foot>,
    pub tables: Vec<GaitTable>,
    pub weights: Vec<f64>,
    pub froude: FroudeSelector,
    pub params: GaitParams,
    pub phase: f64,
    pub standing: bool,
    pub freq: f64,
    pub duty: f64,
    pub clearance: f64,
    /// Per leg posture offsets (x, z) added to the nominal spots.
    pub offsets: Vec<[f64; 2]>,
    offs: Vec<f64>,
}

/// Body frame point to world: yaw 0 faces +Z, x is the body's left.
pub fn to_world(x: f64, z: f64, bx: f64, bz: f64, yaw: f64) -> [f64; 2] {
    let c = libm::cos(yaw);
    let s = libm::sin(yaw);
    [bx + c * x + s * z, bz - s * x + c * z]
}

impl Gait {
    /// A quadruped gait (LF RF LH RH) with the HACKLE tables and Froude thresholds.
    pub fn quadruped(legs: Vec<LegSpec>, leg_length: f64) -> Self {
        Gait::new(
            legs,
            quadruped(),
            FroudeThresholds::default(),
            0.35,
            GaitParams::for_leg(leg_length),
        )
    }

    pub fn new(
        legs: Vec<LegSpec>,
        tables: Vec<GaitTable>,
        thresholds: FroudeThresholds,
        pace_bias: f64,
        params: GaitParams,
    ) -> Self {
        let n = legs.len();
        let mut weights = alloc::vec![0.0; tables.len()];
        weights[0] = 1.0;
        let feet = legs
            .iter()
            .map(|l| Foot {
                x: l.x,
                y: l.toe,
                z: l.z,
                stance: true,
                ..Default::default()
            })
            .collect();
        Gait {
            legs,
            feet,
            tables,
            weights,
            froude: FroudeSelector::new(thresholds, pace_bias),
            params,
            phase: 0.0,
            standing: true,
            freq: 0.0,
            duty: 0.64,
            clearance: 0.0,
            offsets: alloc::vec![[0.0; 2]; n],
            offs: alloc::vec![0.0; n],
        }
    }

    /// Places every foot on its nominal spot for a body at `x z yaw`.
    pub fn reset(&mut self, x: f64, z: f64, yaw: f64) {
        for i in 0..self.legs.len() {
            let n = self.nominal(i, x, z, yaw);
            let f = &mut self.feet[i];
            *f = Foot {
                x: n[0],
                y: self.legs[i].toe,
                z: n[1],
                stance: true,
                ..Default::default()
            };
        }
        self.standing = true;
        self.phase = 0.0;
    }

    /// World nominal spot of leg `i` for a body at `x z yaw`.
    pub fn nominal(&self, i: usize, x: f64, z: f64, yaw: f64) -> [f64; 2] {
        let l = &self.legs[i];
        to_world(
            l.x + self.offsets[i][0],
            l.z + self.offsets[i][1],
            x,
            z,
            yaw,
        )
    }

    fn weights_for(&mut self, v: f64, rng: &mut dyn Rng) {
        if self.tables.len() == 5 {
            let w = self.froude.update(v, self.params.leg_length, rng);
            self.weights.copy_from_slice(&w);
        } else {
            // other leg counts: pick the table by speed in order, blended linearly
            let k = clamp(v / 1.5, 0.0, 1.0) * (self.tables.len() - 1) as f64;
            for (i, w) in self.weights.iter_mut().enumerate() {
                *w = (1.0 - libm::fabs(k - i as f64)).max(0.0);
            }
        }
    }

    /// Advances one frame. Returns a bit per leg that touched down.
    pub fn update(&mut self, dt: f64, body: BodyMotion, rng: &mut dyn Rng) -> u32 {
        let v = libm::fabs(body.v);
        let n = self.legs.len();
        self.weights_for(v, rng);
        let mut f = 0.0;
        let mut duty = 0.0;
        let mut clr = 0.0;
        for (t, w) in self.tables.iter().zip(&self.weights) {
            f += w * t.frequency(v, body.w);
            duty += w * t.duty;
            clr += w * t.clearance;
        }
        clr *= self.params.clearance_scale;
        self.freq = f;
        self.duty = duty;
        self.clearance = clr;
        blend_offsets(&self.tables, &self.weights, &mut self.offs);
        let activity = clamp((v + libm::fabs(body.w) * 0.25) / 0.06, 0.0, 1.0);
        let mut touch = 0u32;
        if self.standing && activity > 0.5 && body.posed < 0.2 {
            // start the stride with the leg furthest from its spot
            self.standing = false;
            let mut worst = 0.0;
            let mut wi = 0;
            for i in 0..n {
                let s = self.nominal(i, body.x, body.z, body.yaw);
                let e = libm::hypot(self.feet[i].x - s[0], self.feet[i].z - s[1]);
                if e > worst {
                    worst = e;
                    wi = i;
                }
            }
            self.phase = frac(duty + 0.01 - self.offs[wi]);
            for i in 0..n {
                let ft = &mut self.feet[i];
                ft.phase = frac(self.phase + self.offs[i]);
                ft.stance = ft.phase < duty;
                if !ft.stance {
                    ft.lift = [ft.x, ft.z];
                }
                ft.step = None;
            }
        } else if !self.standing && activity < 0.08 && self.feet.iter().all(|f| f.stance) {
            self.standing = true;
        }
        if !self.standing {
            self.phase = frac(self.phase + f * dt);
            let (s, c) = (libm::sin(body.yaw), libm::cos(body.yaw));
            let vw = [s * body.v, c * body.v];
            let fz = f.max(0.5);
            // stopping: no new swings start; swinging feet finish and land,
            // then the body stands (a plain oscillator never has every foot
            // down at once in a walk, whose swings overlap)
            let stopping = activity < 0.08;
            for i in 0..n {
                if stopping && self.feet[i].stance {
                    continue;
                }
                let target = frac(self.phase + self.offs[i]);
                let ft = self.feet[i];
                let ph = frac(ft.phase + f * dt + 4.0 * dt * wrap_half(target - ft.phase));
                let mut ft = ft;
                ft.phase = ph;
                let in_stance = ph < duty;
                if ft.stance && !in_stance {
                    ft.stance = false;
                    ft.lift = [ft.x, ft.z];
                }
                if !ft.stance && in_stance {
                    ft.stance = true;
                    ft.x = ft.land[0];
                    ft.z = ft.land[1];
                    ft.y = self.legs[i].toe;
                    touch |= 1 << i;
                }
                if !ft.stance {
                    let sw = clamp((ph - duty) / (1.0 - duty), 0.0, 1.0);
                    let tr = (1.0 - sw) * (1.0 - duty) / fz;
                    let px = body.x + vw[0] * tr;
                    let pz = body.z + vw[1] * tr;
                    let yaw = body.yaw + body.w * tr;
                    let l = &self.legs[i];
                    let mut land = to_world(
                        l.x + self.offsets[i][0],
                        l.z + self.offsets[i][1],
                        px,
                        pz,
                        yaw,
                    );
                    land[0] += vw[0] * duty / fz * 0.5;
                    land[1] += vw[1] * duty / fz * 0.5;
                    ft.land = land;
                    let e = minimum_jerk(sw);
                    ft.x = lerp(ft.lift[0], land[0], e);
                    ft.z = lerp(ft.lift[1], land[1], e);
                    let k = if l.front { 1.15 } else { 1.0 };
                    ft.y = l.toe
                        + clr
                            * k
                            * libm::sin(core::f64::consts::PI * sw)
                            * (0.6 + 0.4 * clamp(v, 0.0, 1.5));
                    ft.swing = sw;
                }
                self.feet[i] = ft;
            }
            // a stance foot left far behind lifts at once
            for i in 0..n {
                if self.feet[i].stance {
                    let s = self.nominal(i, body.x, body.z, body.yaw);
                    if libm::hypot(s[0] - self.feet[i].x, s[1] - self.feet[i].z)
                        > self.params.relift
                    {
                        let ft = &mut self.feet[i];
                        ft.stance = false;
                        ft.phase = duty + 0.01;
                        ft.lift = [ft.x, ft.z];
                    }
                }
            }
        } else {
            let swinging = self.feet.iter().any(|f| f.step.is_some());
            for i in 0..n {
                let s = self.nominal(i, body.x, body.z, body.yaw);
                let toe = self.legs[i].toe;
                let ft = &mut self.feet[i];
                if let Some((t, a)) = ft.step {
                    let t = t + dt / self.params.step_time;
                    let u = clamp(t, 0.0, 1.0);
                    let e = minimum_jerk(u);
                    ft.x = lerp(a[0], s[0], e);
                    ft.z = lerp(a[1], s[1], e);
                    ft.y = toe
                        + 0.05 * self.params.clearance_scale * libm::sin(core::f64::consts::PI * u);
                    ft.stance = false;
                    ft.step = Some((t, a));
                    if u >= 1.0 {
                        ft.step = None;
                        ft.stance = true;
                        touch |= 1 << i;
                    }
                } else if body.posed > 0.05 {
                    let k = 1.0 - libm::exp(-dt * 5.0);
                    ft.x = lerp(ft.x, s[0], k);
                    ft.z = lerp(ft.z, s[1], k);
                    ft.y = toe;
                    ft.stance = true;
                } else if !swinging
                    && libm::hypot(ft.x - s[0], ft.z - s[1]) > self.params.step_threshold
                {
                    ft.step = Some((0.0, [ft.x, ft.z]));
                } else {
                    ft.stance = true;
                    ft.y = toe;
                }
            }
        }
        touch
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use organic::Mulberry32;

    pub(crate) fn dog() -> Gait {
        let legs = alloc::vec![
            LegSpec {
                x: 0.09,
                z: 0.22,
                toe: 0.02,
                front: true
            },
            LegSpec {
                x: -0.09,
                z: 0.22,
                toe: 0.02,
                front: true
            },
            LegSpec {
                x: 0.09,
                z: -0.2,
                toe: 0.02,
                front: false
            },
            LegSpec {
                x: -0.09,
                z: -0.2,
                toe: 0.02,
                front: false
            },
        ];
        Gait::quadruped(legs, 0.42)
    }

    #[test]
    fn stance_feet_do_not_slide_and_trot_pairs_hold() {
        let mut g = dog();
        let mut r = Mulberry32::new(4);
        let mut body = BodyMotion {
            v: 2.0,
            ..Default::default()
        };
        let dt = 1.0 / 120.0;
        g.reset(0.0, 0.0, 0.0);
        let mut prev = g.feet.clone();
        let mut slide: f64 = 0.0;
        let mut diag_match = 0;
        let mut frames = 0;
        for k in 0..1200 {
            body.z += body.v * dt;
            g.update(dt, body, &mut r);
            if k > 240 {
                for i in 0..4 {
                    if prev[i].stance && g.feet[i].stance {
                        slide = slide.max(libm::hypot(
                            g.feet[i].x - prev[i].x,
                            g.feet[i].z - prev[i].z,
                        ));
                    }
                }
                frames += 1;
                if g.feet[0].stance == g.feet[3].stance && g.feet[1].stance == g.feet[2].stance {
                    diag_match += 1;
                }
            }
            prev = g.feet.clone();
        }
        // 2 m/s on a 0.42 m leg is Fr 0.97: a trot
        assert!(g.weights[2] > 0.9, "{:?}", g.weights);
        assert!(slide < 1e-12, "stance foot slid {slide}");
        assert!(
            diag_match as f64 / frames as f64 > 0.9,
            "{diag_match} of {frames}"
        );
    }

    #[test]
    fn comes_to_rest_with_feet_under_the_body() {
        let mut g = dog();
        let mut r = Mulberry32::new(5);
        let dt = 1.0 / 60.0;
        let mut body = BodyMotion {
            v: 0.8,
            ..Default::default()
        };
        for _ in 0..300 {
            body.z += body.v * dt;
            g.update(dt, body, &mut r);
        }
        body.v = 0.0;
        for _ in 0..600 {
            g.update(dt, body, &mut r);
        }
        assert!(g.standing);
        for i in 0..4 {
            let s = g.nominal(i, body.x, body.z, body.yaw);
            assert!(
                libm::hypot(s[0] - g.feet[i].x, s[1] - g.feet[i].z)
                    <= g.params.step_threshold + 1e-9
            );
        }
    }

    #[test]
    fn feet_stay_near_the_body_while_turning() {
        let mut g = dog();
        let mut r = Mulberry32::new(6);
        let dt = 1.0 / 60.0;
        let mut body = BodyMotion {
            v: 1.2,
            w: 1.5,
            ..Default::default()
        };
        for _ in 0..900 {
            body.yaw += body.w * dt;
            body.x += libm::sin(body.yaw) * body.v * dt;
            body.z += libm::cos(body.yaw) * body.v * dt;
            g.update(dt, body, &mut r);
            for i in 0..4 {
                let s = g.nominal(i, body.x, body.z, body.yaw);
                assert!(
                    libm::hypot(s[0] - g.feet[i].x, s[1] - g.feet[i].z) < g.params.relift + 0.3
                );
            }
        }
    }
}
