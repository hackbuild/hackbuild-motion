//! wasm-bindgen surface over flat arrays. A skeleton is names, parents
//! (-1 for a root), rest translations `x y z` and rest rotations `x y z w`
//! per joint. A clip is times, rotations (`frames x joints x 4`),
//! translations (`frames x joints x 3`) and a per joint flag for keyed
//! translation. A motion is times, a keyed flag per humanoid bone (55),
//! rotations (`frames x 55 x 4`, identity where not keyed) and hips
//! offsets (`frames x 3`, empty when absent).

use crate::analyze::analyze;
use crate::bvh::parse_bvh;
use crate::floor::settle_on_floor;
use crate::motion::HumanoidMotion;
use crate::rest_frame::rest_from_first_frame;
use crate::retarget::{RetargetError, Rig, reference_skeleton, retarget_limb};
use crate::skeleton::{Clip, Skeleton};
use crate::vmd::VmdFile;
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;
use organic::{Quat, Vec3};
use rig::bones::ALL;
use wasm_bindgen::prelude::*;

fn quats(s: &[f64]) -> Vec<Quat> {
    s.as_chunks::<4>()
        .0
        .iter()
        .map(|c| Quat::from_slice(c))
        .collect()
}
fn vecs(s: &[f64]) -> Vec<Vec3> {
    s.as_chunks::<3>()
        .0
        .iter()
        .map(|c| Vec3::from_slice(c))
        .collect()
}

fn skeleton(names: Vec<String>, parents: &[i32], rest_t: &[f64], rest_r: &[f64]) -> Skeleton {
    let n = names.len();
    Skeleton {
        names,
        parents: (0..n)
            .map(|i| {
                parents
                    .get(i)
                    .copied()
                    .filter(|p| *p >= 0)
                    .map(|p| p as usize)
            })
            .collect(),
        rest_t: vecs(rest_t),
        rest_r: quats(rest_r),
    }
}

fn clip(
    times: &[f64],
    rotations: &[f64],
    translations: &[f64],
    moves: &[u8],
    joints: usize,
) -> Clip {
    let frames = times.len();
    let rot = quats(rotations);
    let tr = vecs(translations);
    Clip {
        times: times.to_vec(),
        rotations: (0..frames)
            .map(|f| {
                rot.get(f * joints..(f + 1) * joints)
                    .map(|s| s.to_vec())
                    .unwrap_or_default()
            })
            .collect(),
        translations: (0..frames)
            .map(|f| {
                tr.get(f * joints..(f + 1) * joints)
                    .map(|s| s.to_vec())
                    .unwrap_or_default()
            })
            .collect(),
        moves: (0..joints)
            .map(|j| moves.get(j).copied().unwrap_or(0) != 0)
            .collect(),
    }
}

fn err(e: RetargetError) -> JsError {
    match e {
        RetargetError::Missing(b) => {
            let names: Vec<&str> = b.iter().map(|x| x.name()).collect();
            JsError::new(&format!("missing humanoid bones: {}", names.join(", ")))
        }
        RetargetError::NoRestFrame => {
            JsError::new("rest pose needs the hips, the head and both arms")
        }
        RetargetError::NotOrdered => JsError::new("joints must list parents before children"),
    }
}

#[wasm_bindgen(js_name = goldenTrace)]
pub fn golden_trace(seed: u32) -> Vec<f64> {
    crate::golden::trace(seed)
}

/// A skeleton with a clip on it.
#[wasm_bindgen]
pub struct SkeletalClip {
    skel: Skeleton,
    clip: Clip,
}

#[wasm_bindgen]
impl SkeletalClip {
    pub fn names(&self) -> Vec<String> {
        self.skel.names.clone()
    }
    pub fn parents(&self) -> Vec<i32> {
        self.skel
            .parents
            .iter()
            .map(|p| p.map_or(-1, |p| p as i32))
            .collect()
    }
    #[wasm_bindgen(js_name = restT)]
    pub fn rest_t(&self) -> Vec<f64> {
        self.skel
            .rest_t
            .iter()
            .flat_map(|v| [v.x, v.y, v.z])
            .collect()
    }
    #[wasm_bindgen(js_name = restR)]
    pub fn rest_r(&self) -> Vec<f64> {
        self.skel
            .rest_r
            .iter()
            .flat_map(|q| [q.x, q.y, q.z, q.w])
            .collect()
    }
    pub fn times(&self) -> Vec<f64> {
        self.clip.times.clone()
    }
    pub fn rotations(&self) -> Vec<f64> {
        self.clip
            .rotations
            .iter()
            .flatten()
            .flat_map(|q| [q.x, q.y, q.z, q.w])
            .collect()
    }
    pub fn translations(&self) -> Vec<f64> {
        self.clip
            .translations
            .iter()
            .flatten()
            .flat_map(|v| [v.x, v.y, v.z])
            .collect()
    }
    pub fn moves(&self) -> Vec<u8> {
        self.clip.moves.iter().map(|m| *m as u8).collect()
    }
}

