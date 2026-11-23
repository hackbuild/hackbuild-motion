//! A fixed scenario for the native and wasm agreement test: a BVH parsed,
//! turned into a humanoid motion, settled, analysed and bound onto the
//! reference skeleton.

use crate::analyze::analyze;
use crate::bvh::parse_bvh;
use crate::floor::settle_on_floor;
use crate::retarget::{Rig, reference_skeleton};
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;
use organic::{Mulberry32, Rng};

/// A small CMU style BVH (centimeters, hips at 95) with seeded motion.
pub fn sample_bvh(seed: u32, frames: usize) -> String {
    let mut r = Mulberry32::new(seed);
    let joints = [
        ("Hips", None, [0.0, 95.0, 0.0]),
        ("Spine", Some(0), [0.0, 10.0, 0.0]),
        ("Spine1", Some(1), [0.0, 15.0, 0.0]),
        ("Neck", Some(2), [0.0, 25.0, 0.0]),
        ("Head", Some(3), [0.0, 10.0, 0.0]),
        ("LeftShoulder", Some(2), [3.0, 20.0, 0.0]),
        ("LeftArm", Some(5), [14.0, 1.0, 0.0]),
        ("LeftForeArm", Some(6), [28.0, 0.0, 0.0]),
        ("LeftHand", Some(7), [25.0, 0.0, 0.0]),
        ("RightShoulder", Some(2), [-3.0, 20.0, 0.0]),
        ("RightArm", Some(9), [-14.0, 1.0, 0.0]),
        ("RightForeArm", Some(10), [-28.0, 0.0, 0.0]),
        ("RightHand", Some(11), [-25.0, 0.0, 0.0]),
        ("LeftUpLeg", Some(0), [9.0, -4.0, 0.0]),
        ("LeftLeg", Some(13), [0.0, -41.0, 0.0]),
        ("LeftFoot", Some(14), [0.0, -42.0, 0.0]),
        ("LeftToeBase", Some(15), [0.0, -6.0, 13.0]),
        ("RightUpLeg", Some(0), [-9.0, -4.0, 0.0]),
        ("RightLeg", Some(17), [0.0, -41.0, 0.0]),
        ("RightFoot", Some(18), [0.0, -42.0, 0.0]),
        ("RightToeBase", Some(19), [0.0, -6.0, 13.0]),
    ];
    let mut s = String::from("HIERARCHY\n");
    let mut depth_stack: Vec<usize> = Vec::new();
    for (i, (name, parent, off)) in joints.iter().enumerate() {
        while let Some(&top) = depth_stack.last() {
            if Some(top) == *parent {
                break;
            }
            depth_stack.pop();
            s += "}\n";
        }
        let kind = if parent.is_none() { "ROOT" } else { "JOINT" };
        let ch = if parent.is_none() {
            "CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation"
        } else {
            "CHANNELS 3 Zrotation Xrotation Yrotation"
        };
        s += &format!(
            "{kind} {name}\n{{\nOFFSET {} {} {}\n{ch}\n",
            off[0], off[1], off[2]
        );
        depth_stack.push(i);
    }
    for _ in depth_stack {
        s += "}\n";
    }
    s += &format!("MOTION\nFrames: {frames}\nFrame Time: 0.0333333\n");
    for f in 0..frames {
        let mut line: Vec<String> = Vec::new();
        line.push(format!("{}", f as f64 * 2.0));
        line.push(format!("{}", 97.0 + 3.0 * r.next_f64()));
        line.push(format!("{}", f as f64 * 4.0));
        for _ in 0..joints.len() * 3 {
            line.push(format!("{:.3}", (r.next_f64() - 0.5) * 30.0));
        }
        s += &line.join(" ");
        s.push('\n');
    }
    s
}

pub fn trace(seed: u32) -> Vec<f64> {
    let text = sample_bvh(seed, 40);
    let (skel, clip) = parse_bvh(&text).expect("sample parses");
    let src = Rig::new(skel, None).expect("sample maps");
    let mut m = src.to_humanoid(&clip);
    m.start_at_origin();
    let shift = settle_on_floor(&mut m);
    let found = analyze(&m);
    let dst = Rig::new(reference_skeleton(), None).expect("reference maps");
    let out_clip = dst.bind(&m);
    let mut out = alloc::vec![
        src.unit,
        src.hips_height,
        shift,
        found.energy,
        found.head_pitch,
        found.tags.len() as f64
    ];
    for f in (0..out_clip.frames()).step_by(7) {
        for j in [0usize, 4, 18, 19, 10] {
            let q = out_clip.rotations[f][j];
            out.extend_from_slice(&[q.x, q.y, q.z, q.w]);
        }
        let h = out_clip.translations[f][0];
        out.extend_from_slice(&[h.x, h.y, h.z]);
    }
    out
}
