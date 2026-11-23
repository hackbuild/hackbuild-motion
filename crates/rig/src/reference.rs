//! A reference humanoid in the normalized space: T pose, +Z forward, left
//! on +X, meters, feet at y = 0, 1.70 m tall (proportions chosen for this
//! library from common adult averages; inferred, not measured on a body).

use crate::bones::{ALL, HumanBone};
use organic::Vec3;

/// Rest position of every bone's joint in meters.
pub fn reference_position(b: HumanBone) -> Vec3 {
    use HumanBone::*;
    let (side, base) = match b.side() {
        Some(crate::bones::Side::Right) => (-1.0, b.mirror()),
        _ => (1.0, b),
    };
    let v = match base {
        Hips => Vec3::new(0.0, 0.95, 0.0),
        Spine => Vec3::new(0.0, 1.04, 0.0),
        Chest => Vec3::new(0.0, 1.17, 0.0),
        UpperChest => Vec3::new(0.0, 1.30, 0.0),
        Neck => Vec3::new(0.0, 1.46, 0.0),
        Head => Vec3::new(0.0, 1.56, 0.0),
        Jaw => Vec3::new(0.0, 1.58, 0.03),
        LeftEye => Vec3::new(0.032, 1.64, 0.07),
        LeftUpperLeg => Vec3::new(0.09, 0.91, 0.0),
        LeftLowerLeg => Vec3::new(0.09, 0.50, 0.0),
        LeftFoot => Vec3::new(0.09, 0.08, 0.0),
        LeftToes => Vec3::new(0.09, 0.02, 0.13),
        LeftShoulder => Vec3::new(0.03, 1.40, 0.0),
        LeftUpperArm => Vec3::new(0.17, 1.41, 0.0),
        LeftLowerArm => Vec3::new(0.45, 1.41, 0.0),
        LeftHand => Vec3::new(0.70, 1.41, 0.0),
        LeftThumbMetacarpal => Vec3::new(0.72, 1.40, 0.03),
        LeftThumbProximal => Vec3::new(0.75, 1.39, 0.05),
        LeftThumbDistal => Vec3::new(0.78, 1.38, 0.06),
        _ => {
            // four fingers: proximal 9 cm past the wrist, segments 4, 3, 2.5 cm
            let f = (base.index() - LeftIndexProximal.index()) / 3;
            let seg = (base.index() - LeftIndexProximal.index()) % 3;
            let z = [0.03, 0.01, -0.01, -0.03][f.min(3)];
            let x = 0.79 + [0.0, 0.04, 0.07][seg] - 0.006 * f as f64;
            Vec3::new(x, 1.41, z)
        }
    };
    Vec3::new(v.x * side, v.y, v.z)
}

/// Every bone's reference position, indexed by `HumanBone::index`.
pub fn reference_rest() -> [Vec3; 55] {
    let mut out = [Vec3::ZERO; 55];
    for b in ALL {
        out[b.index()] = reference_position(*b);
    }
    out
}
