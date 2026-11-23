//! wasm-bindgen surface over flat `Float64Array`s: points are `x y z`,
//! rotations `x y z w`.

use crate::chain::{Limit, ccd as ccd_solve, fabrik as fabrik_solve, segment_deltas};
use crate::contact::{ContactLock, pelvis_drop};
use crate::hand::{finger_curl, hand_frame};
use crate::look::{LookLimits, clamp_direction, look_angles, look_chain};
use crate::two_bone::two_bone;
use alloc::vec::Vec;
use organic::{Quat, Vec3};
use wasm_bindgen::prelude::*;

fn v3(s: &[f64], i: usize) -> Vec3 {
    Vec3::from_slice(&s[i * 3..i * 3 + 3])
}
fn q4(s: &[f64]) -> Quat {
    Quat::from_slice(&s[0..4])
}
fn points(s: &[f64]) -> Vec<Vec3> {
    s.chunks_exact(3).map(Vec3::from_slice).collect()
}
fn write_points(p: &[Vec3], out: &mut [f64]) {
    for (i, x) in p.iter().enumerate() {
        x.write(&mut out[i * 3..i * 3 + 3]);
    }
}

#[wasm_bindgen(js_name = goldenTrace)]
pub fn golden_trace(seed: u32) -> Vec<f64> {
    crate::golden::trace(seed)
}

/// `abc` holds the three joints, `target` and `pole` one point each.
/// Returns `[mid xyz, end xyz, upper xyzw, lower xyzw, reached]`.
#[wasm_bindgen(js_name = twoBone)]
pub fn two_bone_js(abc: &[f64], target: &[f64], pole: &[f64], soft: f64) -> Vec<f64> {
    let s = two_bone(
        v3(abc, 0),
        v3(abc, 1),
        v3(abc, 2),
        v3(target, 0),
        v3(pole, 0),
        soft,
    );
    let mut o = alloc::vec![0.0; 15];
    s.mid.write(&mut o[0..3]);
    s.end.write(&mut o[3..6]);
    s.upper.write(&mut o[6..10]);
    s.lower.write(&mut o[10..14]);
    o[14] = if s.reached { 1.0 } else { 0.0 };
    o
}

/// FABRIK in place on `positions`. `limits` holds four numbers per segment:
/// `[kind, a, b, c]` with kind 0 none, 1 cone (a = max angle), 2 hinge
/// (a b c = axis); empty for no limits. Returns `[iterations, error]`.
#[wasm_bindgen]
pub fn fabrik(
    positions: &mut [f64],
    target: &[f64],
    iterations: u32,
    tolerance: f64,
    limits: &[f64],
) -> Vec<f64> {
    let mut p = points(positions);
    let lim: Vec<Limit> = limits
        .chunks_exact(4)
        .map(|c| match c[0] as i32 {
            1 => Limit::Cone { max: c[1] },
            2 => Limit::Hinge {
                axis: Vec3::new(c[1], c[2], c[3]),
            },
            _ => Limit::None,
        })
        .collect();
    let info = fabrik_solve(
        &mut p,
        v3(target, 0),
        iterations,
        tolerance,
        if lim.is_empty() { None } else { Some(&lim) },
    );
    write_points(&p, positions);
    alloc::vec![info.iterations as f64, info.error]
}

/// CCD in place on `positions`. Returns `[iterations, error]`.
#[wasm_bindgen]
pub fn ccd(
    positions: &mut [f64],
    target: &[f64],
    iterations: u32,
    tolerance: f64,
    max_step: f64,
) -> Vec<f64> {
    let mut p = points(positions);
    let info = ccd_solve(&mut p, v3(target, 0), iterations, tolerance, max_step);
    write_points(&p, positions);
    alloc::vec![info.iterations as f64, info.error]
}

