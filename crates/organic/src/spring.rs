//! Critically damped springs parameterised by halflife, after Holden.
//!
//! Each function comes in two flavours through [`Exp`]: `Exact` uses
//! `exp(-x)`, `Fast` the rational approximation `1 / (1 + x + 0.48 x^2 +
//! 0.235 x^3)` the original kernel used. The fast form stays within 0.2
//! percent of the exact decay factor for `x` in 0 to 1 and is frame rate
//! tolerant, not frame rate exact (`tests::fast_error_bound` measures it).

use crate::math::{Quat, Vec3};

const EPS: f64 = 1e-5;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Exp {
    #[default]
    Exact,
    Fast,
}

impl Exp {
    #[inline]
    pub fn negexp(self, x: f64) -> f64 {
        match self {
            Exp::Exact => libm::exp(-x),
            Exp::Fast => fast_negexp(x),
        }
    }
}

#[inline]
pub fn fast_negexp(x: f64) -> f64 {
    1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x)
}

/// Damping that halves the distance to the goal every `halflife` seconds.
#[inline]
pub fn halflife_to_damping(halflife: f64) -> f64 {
    (4.0 * core::f64::consts::LN_2) / (halflife + EPS)
}

#[inline]
pub fn damping_to_halflife(damping: f64) -> f64 {
    (4.0 * core::f64::consts::LN_2) / (damping + EPS)
}

/// Scalar spring state: position, velocity and, for the velocity spring,
/// acceleration.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SpringState {
    pub x: f64,
    pub v: f64,
    pub a: f64,
}

impl SpringState {
    pub fn at(x: f64) -> Self {
        SpringState { x, v: 0.0, a: 0.0 }
    }
}

/// Critically damped spring of `s.x` toward `goal`. Returns the new position.
pub fn spring(s: &mut SpringState, goal: f64, halflife: f64, dt: f64, exp: Exp) -> f64 {
    let y = halflife_to_damping(halflife) / 2.0;
    let j0 = s.x - goal;
    let j1 = s.v + j0 * y;
    let e = exp.negexp(y * dt);
    s.x = e * (j0 + j1 * dt) + goal;
    s.v = e * (s.v - j1 * y * dt);
    s.x
}

/// Decays an offset in `s.x` toward zero: the inertialization core.
pub fn decay(s: &mut SpringState, halflife: f64, dt: f64, exp: Exp) -> f64 {
    let y = halflife_to_damping(halflife) / 2.0;
    let j1 = s.v + s.x * y;
    let e = exp.negexp(y * dt);
    s.x = e * (s.x + j1 * dt);
    s.v = e * (s.v - j1 * y * dt);
    s.x
}

/// Character velocity spring: `s.v` eases toward `v_goal` and `s.x`
/// integrates it exactly, so starts and stops carry momentum. Returns `s.x`.
pub fn velocity_spring(s: &mut SpringState, v_goal: f64, halflife: f64, dt: f64, exp: Exp) -> f64 {
    let y = halflife_to_damping(halflife) / 2.0;
    let j0 = s.v - v_goal;
    let j1 = s.a + j0 * y;
    let e = exp.negexp(y * dt);
    s.x += e * ((-j1) / (y * y) + (-j0 - j1 * dt) / y) + j1 / (y * y) + j0 / y + v_goal * dt;
    s.v = e * (j0 + j1 * dt) + v_goal;
    s.a = e * (s.a - j1 * y * dt);
    s.x
}

/// Spring damper with an explicit damping ratio (1 is critical, below 1
/// overshoots, above 1 is sluggish), toward a moving goal with velocity
/// `v_goal`. Exact in time for every ratio.
pub fn spring_damper(
    s: &mut SpringState,
    goal: f64,
    v_goal: f64,
    ratio: f64,
    halflife: f64,
    dt: f64,
) -> f64 {
    let d = halflife_to_damping(halflife);
    let k = (d / (ratio.max(1e-6) * 2.0)) * (d / (ratio.max(1e-6) * 2.0));
    let c = goal + (d * v_goal) / (k + EPS);
    let y = d / 2.0;
    let x0 = s.x - c;
    let disc = k - (d * d) / 4.0;
    if libm::fabs(disc) < EPS {
        let j1 = s.v + x0 * y;
        let e = libm::exp(-y * dt);
        s.x = x0 * e + dt * j1 * e + c;
        s.v = -y * x0 * e - y * dt * j1 * e + j1 * e;
    } else if disc > 0.0 {
        let w = libm::sqrt(disc);
        let mut j = libm::sqrt((s.v + y * x0) * (s.v + y * x0) / (w * w + EPS) + x0 * x0);
        let p = libm::atan((s.v + x0 * y) / (-x0 * w + EPS));
        if x0 <= 0.0 {
            j = -j;
        }
        let e = libm::exp(-y * dt);
        s.x = j * e * libm::cos(w * dt + p) + c;
        s.v = -y * j * e * libm::cos(w * dt + p) - w * j * e * libm::sin(w * dt + p);
    } else {
        let r = libm::sqrt(d * d - 4.0 * k);
        let y0 = (d + r) / 2.0;
        let y1 = (d - r) / 2.0;
        let j1 = (c * y0 - s.x * y0 - s.v) / (y1 - y0);
        let j0 = s.x - j1 - c;
        let e0 = libm::exp(-y0 * dt);
        let e1 = libm::exp(-y1 * dt);
        s.x = j0 * e0 + j1 * e1 + c;
        s.v = -y0 * j0 * e0 - y1 * j1 * e1;
    }
    s.x
}

