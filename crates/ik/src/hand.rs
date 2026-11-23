//! Palm frame and grip point from the knuckles, and finger curl.

use organic::Vec3;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HandFrame {
    /// From the wrist toward the knuckles.
    pub forward: Vec3,
    /// From the index knuckle toward the little finger knuckle.
    pub across: Vec3,
    /// Out of the palm.
    pub normal: Vec3,
    /// Where a held object sits: the knuckle midpoint pushed 3.5 cm off the palm.
    pub grip: Vec3,
}

/// The palm frame. With the index and little finger knuckles it is measured
/// from them; without, it is guessed from the forearm and world up.
pub fn hand_frame(
    hand: Vec3,
    lower_arm: Vec3,
    index1: Option<Vec3>,
    little1: Option<Vec3>,
    left: bool,
) -> HandFrame {
    let mut forward = (hand - lower_arm).normalize();
    let (across, knuckles) = match (index1, little1) {
        (Some(i), Some(l)) => {
            let k = (i + l) * 0.5;
            forward = (k - hand).normalize();
            ((l - i).normalize(), k)
        }
        _ => (Vec3::Y.cross(forward).normalize(), hand + forward * 0.08),
    };
    let s = if left { 1.0 } else { -1.0 };
    let normal = across.cross(forward).normalize() * s;
    HandFrame {
        forward,
        across,
        normal,
        grip: knuckles + normal * 0.035,
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Curl {
    /// World axis the four fingers curl about.
    pub finger_axis: Vec3,
    /// Angle for the proximal, intermediate and distal segments.
    pub finger_angles: [f64; 3],
    /// World axis the thumb's last two segments curl about.
    pub thumb_axis: Vec3,
    pub thumb_angle: f64,
}

/// Curl of `amount` (0 open, 1 a fist) as world axis rotations per segment.
pub fn finger_curl(frame: &HandFrame, left: bool, amount: f64) -> Curl {
    let s = if left { 1.0 } else { -1.0 };
    Curl {
        finger_axis: frame.across * s,
        finger_angles: [amount * 0.9, amount * 0.75, amount * 0.75],
        thumb_axis: frame.forward,
        thumb_angle: -amount * 0.35 * s,
    }
}
