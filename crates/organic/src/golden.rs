//! A fixed scenario over every public function, used to prove that the
//! native and the wasm build give identical numbers for one seed.

use crate::cascade::{CascadeBank, settle};
use crate::clock::BodyClock;
use crate::curve::{keyed, minimum_jerk};
use crate::inertialize::Inertializer;
use crate::math::{Quat, Vec3};
use crate::noise::{Ou, Pink};
use crate::rng::{Mulberry32, Rng};
use crate::sample::*;
use crate::spring::*;
use alloc::vec::Vec;

pub fn trace(seed: u32) -> Vec<f64> {
    let mut out = Vec::new();
    let mut r = Mulberry32::new(seed);
    for _ in 0..4 {
        out.push(r.next_f64());
    }
    out.push(gauss(&mut r));
    out.push(ex_gaussian(0.3, 0.05, 0.2, &mut r));
    out.push(truncated_power_law(0.1, 2.0, 4.0, &mut r));
    out.push(von_mises(2.0, &mut r));
    out.push(poisson_gap(3.0, &mut r));
    out.push(gamma(0.7, 2.0, &mut r));
    out.push(gamma(3.0, 0.5, &mut r));
    out.push(log_normal(1.0, 0.4, &mut r));
    out.push(if event_in_step(5.0, 0.1, &mut r) {
        1.0
    } else {
        0.0
    });
    out.push(weighted_index(&[1.0, 2.0, 3.0], &mut r) as f64);
    let mut ou = Ou::with_rng(0.5, 1.0, 0.2, &mut r);
    let mut pink = Pink::new(0.2, 4, &mut r);
    for _ in 0..8 {
        out.push(ou.step(1.0 / 60.0, &mut r));
        out.push(pink.step(1.0 / 60.0, &mut r));
    }
    for exp in [Exp::Exact, Exp::Fast] {
        let mut s = SpringState::at(1.0);
        let mut vs = SpringState::default();
        for _ in 0..6 {
            out.push(spring(&mut s, -0.5, 0.15, 1.0 / 60.0, exp));
            out.push(velocity_spring(&mut vs, 1.5, 0.3, 1.0 / 60.0, exp));
        }
    }
    for ratio in [0.4, 1.0, 2.5] {
        let mut s = SpringState::at(0.0);
        for _ in 0..4 {
            out.push(spring_damper(&mut s, 1.0, 0.2, ratio, 0.2, 1.0 / 30.0));
        }
    }
    let mut qs = QuatSpring::default();
    let goal = Quat::from_axis_angle(Vec3::new(0.2, 1.0, -0.3).normalize(), 1.1);
    for _ in 0..4 {
        let q = qs.step(goal, 0.12, 1.0 / 60.0, Exp::Exact);
        out.extend_from_slice(&[q.x, q.y, q.z, q.w]);
    }
    let mut inert = Inertializer::new(2, 1);
    let a = Quat::from_axis_angle(Vec3::X, 0.6);
    let b = Quat::from_axis_angle(Vec3::Z, -0.9);
    for f in 0..8 {
        let mut rot = if f < 3 { [a, b] } else { [b, a] };
        let mut pos = [Vec3::new(
            f as f64 * 0.1,
            0.0,
            if f < 3 { 0.0 } else { 1.0 },
        )];
        if f == 3 {
            inert.capture();
        }
        inert.apply(&mut rot, &mut pos, 1.0 / 60.0, 0.1);
        out.extend_from_slice(&[rot[0].x, rot[0].w, rot[1].z, pos[0].x, pos[0].z]);
    }
    out.push(minimum_jerk(0.3));
    out.push(keyed(0.7, &[(0.0, 0.0), (0.5, 1.0), (1.0, -1.0)]));
    let mut c = BodyClock::new(600.0, 120.0);
    for _ in 0..5 {
        c.tick(7.0);
    }
    out.push(c.pressure);
    out.push(c.circadian());
    out.push(settle(6, 0.98));
    let mut cb = CascadeBank::new(2, 120.0, 6);
    cb.set_time(0, 0.12);
    cb.set_rate(1, 40.0);
    cb.snap(1, -0.5);
    cb.set_targets(&[1.0, 0.75]);
    for f in 0..10 {
        if f == 6 {
            cb.place(0, 0.1);
            cb.set_target(0, -0.25);
        }
        cb.step();
        out.extend_from_slice(&[cb.values[0], cb.values[1], cb.velocity(0)]);
    }
    out
}