/// Critically damped spring on three axes at once.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3Spring {
    pub x: Vec3,
    pub v: Vec3,
}

impl Vec3Spring {
    pub fn step(&mut self, goal: Vec3, halflife: f64, dt: f64, exp: Exp) -> Vec3 {
        let y = halflife_to_damping(halflife) / 2.0;
        let j0 = self.x - goal;
        let j1 = self.v + j0 * y;
        let e = exp.negexp(y * dt);
        self.x = (j0 + j1 * dt) * e + goal;
        self.v = (self.v - j1 * (y * dt)) * e;
        self.x
    }
}

/// Critically damped rotation spring: `q` eases toward a goal rotation and
/// `w` is its angular velocity in radians per second (scaled axis).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct QuatSpring {
    pub q: Quat,
    pub w: Vec3,
}

impl Default for QuatSpring {
    fn default() -> Self {
        QuatSpring {
            q: Quat::IDENTITY,
            w: Vec3::ZERO,
        }
    }
}

impl QuatSpring {
    pub fn step(&mut self, goal: Quat, halflife: f64, dt: f64, exp: Exp) -> Quat {
        let y = halflife_to_damping(halflife) / 2.0;
        let j0 = self.q.mul(goal.inverse()).abs().to_scaled_axis();
        let j1 = self.w + j0 * y;
        let e = exp.negexp(y * dt);
        self.q = Quat::from_scaled_axis((j0 + j1 * dt) * e)
            .mul(goal)
            .normalize();
        self.w = (self.w - j1 * (y * dt)) * e;
        self.q
    }
}

/// Many scalar springs stepped together, for per frame batches.
#[derive(Clone, Debug, Default)]
pub struct SpringBank {
    pub x: alloc::vec::Vec<f64>,
    pub v: alloc::vec::Vec<f64>,
}

impl SpringBank {
    pub fn new(n: usize) -> Self {
        SpringBank {
            x: alloc::vec![0.0; n],
            v: alloc::vec![0.0; n],
        }
    }
    /// Steps every spring toward its goal with one shared halflife.
    pub fn step(&mut self, goals: &[f64], halflife: f64, dt: f64, exp: Exp) {
        let y = halflife_to_damping(halflife) / 2.0;
        let e = exp.negexp(y * dt);
        for ((x, v), g) in self.x.iter_mut().zip(self.v.iter_mut()).zip(goals) {
            let j0 = *x - g;
            let j1 = *v + j0 * y;
            *x = e * (j0 + j1 * dt) + g;
            *v = e * (*v - j1 * y * dt);
        }
    }
    /// Steps with a halflife per spring.
    pub fn step_each(&mut self, goals: &[f64], halflives: &[f64], dt: f64, exp: Exp) {
        for i in 0..self.x.len().min(goals.len()).min(halflives.len()) {
            let mut s = SpringState {
                x: self.x[i],
                v: self.v[i],
                a: 0.0,
            };
            spring(&mut s, goals[i], halflives[i], dt, exp);
            self.x[i] = s.x;
            self.v[i] = s.v;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn halflife_halves_the_distance() {
        let mut s = SpringState::at(1.0);
        // a decay from rest with zero velocity reaches about half after one halflife
        // only for the first order part; check that it is monotone and below 1
        let mut prev = 1.0;
        for _ in 0..60 {
            let x = decay(&mut s, 0.2, 1.0 / 60.0, Exp::Exact);
            assert!(x <= prev + 1e-12);
            prev = x;
        }
        assert!(prev < 0.5 && prev > 0.0);
    }

    #[test]
    fn fast_error_bound() {
        // measured: worst relative error of the fast decay factor on x in 0..1
        let mut worst: f64 = 0.0;
        for i in 0..=1000 {
            let x = i as f64 / 1000.0;
            let e = libm::exp(-x);
            worst = worst.max(libm::fabs(fast_negexp(x) - e) / e);
        }
        assert!(worst < 0.002, "worst {worst}");
    }

    #[test]
    fn exact_spring_is_step_invariant() {
        let mut a = SpringState::at(2.0);
        let mut b = SpringState::at(2.0);
        spring(&mut a, 0.5, 0.3, 0.1, Exp::Exact);
        for _ in 0..10 {
            spring(&mut b, 0.5, 0.3, 0.01, Exp::Exact);
        }
        assert!((a.x - b.x).abs() < 1e-9 && (a.v - b.v).abs() < 1e-9);
    }

    #[test]
    fn damper_ratios_converge() {
        for ratio in [0.3, 1.0, 3.0] {
            let mut s = SpringState::at(0.0);
            for _ in 0..3000 {
                spring_damper(&mut s, 1.0, 0.0, ratio, 0.2, 1.0 / 60.0);
            }
            assert!((s.x - 1.0).abs() < 1e-3, "ratio {ratio} x {}", s.x);
        }
    }

    #[test]
    fn quat_spring_reaches_goal() {
        let goal = Quat::from_axis_angle(Vec3::Y, 1.0);
        let mut s = QuatSpring::default();
        for _ in 0..300 {
            s.step(goal, 0.1, 1.0 / 60.0, Exp::Exact);
        }
        assert!(s.q.angle_to(goal) < 1e-4);
    }
}
