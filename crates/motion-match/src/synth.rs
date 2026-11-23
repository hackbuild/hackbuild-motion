//! Synthetic gait clips with planted feet, for tests and examples. Two
//! feet in antiphase step from one planted spot to the next with a minimum
//! jerk swing; each planted spot is where the root is at mid stance, so a
//! stance foot does not move in the world. Three bones: hips, left leg,
//! right leg.

use crate::clip::{Clip, Root};
use crate::db::{Config, Database};
use alloc::vec::Vec;
use organic::curve::minimum_jerk;
use organic::{Quat, Vec3};

const TAU: f64 = core::f64::consts::TAU;
const PI: f64 = core::f64::consts::PI;

#[derive(Clone, Copy, Debug)]
pub struct SynthGait {
    /// Speed at the start, m/s; it ramps linearly to `speed_end`.
    pub speed: f64,
    pub speed_end: f64,
    pub turn_rate: f64,
    /// Whole strides; a looped clip holds exactly this many.
    pub strides: usize,
    pub looped: bool,
    /// Half the distance between the feet, meters.
    pub half_track: f64,
}

/// Stride period in seconds, rounded to whole frames so loops close.
pub fn stride_period(speed: f64, turn_rate: f64, fps: f64) -> f64 {
    let p = if speed > 1e-6 {
        1.0 / (0.8 + 0.3 * speed)
    } else if libm::fabs(turn_rate) > 1e-6 {
        0.8
    } else {
        1.0
    };
    libm::round(p * fps).max(2.0) / fps
}

/// Root at time `t` for a speed ramp from `v0` at 0 to `v1` at `dur`
/// (held outside) and a constant turn rate, by midpoint integration on a
/// fixed 1/480 s grid so every caller gets the same numbers.
fn root_at_time(v0: f64, v1: f64, dur: f64, w: f64, t: f64) -> Root {
    let speed = |s: f64| v0 + (v1 - v0) * (s / dur.max(1e-9)).clamp(0.0, 1.0);
    if v0 == v1 {
        if libm::fabs(w) < 1e-9 {
            return Root::new(0.0, v0 * t, 0.0);
        }
        let r = v0 / w;
        return Root::new(r * (1.0 - libm::cos(w * t)), r * libm::sin(w * t), w * t);
    }
    let h = 1.0 / 480.0;
    let steps = libm::ceil(libm::fabs(t) / h) as usize;
    let h = if steps == 0 { 0.0 } else { t / steps as f64 };
    let (mut x, mut z) = (0.0, 0.0);
    for k in 0..steps {
        let s = (k as f64 + 0.5) * h;
        let v = speed(s);
        x += v * libm::sin(w * s) * h;
        z += v * libm::cos(w * s) * h;
    }
    Root::new(x, z, w * t)
}