#[wasm_bindgen(js_name = parseBvh)]
pub fn parse_bvh_js(text: &str) -> Result<SkeletalClip, JsError> {
    let (skel, clip) = parse_bvh(text).map_err(|e| JsError::new(&e.0))?;
    Ok(SkeletalClip { skel, clip })
}

/// When the first frame is the better T pose: the skeleton with it as the
/// rest and the clip without it. Otherwise undefined.
#[wasm_bindgen(js_name = restFromFirstFrame)]
pub fn rest_from_first_frame_js(
    names: Vec<String>,
    parents: &[i32],
    rest_t: &[f64],
    rest_r: &[f64],
    times: &[f64],
    rotations: &[f64],
    translations: &[f64],
    moves: &[u8],
) -> Option<SkeletalClip> {
    let s = skeleton(names, parents, rest_t, rest_r);
    let c = clip(times, rotations, translations, moves, s.len());
    rest_from_first_frame(&s, &c).map(|(skel, clip)| SkeletalClip { skel, clip })
}

#[wasm_bindgen(js_name = referenceSkeleton)]
pub fn reference_skeleton_js() -> SkeletalClip {
    let skel = reference_skeleton();
    let n = skel.len();
    SkeletalClip {
        clip: Clip {
            times: Vec::new(),
            rotations: Vec::new(),
            translations: Vec::new(),
            moves: alloc::vec![false; n],
        },
        skel,
    }
}

#[wasm_bindgen(js_name = HumanoidMotion)]
pub struct MotionJs(HumanoidMotion);

#[wasm_bindgen(js_class = HumanoidMotion)]
impl MotionJs {
    #[wasm_bindgen(constructor)]
    pub fn new(times: &[f64], keyed: &[u8], rotations: &[f64], hips: &[f64]) -> MotionJs {
        let frames = times.len();
        let q = quats(rotations);
        let mut m = HumanoidMotion::empty(times.to_vec());
        for b in 0..ALL.len() {
            if keyed.get(b).copied().unwrap_or(0) != 0 {
                m.rotations[b] = Some(
                    (0..frames)
                        .map(|f| q.get(f * 55 + b).copied().unwrap_or(Quat::IDENTITY))
                        .collect(),
                );
            }
        }
        if hips.len() >= frames * 3 && frames > 0 {
            m.hips = Some(vecs(hips));
        }
        MotionJs(m)
    }
    pub fn times(&self) -> Vec<f64> {
        self.0.times.clone()
    }
    pub fn keyed(&self) -> Vec<u8> {
        self.0.rotations.iter().map(|r| r.is_some() as u8).collect()
    }
    pub fn rotations(&self) -> Vec<f64> {
        let mut o = Vec::with_capacity(self.0.frames() * 55 * 4);
        for f in 0..self.0.frames() {
            for b in ALL {
                let q = self.0.rotation(*b, f);
                o.extend_from_slice(&[q.x, q.y, q.z, q.w]);
            }
        }
        o
    }
    pub fn hips(&self) -> Vec<f64> {
        self.0
            .hips
            .as_ref()
            .map(|h| h.iter().flat_map(|v| [v.x, v.y, v.z]).collect())
            .unwrap_or_default()
    }
    pub fn pack(&self) -> Vec<u8> {
        self.0.pack()
    }
    pub fn unpack(bytes: &[u8]) -> Option<MotionJs> {
        HumanoidMotion::unpack(bytes).map(MotionJs)
    }
    #[wasm_bindgen(js_name = startAtOrigin)]
    pub fn start_at_origin(&mut self) {
        self.0.start_at_origin();
    }
    /// Settles the motion on the floor; returns the shift in meters.
    #[wasm_bindgen(js_name = settleOnFloor)]
    pub fn settle(&mut self) -> f64 {
        settle_on_floor(&mut self.0)
    }
    /// `[duration, looping, pose, headPitch, energy]`.
    pub fn analyze(&self) -> Vec<f64> {
        let f = analyze(&self.0);
        alloc::vec![
            f.duration,
            f.looping as u8 as f64,
            f.pose as u8 as f64,
            f.head_pitch,
            f.energy
        ]
    }
    /// The tags `analyze` finds, comma separated.
    pub fn tags(&self) -> String {
        analyze(&self.0).tags.join(",")
    }
}

/// A mapped and measured skeleton.
#[wasm_bindgen(js_name = Rig)]
pub struct RigJs(Rig);

