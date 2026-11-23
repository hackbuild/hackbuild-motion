//! A fixed scenario for the native and wasm agreement test.

use crate::reference::reference_rest;
use crate::rest::analyze_rest;
use alloc::vec::Vec;
use organic::{Mulberry32, Quat, Rng, Vec3};

pub fn trace(seed: u32) -> Vec<f64> {
    let mut r = Mulberry32::new(seed);
    let mut out = Vec::new();
    let base = reference_rest();
    for _ in 0..4 {
        let axis =
            Vec3::new(r.next_f64() - 0.5, r.next_f64() - 0.5, r.next_f64() - 0.5).normalize();
        let turn = Quat::from_axis_angle(axis, r.next_f64() * 6.0);
        let scale = [1.0, 100.0, 1000.0][(r.next_f64() * 3.0) as usize % 3];
        let pos: Vec<Option<Vec3>> = base
            .iter()
            .map(|v| {
                let j =
                    Vec3::new(r.next_f64() - 0.5, r.next_f64() - 0.5, r.next_f64() - 0.5) * 0.01;
                Some(turn.rotate(*v + j) * scale)
            })
            .collect();
        if let Some(rep) = analyze_rest(&pos) {
            out.extend_from_slice(&rep.to_flat());
        }
    }
    out
}
