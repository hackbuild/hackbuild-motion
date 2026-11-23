//! Look at with clamps, spread over a chain (spine, neck, head), and eye
//! aim clamped to where the head points. Frames are +Z forward, +Y up,
//! +X left, as in the normalized humanoid space.

use alloc::vec::Vec;
use organic::{Quat, Vec3};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LookLimits {
    pub yaw_min: f64,
    pub yaw_max: f64,
    /// Negative is down.
    pub pitch_min: f64,
    pub pitch_max: f64,
}

impl Default for LookLimits {
    /// Head and neck together: 1.25 rad either way, 0.8 down, 0.6 up.
    fn default() -> Self {
        LookLimits {
            yaw_min: -1.25,
            yaw_max: 1.25,
            pitch_min: -0.8,
            pitch_max: 0.6,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LookAngles {
    /// Positive turns toward +X (the character's left).
    pub yaw: f64,
    /// Positive looks up.
    pub pitch: f64,
    pub clamped: bool,
    /// The target lies past the yaw limit: the body should turn.
    pub behind: bool,
    /// Yaw the head chain cannot take; hand it to body turning.
    pub body_yaw: f64,
}

/// Past this yaw a target sits near the atan2 seam directly behind.
pub const SEAM: f64 = 2.2;

/// Raw yaw with hysteresis at the seam: when the target is past [`SEAM`]
/// and the sign flipped against a previous yaw of real size, keep the
/// previous side (pi on that side), so the head does not whip across.
pub fn seam_yaw(yaw: f64, prev_yaw: f64) -> f64 {
    if libm::fabs(yaw) > SEAM && libm::fabs(prev_yaw) > 0.4 && (yaw > 0.0) != (prev_yaw > 0.0) {
        if prev_yaw > 0.0 {
            core::f64::consts::PI
        } else {
            -core::f64::consts::PI
        }
    } else {
        yaw
    }
}

/// Yaw and pitch of `target` from `origin`, in the frame `frame`, clamped.
pub fn look_angles(frame: Quat, origin: Vec3, target: Vec3, lim: LookLimits) -> LookAngles {
    look_angles_from(frame, origin, target, lim, 0.0)
}

/// [`look_angles`] with seam hysteresis against the previous frame's raw yaw
/// (`prev_yaw`, 0 for none). Pass back `yaw + body_yaw` next frame.
pub fn look_angles_from(
    frame: Quat,
    origin: Vec3,
    target: Vec3,
    lim: LookLimits,
    prev_yaw: f64,
) -> LookAngles {
    let l = frame.inverse().rotate(target - origin);
    let yaw = seam_yaw(libm::atan2(l.x, l.z), prev_yaw);
    let pitch = libm::atan2(l.y, libm::sqrt(l.x * l.x + l.z * l.z));
    let cy = yaw.clamp(lim.yaw_min, lim.yaw_max);
    let cp = pitch.clamp(lim.pitch_min, lim.pitch_max);
    LookAngles {
        yaw: cy,
        pitch: cp,
        clamped: cy != yaw || cp != pitch,
        behind: cy != yaw,
        body_yaw: yaw - cy,
    }
}

/// World deltas, one per bone from the base of the chain to its tip, that
/// share `yaw` and `pitch` by `weights`. Apply them parent first.
pub fn look_chain(frame: Quat, yaw: f64, pitch: f64, weights: &[f64]) -> Vec<Quat> {
    let up = frame.rotate(Vec3::Y);
    let left = frame.rotate(Vec3::X);
    let mut acc = 0.0;
    weights
        .iter()
        .map(|w| {
            acc += yaw * w;
            let qy = Quat::from_axis_angle(up, yaw * w);
            let axis = Quat::from_axis_angle(up, acc).rotate(left);
            Quat::from_axis_angle(axis, -pitch * w).mul(qy)
        })
        .collect()
}

/// `dir` limited to within `max_yaw` and `max_pitch` of the head's forward
/// (+Z of `head`). Eyes past those limits read as a glare.
pub fn clamp_direction(head: Quat, dir: Vec3, max_yaw: f64, max_pitch: f64) -> Vec3 {
    let l = head.inverse().rotate(dir.normalize());
    let yaw = libm::atan2(l.x, l.z).clamp(-max_yaw, max_yaw);
    let pitch = libm::atan2(l.y, libm::sqrt(l.x * l.x + l.z * l.z)).clamp(-max_pitch, max_pitch);
    let cp = libm::cos(pitch);
    head.rotate(Vec3::new(
        libm::sin(yaw) * cp,
        libm::sin(pitch),
        libm::cos(yaw) * cp,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chain_turns_forward_onto_target() {
        let frame = Quat::from_axis_angle(Vec3::Y, 0.4);
        let target = Vec3::new(1.0, 1.3, 1.0);
        let a = look_angles(
            frame,
            Vec3::ZERO,
            target,
            LookLimits {
                yaw_min: -3.0,
                yaw_max: 3.0,
                pitch_min: -1.5,
                pitch_max: 1.5,
            },
        );
        assert!(!a.clamped);
        let d = look_chain(frame, a.yaw, a.pitch, &[0.3, 0.3, 0.4]);
        let mut q = frame;
        for x in &d {
            q = x.mul(q);
        }
        let f = q.rotate(Vec3::Z);
        assert!((f - target.normalize()).length() < 1e-9, "{f:?}");
    }

    #[test]
    fn seam_keeps_the_side_it_turned_to() {
        let lim = LookLimits::default();
        // a target sweeping behind from the left: raw yaw crosses +pi to -pi
        let mut prev = 0.0;
        let mut sides = alloc::vec::Vec::new();
        for k in 0..60 {
            let a = 1.0 + k as f64 * 0.05;
            let t = Vec3::new(libm::sin(a), 0.0, libm::cos(a));
            let r = look_angles_from(Quat::IDENTITY, Vec3::ZERO, t, lim, prev);
            prev = r.yaw + r.body_yaw;
            sides.push(r.yaw);
            if a > 1.25 {
                assert!(r.behind && r.body_yaw > 0.0);
            }
        }
        assert!(
            sides.iter().all(|y| *y > 0.0),
            "head crossed the seam: {sides:?}"
        );
        // without history it whips to the other side
        let t = Vec3::new(libm::sin(3.3), 0.0, libm::cos(3.3));
        assert!(look_angles(Quat::IDENTITY, Vec3::ZERO, t, lim).yaw < 0.0);
    }

    #[test]
    fn clamps() {
        let a = look_angles(
            Quat::IDENTITY,
            Vec3::ZERO,
            Vec3::new(0.0, 0.0, -1.0),
            LookLimits::default(),
        );
        assert!(a.clamped && a.yaw.abs() <= 1.25 + 1e-12);
        let d = clamp_direction(Quat::IDENTITY, Vec3::new(1.0, 0.0, 0.2), 0.43, 0.17);
        assert!((libm::atan2(d.x, d.z) - 0.43).abs() < 1e-9);
    }
}