pub fn synth_clip(g: SynthGait, fps: f64) -> Clip {
    let top = g.speed.max(g.speed_end);
    let period = stride_period(top, g.turn_rate, fps);
    let moving = top > 1e-6 || libm::fabs(g.turn_rate) > 1e-6;
    let duty = if moving { 0.6 } else { 1.0 };
    let n = libm::round(period * fps) as usize * g.strides.max(1);
    let dur = n as f64 / fps;
    let mut clip = Clip {
        frames: n,
        looped: g.looped,
        root: Vec::with_capacity(n),
        rotations: Vec::with_capacity(3 * n),
        hips: Vec::with_capacity(n),
        feet: Vec::with_capacity(2 * n),
        contacts: Vec::with_capacity(2 * n),
    };
    let anchor = |side: f64, tm: f64| -> Vec3 {
        root_at_time(g.speed, g.speed_end, dur, g.turn_rate, tm).point_to_world(Vec3::new(
            side * g.half_track,
            0.0,
            0.0,
        ))
    };
    for f in 0..n {
        let t = f as f64 / fps;
        let root = root_at_time(g.speed, g.speed_end, dur, g.turn_rate, t);
        clip.root.push(root);
        let v = (g.speed + (g.speed_end - g.speed) * t / dur).min(3.0);
        let lift = if moving { 0.05 + 0.03 * v } else { 0.0 };
        let amp = if moving { 0.15 + 0.15 * v } else { 0.0 };
        let p0 = t / period;
        let bob = if moving {
            0.015 * libm::cos(2.0 * TAU * p0)
        } else {
            0.004 * libm::sin(TAU * p0)
        };
        clip.hips
            .push(Vec3::new(0.01 * libm::sin(TAU * p0), 0.9 + bob, 0.0));
        clip.rotations
            .push(Quat::from_axis_angle(Vec3::Y, 0.05 * libm::sin(TAU * p0)));
        for (side, off) in [(1.0, 0.0), (-1.0, 0.5)] {
            let phi = p0 + off;
            let cyc = libm::floor(phi);
            let fr = phi - cyc;
            let tm = |c: f64| (c + duty * 0.5 - off) * period;
            let (world, stance) = if fr < duty {
                (anchor(side, tm(cyc)), true)
            } else {
                let s = (fr - duty) / (1.0 - duty);
                let a = anchor(side, tm(cyc));
                let b = anchor(side, tm(cyc + 1.0));
                let mut p = a.lerp(b, minimum_jerk(s));
                p.y = lift * libm::sin(PI * s);
                (p, false)
            };
            clip.feet.push(root.point_to_local(world));
            clip.contacts.push(stance);
            clip.rotations
                .push(Quat::from_axis_angle(Vec3::X, amp * libm::sin(TAU * phi)));
        }
    }
    clip
}

/// The clip set the tests and the golden trace use: idle, walk, run,
/// left and right arcs, turn in place, a 2 m/s
/// loop, then one shot starts, stops and speed changes.
pub fn test_clips(fps: f64) -> Vec<Clip> {
    let g = |speed, turn_rate, strides, looped| SynthGait {
        speed,
        speed_end: speed,
        turn_rate,
        strides,
        looped,
        half_track: 0.1,
    };
    let ramp = |speed, speed_end, strides| SynthGait {
        speed,
        speed_end,
        turn_rate: 0.0,
        strides,
        looped: false,
        half_track: 0.1,
    };
    [
        g(0.0, 0.0, 2, true),
        g(1.2, 0.0, 3, true),
        g(3.0, 0.0, 4, true),
        g(1.2, 0.8, 4, false),
        g(1.2, -0.8, 4, false),
        g(0.0, 1.2, 3, true),
        g(2.0, 0.0, 3, true),
        ramp(0.0, 1.2, 3),
        ramp(1.2, 0.0, 3),
        ramp(0.0, 3.0, 4),
        ramp(3.0, 1.2, 4),
        ramp(1.2, 3.0, 4),
    ]
    .into_iter()
    .map(|s| synth_clip(s, fps))
    .collect()
}

pub fn test_database(fps: f64) -> Database {
    Database::build(fps, test_clips(fps), Config::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stance_feet_stay_put_in_the_world() {
        for clip in test_clips(30.0) {
            let mut worst: f64 = 0.0;
            for f in 1..clip.frames {
                for k in 0..2 {
                    if clip.contacts[f * 2 + k] && clip.contacts[(f - 1) * 2 + k] {
                        let a = clip.root[f - 1].point_to_world(clip.feet[(f - 1) * 2 + k]);
                        let b = clip.root[f].point_to_world(clip.feet[f * 2 + k]);
                        worst = worst.max(a.distance(b));
                    }
                }
            }
            assert!(worst < 1e-9, "{worst}");
        }
    }

    #[test]
    fn looped_clips_close() {
        for clip in test_clips(30.0).into_iter().filter(|c| c.looped) {
            let n = clip.frames;
            let next = clip.root_at(n as i64);
            let after_last = clip.root[n - 1].relative(next);
            let step = clip.root[n - 2].relative(clip.root[n - 1]);
            assert!((after_last.z - step.z).abs() < 1e-9);
            assert!(clip.feet[0].distance(clip.feet[(n - 1) * 2]) < 0.2);
        }
    }
}