#[wasm_bindgen(js_class = Rig)]
impl RigJs {
    /// `unit` is meters per source unit, or NaN to guess from the rest height.
    #[wasm_bindgen(constructor)]
    pub fn new(
        names: Vec<String>,
        parents: &[i32],
        rest_t: &[f64],
        rest_r: &[f64],
        unit: f64,
    ) -> Result<RigJs, JsError> {
        let s = skeleton(names, parents, rest_t, rest_r);
        Rig::new(s, if unit.is_finite() { Some(unit) } else { None })
            .map(RigJs)
            .map_err(err)
    }
    pub fn unit(&self) -> f64 {
        self.0.unit
    }
    #[wasm_bindgen(js_name = hipsHeight)]
    pub fn hips_height(&self) -> f64 {
        self.0.hips_height
    }
    pub fn fix(&self) -> Vec<f64> {
        let q = self.0.fix;
        alloc::vec![q.x, q.y, q.z, q.w]
    }
    /// Humanoid bone index per joint, -1 when unmapped.
    pub fn bones(&self) -> Vec<i32> {
        self.0
            .map
            .bones
            .iter()
            .map(|b| b.map_or(-1, |b| b.index() as i32))
            .collect()
    }
    #[wasm_bindgen(js_name = toHumanoid)]
    pub fn to_humanoid(
        &self,
        times: &[f64],
        rotations: &[f64],
        translations: &[f64],
        moves: &[u8],
    ) -> MotionJs {
        let c = clip(times, rotations, translations, moves, self.0.skeleton.len());
        MotionJs(self.0.to_humanoid(&c))
    }
    pub fn bind(&self, motion: &MotionJs) -> SkeletalClip {
        SkeletalClip {
            skel: self.0.skeleton.clone(),
            clip: self.0.bind(&motion.0),
        }
    }
    /// One pose from another rig: source joint world rotations and
    /// positions in, this rig's local rotations and translations out as
    /// `[rotations..., translations...]`.
    #[wasm_bindgen(js_name = retargetPose)]
    pub fn retarget_pose(&self, src: &RigJs, world_r: &[f64], world_p: &[f64]) -> Vec<f64> {
        let (n, off) = src.0.pose_to_normalized(&quats(world_r), &vecs(world_p));
        let (lr, lt) = self.0.normalized_to_pose(&n, Some(off));
        lr.iter()
            .flat_map(|q| [q.x, q.y, q.z, q.w])
            .chain(lt.iter().flat_map(|v| [v.x, v.y, v.z]))
            .collect()
    }
}

/// A VMD file. Names are raw Shift-JIS; decode them and pass them to `toClip`.
#[wasm_bindgen(js_name = VmdFile)]
pub struct VmdJs(VmdFile);

#[wasm_bindgen(js_class = VmdFile)]
impl VmdJs {
    pub fn parse(bytes: &[u8]) -> Result<VmdJs, JsError> {
        VmdFile::parse(bytes)
            .map(VmdJs)
            .ok_or_else(|| JsError::new("not a VMD motion file"))
    }
    /// Bone keys from text, `[name, frame, px, py, pz, qx, qy, qz, qw]` per
    /// key with `name` an index into the names later passed to `toClip`.
    #[wasm_bindgen(js_name = fromKeys)]
    pub fn from_keys(keys: &[f64], name_count: usize) -> VmdJs {
        let keys = keys
            .as_chunks::<9>()
            .0
            .iter()
            .map(|k| {
                (
                    k[0] as usize,
                    k[1] as u32,
                    Vec3::new(k[2], k[3], k[4]),
                    Quat::new(k[5], k[6], k[7], k[8]),
                )
            })
            .collect();
        VmdJs(VmdFile::from_keys(keys, name_count))
    }
    #[wasm_bindgen(js_name = nameCount)]
    pub fn name_count(&self) -> usize {
        self.0.names.len()
    }
    #[wasm_bindgen(js_name = nameBytes)]
    pub fn name_bytes(&self, i: usize) -> Vec<u8> {
        self.0.names.get(i).cloned().unwrap_or_default()
    }
    #[wasm_bindgen(js_name = boneKeyCount)]
    pub fn bone_key_count(&self) -> usize {
        self.0.bones.len()
    }
    /// `[name, frame, weight]` per morph key.
    pub fn morphs(&self) -> Vec<f64> {
        self.0
            .morphs
            .iter()
            .flat_map(|k| [k.name as f64, k.frame as f64, k.weight])
            .collect()
    }
    #[wasm_bindgen(js_name = toClip)]
    pub fn to_clip(&self, names: Vec<String>) -> SkeletalClip {
        let (skel, clip) = self.0.to_clip(&names);
        SkeletalClip { skel, clip }
    }
}

/// Humanoid bone index per node (-1 when unmapped), by name and hierarchy.
#[wasm_bindgen(js_name = mapBones)]
pub fn map_bones(names: Vec<String>, parents: &[i32]) -> Vec<i32> {
    let n = names.len();
    let s = skeleton(names, parents, &alloc::vec![0.0; n * 3], &[]);
    rig::map_rig(&s.nodes())
        .bones
        .iter()
        .map(|b| b.map_or(-1, |b| b.index() as i32))
        .collect()
}

#[wasm_bindgen(js_name = retargetLimb)]
pub fn retarget_limb_js(
    src_top: &[f64],
    src_end: &[f64],
    src_len: f64,
    dst_top: &[f64],
    dst_len: f64,
) -> Vec<f64> {
    let v = retarget_limb(
        Vec3::from_slice(src_top),
        Vec3::from_slice(src_end),
        src_len,
        Vec3::from_slice(dst_top),
        dst_len,
    );
    alloc::vec![v.x, v.y, v.z]
}
