//! A fixed scenario for the native and wasm agreement test.

use crate::clip::Root;
use crate::matcher::{Matcher, MatcherParams};
use crate::synth::test_database;
use alloc::vec::Vec;
use organic::{Mulberry32, Rng};

pub fn trace(seed: u32) -> Vec<f64> {
    let mut r = Mulberry32::new(seed);
    let db = test_database(30.0);
    let mut m = Matcher::new(db, MatcherParams::default(), 0, 0, Root::default());
    let dt = 1.0 / 60.0;
    let mut out = Vec::new();
    let (mut speed, mut turn) = (0.0, 0.0);
    for k in 0..900 {
        if k % 90 == 0 {
            speed = libm::floor(r.next_f64() * 4.0) * 1.0;
            turn = (r.next_f64() - 0.5) * 2.0;
            m.force_search();
        }
        let tr = m.trajectory(speed, turn);
        let j = m.update(dt, &tr);
        if k % 15 == 0 || j {
            out.extend_from_slice(&[m.root.x, m.root.z, m.root.yaw]);
            out.extend_from_slice(&[m.clip as f64, m.frame, j as u8 as f64]);
            // an unsearchable current frame has no cost; JSON has no infinity
            let fin = |x: f64| if x.is_finite() { x } else { -1.0 };
            out.extend_from_slice(&[fin(m.last_hit.cost), fin(m.last_current_cost)]);
            out.extend_from_slice(&[m.pose.hips.x, m.pose.hips.y, m.pose.hips.z]);
            for f in &m.pose.feet {
                out.extend_from_slice(&[f.x, f.y, f.z]);
            }
            let q = m.pose.rotations[1];
            out.extend_from_slice(&[q.x, q.y, q.z, q.w]);
            out.extend_from_slice(&[m.motor.phase, m.motor.duty, m.motor.stride_frequency]);
        }
    }
    out.push(m.transitions as f64);
    out
}
