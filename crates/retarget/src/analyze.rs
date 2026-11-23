//! Tags a motion by playing it on the reference humanoid and measuring the
//! body: hands above the head, hips dropping, the body turning, the head
//! nodding. Head motion is measured relative to the hips, so turning or
//! bending the whole body does not read as a nod. Gesture tags only apply
//! to clips of 6 seconds or less, so a long dance is not tagged by a clap
//! inside it. The tag words must match the action grammar's vocabulary.

use crate::motion::HumanoidMotion;
use crate::retarget::{normalized_world, reference_skeleton};
use alloc::vec::Vec;
use organic::{Quat, Vec3};
use rig::bones::HumanBone::{self, *};
use rig::reference::reference_position;

#[derive(Clone, Debug, PartialEq)]
pub struct Findings {
    pub duration: f64,
    /// First and last frames match closely enough to loop.
    pub looping: bool,
    /// Little or no movement: a held pose.
    pub pose: bool,
    pub tags: Vec<&'static str>,
    /// Mean head pitch relative to the hips, radians, positive up.
    pub head_pitch: f64,
    /// Hand and hip travel per second, in hip heights.
    pub energy: f64,
}

struct Frame {
    hips: Vec3,
    head: Vec3,
    lh: Vec3,
    rh: Vec3,
    hips_yaw: f64,
    head_pitch: f64,
    head_yaw: f64,
}

fn frame_index(times: &[f64], t: f64) -> usize {
    match times.binary_search_by(|x| x.partial_cmp(&t).unwrap_or(core::cmp::Ordering::Less)) {
        Ok(i) => i,
        Err(i) => i.min(times.len().saturating_sub(1)),
    }
}

/// World positions of every humanoid bone of the reference body at frame `f`.
pub fn reference_pose(m: &HumanoidMotion, f: usize) -> ([Vec3; 55], [Quat; 55]) {
    let n = normalized_world(m, f);
    let skel = reference_skeleton();
    let mut wp = [Vec3::ZERO; 55];
    let hips_off = m.hips.as_ref().map_or(Vec3::ZERO, |h| h[f]);
    let hh = reference_position(Hips).y;
    for i in 0..55 {
        wp[i] = match skel.parents[i] {
            Some(p) => wp[p] + n[p].rotate(skel.rest_t[i]),
            None => skel.rest_t[i] + hips_off * hh,
        };
    }
    (wp, n)
}

fn pitch_of(q: Quat) -> f64 {
    let f = q.rotate(Vec3::Z);
    libm::asin(f.y.clamp(-1.0, 1.0))
}

/// Direction changes bigger than `min`: how many times a value swings.
fn swings(xs: &[f64], min: f64) -> usize {
    let mut count = 0;
    let mut dir = 0.0;
    let mut anchor = xs.first().copied().unwrap_or(0.0);
    for &x in xs {
        let d = x - anchor;
        if libm::fabs(d) < min {
            continue;
        }
        let s = if d > 0.0 { 1.0 } else { -1.0 };
        if dir != 0.0 && s != dir {
            count += 1;
        }
        dir = s;
        anchor = x;
    }
    count
}

fn unwrap_total(a: &[f64]) -> f64 {
    let mut total = 0.0;
    for w in a.windows(2) {
        total += organic::math::wrap_angle(w[1] - w[0]);
    }
    total
}

