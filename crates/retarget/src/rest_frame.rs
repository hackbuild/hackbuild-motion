//! Some files keep a rest pose that is not a T pose and put the T pose in
//! the first frame instead (the cgspeed BVH release of the CMU database
//! rests with the legs splayed about 20 degrees). When the first frame is
//! clearly closer to a T pose than the rest, it becomes the rest and is cut
//! from the clip.

use crate::skeleton::{Clip, Skeleton};
use alloc::vec::Vec;
use organic::Vec3;
use rig::bones::HumanBone::{self, *};
use rig::map_rig;

const LIMBS: [(HumanBone, HumanBone, bool); 4] = [
    (LeftUpperArm, LeftLowerArm, true),
    (RightUpperArm, RightLowerArm, true),
    (LeftUpperLeg, LeftLowerLeg, false),
    (RightUpperLeg, RightLowerLeg, false),
];

/// Radians away from a T pose summed over the limbs (arms level, legs down),
/// in the body's own frame.
fn t_pose_error(p: &[Vec3], node: &dyn Fn(HumanBone) -> Option<usize>) -> Option<f64> {
    let up = (p[node(Head)?] - p[node(Hips)?]).normalize();
    let mut err = 0.0;
    for (a, b, arm) in LIMBS {
        let d = (p[node(b)?] - p[node(a)?]).normalize();
        let y = d.dot(up).clamp(-1.0, 1.0);
        err += if arm {
            libm::fabs(libm::asin(y))
        } else {
            libm::acos(-y)
        };
    }
    Some(err)
}

/// The skeleton and clip with the first frame as the rest, when that frame
/// is the better T pose; `None` otherwise.
pub fn rest_from_first_frame(skel: &Skeleton, clip: &Clip) -> Option<(Skeleton, Clip)> {
    if clip.frames() < 2 {
        return None;
    }
    let map = map_rig(&skel.nodes());
    let node = |b: HumanBone| map.node(b);
    let (_, rest_p) = skel.rest_world();
    let (_, first_p) = skel.pose(clip, 0);
    let rest_err = t_pose_error(&rest_p, &node)?;
    let first_err = t_pose_error(&first_p, &node)?;
    if !(first_err < 0.5 && first_err < rest_err - 0.2) {
        return None;
    }
    let mut s = skel.clone();
    s.rest_r = clip.rotations[0].clone();
    for j in 0..s.len() {
        if clip.moves.get(j) == Some(&true) {
            s.rest_t[j] = clip.translations[0][j];
        }
    }
    let t0 = clip.times[1];
    let c = Clip {
        times: clip.times[1..].iter().map(|t| t - t0).collect::<Vec<_>>(),
        rotations: clip.rotations[1..].to_vec(),
        translations: clip.translations[1..].to_vec(),
        moves: clip.moves.clone(),
    };
    Some((s, c))
}
