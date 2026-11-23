//! BVH reader. Joints and End Sites become skeleton joints (an End Site is
//! named after its parent with `End` appended, which the mapper treats as a
//! helper). Rotation channels compose in the order the file lists them, in
//! degrees; position channels replace the joint's offset.
//!
//! Position channels are where the joint is in the file's world. Many
//! capture files (CMU style) give the root an OFFSET of 0 0 0 and carry the
//! hips height only in the channels; their rest then stands one hip height
//! under the floor the motion walks on, and a retarget measured against
//! that rest floats the clip by the same height. A root with a zero OFFSET
//! and a Y position channel is rested on the first frame's floor: the
//! lowest joint at frame 0 is taken as the floor, and the rest root stands
//! above it by the rest pose's root to lowest joint height. A clip that
//! starts in a crouch still rests at standing height, and rest and motion
//! share one floor.

use crate::skeleton::{Clip, Skeleton};
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;
use organic::{Quat, Vec3};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Ch {
    Px,
    Py,
    Pz,
    Rx,
    Ry,
    Rz,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BvhError(pub String);

/// Parses a BVH file into a skeleton and a clip.
pub fn parse_bvh(text: &str) -> Result<(Skeleton, Clip), BvhError> {
    let mut toks = text.split_ascii_whitespace().peekable();
    let err = |m: &str| BvhError(m.to_string());
    let mut names: Vec<String> = Vec::new();
    let mut parents: Vec<Option<usize>> = Vec::new();
    let mut offsets: Vec<Vec3> = Vec::new();
    let mut channels: Vec<Vec<Ch>> = Vec::new();
    let mut stack: Vec<usize> = Vec::new();
    let mut pending: Option<usize> = None;
    let num = |t: Option<&str>| -> Result<f64, BvhError> {
        t.ok_or(BvhError("unexpected end".into()))?
            .parse::<f64>()
            .map_err(|_| BvhError("bad number".into()))
    };
    if toks.next() != Some("HIERARCHY") {
        return Err(err("not a BVH file: HIERARCHY missing"));
    }
    loop {
        let Some(t) = toks.next() else {
            return Err(err("MOTION section missing"));
        };
        match t {
            "ROOT" | "JOINT" => {
                let name = toks.next().ok_or(err("joint without a name"))?.to_string();
                names.push(name);
                parents.push(stack.last().copied());
                offsets.push(Vec3::ZERO);
                channels.push(Vec::new());
                pending = Some(names.len() - 1);
            }
            "End" => {
                toks.next();
                let p = stack.last().copied();
                let base = p.map_or(String::from("root"), |i| names[i].clone());
                names.push(format!("{base}End"));
                parents.push(p);
                offsets.push(Vec3::ZERO);
                channels.push(Vec::new());
                pending = Some(names.len() - 1);
            }
            "{" => {
                let j = pending.take().ok_or(err("brace without a joint"))?;
                stack.push(j);
            }
            "}" => {
                stack.pop();
            }
            "OFFSET" => {
                let j = *stack.last().ok_or(err("OFFSET outside a joint"))?;
                offsets[j] = Vec3::new(num(toks.next())?, num(toks.next())?, num(toks.next())?);
            }
            "CHANNELS" => {
                let j = *stack.last().ok_or(err("CHANNELS outside a joint"))?;
                let n = num(toks.next())? as usize;
                for _ in 0..n {
                    let c = match toks.next().ok_or(err("channel list cut short"))? {
                        "Xposition" => Ch::Px,
                        "Yposition" => Ch::Py,
                        "Zposition" => Ch::Pz,
                        "Xrotation" => Ch::Rx,
                        "Yrotation" => Ch::Ry,
                        "Zrotation" => Ch::Rz,
                        other => return Err(BvhError(format!("unknown channel {other}"))),
                    };
                    channels[j].push(c);
                }
            }
            "MOTION" => break,
            other => return Err(BvhError(format!("unexpected token {other}"))),
        }
    }
    if toks.next() != Some("Frames:") {
        return Err(err("Frames: missing"));
    }
    let frames = num(toks.next())? as usize;
    if toks.next() != Some("Frame") || toks.next() != Some("Time:") {
        return Err(err("Frame Time: missing"));
    }
    let dt = num(toks.next())?;
    let n = names.len();
    let moves: Vec<bool> = channels
        .iter()
        .map(|c| c.iter().any(|x| matches!(x, Ch::Px | Ch::Py | Ch::Pz)))
        .collect();
    let mut clip = Clip {
        times: Vec::with_capacity(frames.min(MAX_RESERVE)),
        rotations: Vec::with_capacity(frames.min(MAX_RESERVE)),
        translations: Vec::with_capacity(frames.min(MAX_RESERVE)),
        moves,
    };
    for f in 0..frames {
        let mut rot = alloc::vec![Quat::IDENTITY; n];
        let mut tr = offsets.clone();
        for j in 0..n {
            let mut q = Quat::IDENTITY;
            for c in &channels[j] {
                let v = num(toks.next())?;
                match c {
                    Ch::Px => tr[j].x = v,
                    Ch::Py => tr[j].y = v,
                    Ch::Pz => tr[j].z = v,
                    Ch::Rx => q = q.mul(Quat::from_axis_angle(Vec3::X, v.to_radians())),
                    Ch::Ry => q = q.mul(Quat::from_axis_angle(Vec3::Y, v.to_radians())),
                    Ch::Rz => q = q.mul(Quat::from_axis_angle(Vec3::Z, v.to_radians())),
                }
            }
            rot[j] = q.normalize();
        }
        clip.times.push(f as f64 * dt);
        clip.rotations.push(rot);
        clip.translations.push(tr);
    }
    let mut rest_t = offsets;
    if let (Some(t0), Some(r0)) = (clip.translations.first(), clip.rotations.first()) {
        // world heights at frame 0 and in the rest pose (identity rotations,
        // root at 0); joints are listed parent first
        let mut wy = alloc::vec![0.0; n];
        let mut wr = alloc::vec![Quat::IDENTITY; n];
        let mut ry = alloc::vec![0.0; n];
        for j in 0..n {
            match parents[j] {
                Some(p) => {
                    wy[j] = wy[p] + wr[p].rotate(t0[j]).y;
                    wr[j] = wr[p].mul(r0[j]);
                    ry[j] = ry[p] + rest_t[j].y;
                }
                None => {
                    wy[j] = t0[j].y;
                    wr[j] = r0[j];
                }
            }
        }
        for j in 0..n {
            let zero = rest_t[j].x == 0.0 && rest_t[j].y == 0.0 && rest_t[j].z == 0.0;
            if parents[j].is_none() && zero && channels[j].contains(&Ch::Py) {
                // the frame 0 floor is its lowest joint; the rest root stands
                // that far above it as the rest pose's lowest joint is below
                // the root, so a clip that starts in a crouch does not float
                let (mut floor, mut low) = (wy[j], 0.0f64);
                for k in 0..n {
                    if root_of(&parents, k) == j {
                        floor = floor.min(wy[k]);
                        low = low.min(ry[k]);
                    }
                }
                rest_t[j].y = floor - low;
            }
        }
    }
    let skel = Skeleton {
        names,
        parents,
        rest_t,
        rest_r: alloc::vec![Quat::IDENTITY; n],
    };
    Ok((skel, clip))
}

/// Frames reserved up front; a forged `Frames:` count beyond this grows the
/// vectors as values arrive and fails when the values run out.
const MAX_RESERVE: usize = 1 << 16;

fn root_of(parents: &[Option<usize>], mut j: usize) -> usize {
    while let Some(p) = parents[j] {
        j = p;
    }
    j
}

#[cfg(test)]
mod tests {
    use super::*;

    const BVH: &str = "HIERARCHY
ROOT Hips
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Chest
  {
    OFFSET 0 10 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0 10 0
    }
  }
}
MOTION
Frames: 2
Frame Time: 0.033333
0 90 0 0 0 0 0 0 0
1 90 0 0 0 90 90 0 0";

    #[test]
    fn reads_hierarchy_channels_and_order() {
        let (s, c) = parse_bvh(BVH).unwrap();
        assert_eq!(s.names, ["Hips", "Chest", "ChestEnd"]);
        assert_eq!(s.parents, [None, Some(0), Some(1)]);
        assert_eq!(c.frames(), 2);
        assert!(c.moves[0] && !c.moves[1]);
        assert_eq!(c.translations[1][0], Vec3::new(1.0, 90.0, 0.0));
        // a zero root OFFSET takes the first frame's height as its rest height
        assert_eq!(s.rest_t[0], Vec3::new(0.0, 90.0, 0.0));
        assert_eq!(s.rest_t[1], Vec3::new(0.0, 10.0, 0.0));
        // hips Yrotation 90 turns +Z onto +X
        let z = c.rotations[1][0].rotate(Vec3::Z);
        assert!((z.x - 1.0).abs() < 1e-9);
        // chest Zrotation 90: +Y onto -X
        let y = c.rotations[1][1].rotate(Vec3::Y);
        assert!((y.x + 1.0).abs() < 1e-9);
    }

    #[test]
    fn a_clip_that_starts_in_a_crouch_rests_at_standing_height() {
        // hips to toe is 90 at rest; frame 0 crouches with the hips at 60,
        // both knees bent so the toes stay on the floor at y = 0
        let bvh = "HIERARCHY
ROOT Hips
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Leg
  {
    OFFSET 0 0 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT Shin
    {
      OFFSET 0 -45 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      End Site
      {
        OFFSET 0 -45 0
      }
    }
  }
}
MOTION
Frames: 1
Frame Time: 0.033333
0 60 0 0 0 0 0 -48.189685 0 0 96.37937 0";
        let (s, _) = parse_bvh(bvh).unwrap();
        // the frame 0 floor (toe height) plus the rest hips height above the toe
        assert!((s.rest_t[0].y - 90.0).abs() < 1e-3, "{}", s.rest_t[0].y);
    }

    #[test]
    fn a_forged_frame_count_is_an_error() {
        let bvh = BVH.replace("Frames: 2", "Frames: 1000000000000000");
        assert!(parse_bvh(&bvh).is_err());
    }
}