pub fn analyze(m: &HumanoidMotion) -> Findings {
    let duration = m.duration();
    let h = reference_position(Hips).y;
    let n = ((duration * 20.0) as usize).clamp(2, 240);
    let frames: Vec<Frame> = (0..n)
        .map(|k| {
            let t = if n > 1 {
                duration * k as f64 / (n - 1) as f64
            } else {
                0.0
            };
            let f = frame_index(&m.times, t);
            let (wp, wr) = reference_pose(m, f);
            let rel = wr[Hips.index()].inverse().mul(wr[Head.index()]);
            Frame {
                hips: wp[Hips.index()],
                head: wp[Head.index()],
                lh: wp[LeftHand.index()],
                rh: wp[RightHand.index()],
                hips_yaw: wr[Hips.index()].yaw(),
                head_pitch: pitch_of(rel),
                head_yaw: rel.yaw(),
            }
        })
        .collect();
    let frac = |f: &dyn Fn(&Frame) -> bool| {
        frames.iter().filter(|x| f(x)).count() as f64 / frames.len() as f64
    };
    let first = &frames[0];
    let last = &frames[frames.len() - 1];
    let short = duration <= 6.0;
    let mut tags: Vec<&'static str> = Vec::new();
    let left_up = frac(&|f| f.lh.y > f.head.y);
    let right_up = frac(&|f| f.rh.y > f.head.y);
    if left_up > 0.25 && right_up > 0.25 {
        tags.push("hands up");
        if short {
            tags.push("cheer");
        }
    } else if short && (left_up > 0.2 || right_up > 0.2) {
        let xs: Vec<f64> = frames
            .iter()
            .map(|f| if left_up > right_up { f.lh.x } else { f.rh.x })
            .collect();
        tags.push(if swings(&xs, 0.04 * h) >= 2 {
            "wave"
        } else {
            "raise hand"
        });
    }
    let min_hips = frames
        .iter()
        .map(|f| f.hips.y)
        .fold(f64::INFINITY, f64::min);
    let max_hips = frames
        .iter()
        .map(|f| f.hips.y)
        .fold(f64::NEG_INFINITY, f64::max);
    if min_hips < first.hips.y - 0.25 * h {
        tags.push("squat");
        tags.push("crouch");
    }
    if max_hips > first.hips.y + 0.12 * h {
        tags.push("jump");
    }
    let yaws: Vec<f64> = frames.iter().map(|f| f.hips_yaw).collect();
    if libm::fabs(unwrap_total(&yaws)) > 300f64.to_radians() {
        tags.push("spin");
        tags.push("turn");
    }
    let travel = frames
        .iter()
        .map(|f| libm::hypot(f.hips.x - first.hips.x, f.hips.z - first.hips.z))
        .fold(0.0, f64::max);
    if travel > 0.6 * h {
        tags.push("walk");
    }
    if short {
        if frac(&|f| (f.head.z - f.hips.z) > 0.35 * h && f.head.y < first.head.y - 0.15 * h) > 0.15
        {
            tags.push("bow");
        }
        let hp: Vec<f64> = frames.iter().map(|f| f.head_pitch).collect();
        if swings(&hp, 0.15) >= 3 {
            tags.push("nod");
        }
        let hy: Vec<f64> = frames.iter().map(|f| f.head_yaw).collect();
        if swings(&hy, 0.2) >= 3 {
            tags.push("shake head");
        }
        let close: Vec<bool> = frames
            .iter()
            .map(|f| f.lh.distance(f.rh) < 0.18 * h)
            .collect();
        let claps = (0..close.len())
            .filter(|&i| close[i] && (i == 0 || !close[i - 1]))
            .count();
        if claps >= 3 {
            tags.push("clap");
        }
        if frac(&|f| f.lh.distance(f.head).min(f.rh.distance(f.head)) < 0.22 * h) > 0.4 {
            tags.push("hand to face");
        }
    }
    let mut moved = 0.0;
    for w in frames.windows(2) {
        moved +=
            w[0].lh.distance(w[1].lh) + w[0].rh.distance(w[1].rh) + w[0].hips.distance(w[1].hips);
    }
    let energy = if duration > 0.0 {
        moved / duration / h
    } else {
        0.0
    };
    let looping = duration > 0.5
        && last.lh.distance(first.lh) + last.rh.distance(first.rh) + last.hips.distance(first.hips)
            < 0.12 * h;
    let pose = duration < 0.05 || moved < 0.05 * h;
    if pose {
        tags.push("pose");
    } else if energy > 2.0 && !short {
        tags.push("dance");
    } else if energy < 0.35 && looping {
        tags.push("idle");
    }
    let head_pitch = frames.iter().map(|f| f.head_pitch).sum::<f64>() / frames.len() as f64;
    Findings {
        duration,
        looping,
        pose,
        tags,
        head_pitch,
        energy,
    }
}

/// The bones `analyze` reads.
pub const TRACKED: [HumanBone; 4] = [Hips, Head, LeftHand, RightHand];