/// World rotation delta per segment between two position chains.
#[wasm_bindgen(js_name = segmentDeltas)]
pub fn segment_deltas_js(old: &[f64], new: &[f64]) -> Vec<f64> {
    segment_deltas(&points(old), &points(new))
        .iter()
        .flat_map(|q| [q.x, q.y, q.z, q.w])
        .collect()
}

/// Clamped look angles `[yaw, pitch, clamped]`. `limits` is `[yawMin,
/// yawMax, pitchMin, pitchMax]` or empty for the defaults.
#[wasm_bindgen(js_name = lookAngles)]
pub fn look_angles_js(frame: &[f64], origin: &[f64], target: &[f64], limits: &[f64]) -> Vec<f64> {
    let lim = if limits.len() >= 4 {
        LookLimits {
            yaw_min: limits[0],
            yaw_max: limits[1],
            pitch_min: limits[2],
            pitch_max: limits[3],
        }
    } else {
        LookLimits::default()
    };
    let a = look_angles(q4(frame), v3(origin, 0), v3(target, 0), lim);
    alloc::vec![a.yaw, a.pitch, if a.clamped { 1.0 } else { 0.0 }]
}

/// World deltas, `x y z w` per weight.
#[wasm_bindgen(js_name = lookChain)]
pub fn look_chain_js(frame: &[f64], yaw: f64, pitch: f64, weights: &[f64]) -> Vec<f64> {
    look_chain(q4(frame), yaw, pitch, weights)
        .iter()
        .flat_map(|q| [q.x, q.y, q.z, q.w])
        .collect()
}

#[wasm_bindgen(js_name = clampDirection)]
pub fn clamp_direction_js(head: &[f64], dir: &[f64], max_yaw: f64, max_pitch: f64) -> Vec<f64> {
    let d = clamp_direction(q4(head), v3(dir, 0), max_yaw, max_pitch);
    alloc::vec![d.x, d.y, d.z]
}

/// `points` holds hand, lower arm, and optionally index1 and little1.
/// Returns `[forward xyz, across xyz, normal xyz, grip xyz, fingerAxis xyz,
/// angle1, angle2, angle3, thumbAxis xyz, thumbAngle]` for a curl `amount`.
#[wasm_bindgen(js_name = handCurl)]
pub fn hand_curl(points_in: &[f64], left: bool, amount: f64) -> Vec<f64> {
    let p = points(points_in);
    let f = hand_frame(p[0], p[1], p.get(2).copied(), p.get(3).copied(), left);
    let c = finger_curl(&f, left, amount);
    let mut o = Vec::with_capacity(22);
    for x in [f.forward, f.across, f.normal, f.grip, c.finger_axis] {
        o.extend_from_slice(&[x.x, x.y, x.z]);
    }
    o.extend_from_slice(&c.finger_angles);
    o.extend_from_slice(&[
        c.thumb_axis.x,
        c.thumb_axis.y,
        c.thumb_axis.z,
        c.thumb_angle,
    ]);
    o
}

#[wasm_bindgen(js_name = pelvisDrop)]
pub fn pelvis_drop_js(hip: &[f64], foot: &[f64], reach: f64, up: &[f64]) -> f64 {
    pelvis_drop(v3(hip, 0), v3(foot, 0), reach, v3(up, 0))
}

#[wasm_bindgen(js_name = ContactLock)]
pub struct ContactLockJs(ContactLock);

#[wasm_bindgen(js_class = ContactLock)]
impl ContactLockJs {
    #[wasm_bindgen(constructor)]
    pub fn new(threshold: f64, release: f64) -> ContactLockJs {
        ContactLockJs(ContactLock::new(threshold, release))
    }
    pub fn locked(&self) -> bool {
        self.0.locked()
    }
    /// Writes the foot position for this frame into `out`.
    pub fn update(&mut self, dt: f64, target: &[f64], contact: f64, out: &mut [f64]) {
        let p = self.0.update(dt, v3(target, 0), contact);
        p.write(&mut out[0..3]);
    }
}
