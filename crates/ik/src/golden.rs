//! A fixed scenario for the native and wasm agreement test.

use crate::chain::{ccd, fabrik};
use crate::contact::{ContactLock, pelvis_drop};
use crate::hand::{finger_curl, hand_frame};
use crate::look::{LookLimits, look_angles, look_chain};
use crate::two_bone::two_bone;
use alloc::vec::Vec;
use organic::{Mulberry32, Quat, Rng, Vec3};

fn v(r: &mut Mulberry32) -> Vec3 {
    Vec3::new(r.next_f64() - 0.5, r.next_f64() - 0.5, r.next_f64() - 0.5)
}

pub fn trace(seed: u32) -> Vec<f64> {
    let mut r = Mulberry32::new(seed);
    let mut out = Vec::new();
    let push = |o: &mut Vec<f64>, x: Vec3| o.extend_from_slice(&[x.x, x.y, x.z]);
    for _ in 0..4 {
        let a = v(&mut r);
        let b = a + v(&mut r);
        let c = b + v(&mut r);
        let s = two_bone(a, b, c, a + v(&mut r), v(&mut r), 0.02);
        push(&mut out, s.mid);
        push(&mut out, s.end);
        out.extend_from_slice(&[s.upper.x, s.upper.w, s.lower.y, s.lower.w]);
    }
    let base: Vec<Vec3> = (0..5)
        .map(|i| Vec3::new(0.0, i as f64 * 0.3, 0.0))
        .collect();
    let t = v(&mut r) + Vec3::Y * 0.5;
    let mut p = base.clone();
    let i = fabrik(&mut p, t, 20, 1e-7, None);
    out.push(i.error);
    for x in &p {
        push(&mut out, *x);
    }
    let mut p = base.clone();
    let i = ccd(&mut p, t, 20, 1e-7, 0.5);
    out.push(i.error);
    for x in &p {
        push(&mut out, *x);
    }
    let frame = Quat::from_axis_angle(Vec3::Y, r.next_f64());
    let a = look_angles(
        frame,
        Vec3::ZERO,
        v(&mut r) + Vec3::Z,
        LookLimits::default(),
    );
    out.extend_from_slice(&[a.yaw, a.pitch]);
    for q in look_chain(frame, a.yaw, a.pitch, &[0.4, 0.6]) {
        out.extend_from_slice(&[q.x, q.y, q.z, q.w]);
    }
    let f = hand_frame(
        Vec3::new(0.7, 1.4, 0.0),
        Vec3::new(0.45, 1.4, 0.0),
        Some(Vec3::new(0.79, 1.4, 0.03)),
        Some(Vec3::new(0.77, 1.4, -0.03)),
        true,
    );
    push(&mut out, f.grip);
    let c = finger_curl(&f, true, 0.7);
    push(&mut out, c.finger_axis);
    out.push(c.thumb_angle);
    let mut lock = ContactLock::default();
    for k in 0..6 {
        let x = lock.update(
            1.0 / 30.0,
            Vec3::new(k as f64 * 0.05, 0.0, 0.0),
            if k < 3 { 1.0 } else { 0.0 },
        );
        push(&mut out, x);
    }
    out.push(pelvis_drop(
        Vec3::new(0.0, 0.9, 0.0),
        Vec3::new(0.0, 0.0, 0.4),
        0.88,
        Vec3::Y,
    ));
    out
}
