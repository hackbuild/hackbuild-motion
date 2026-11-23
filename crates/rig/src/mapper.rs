//! Maps a skeleton's bone names to VRM 1.0 humanoid bones by rules, with no
//! per rig table. Written for this library.
//!
//! The pipeline:
//! 1. each name becomes a side, body part words, a number and a helper flag
//!    ([`crate::tokens`]); MMD Japanese names go through [`crate::mmd`];
//! 2. words map to a candidate bone with a score (an exact `thigh` beats a
//!    `hip` with a side, which CMU uses for a short joint above the thigh);
//! 3. chain shifts fix rigs that spend two names on one VRM bone along a
//!    chain: a shoulder under a collar is the upper arm (Xsens, SMPL), a
//!    foot under an ankle is the toes (SMPL), a lower leg above a shin is
//!    the upper leg (SOMA), a hand under a wrist is dropped (SMPL);
//! 4. claims are settled by score, then by the shallower bone;
//! 5. the spine chain is assigned by depth, since rigs name it differently;
//!    fingers by their numbers, with four joint fingers shifted down.
//!
//! The result reports missing required bones, unmapped and helper bones,
//! losing candidates and a guess at the exporter dialect.

use crate::bones::{ALL, HumanBone, REQUIRED, Side};
use crate::mmd::mmd_bone;
use crate::tokens::{Parsed, parse};
use HumanBone::*;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RigNode {
    pub name: String,
    pub parent: Option<usize>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Dialect {
    Mixamo,
    MixamoLike,
    Vroid,
    Biped,
    Unreal,
    Blender,
    CharacterCreator,
    Smpl,
    Mmd,
    Generic,
}

impl Dialect {
    pub fn name(self) -> &'static str {
        match self {
            Dialect::Mixamo => "mixamo",
            Dialect::MixamoLike => "mixamo-like",
            Dialect::Vroid => "vroid",
            Dialect::Biped => "biped",
            Dialect::Unreal => "unreal",
            Dialect::Blender => "blender",
            Dialect::CharacterCreator => "character-creator",
            Dialect::Smpl => "smpl",
            Dialect::Mmd => "mmd",
            Dialect::Generic => "generic",
        }
    }
}

#[derive(Clone, Debug)]
pub struct RigMap {
    /// Humanoid bone per input node, `None` when unmapped.
    pub bones: Vec<Option<HumanBone>>,
    /// Node per humanoid bone, indexed by `HumanBone::index`.
    pub by_bone: Vec<Option<usize>>,
    pub missing_required: Vec<HumanBone>,
    /// Non helper nodes that took no bone.
    pub unmapped: Vec<usize>,
    pub helpers: Vec<usize>,
    /// Candidates that lost their bone to a better one: node and bone.
    pub ambiguous: Vec<(usize, HumanBone)>,
    /// MMD D deform bones: node and the bone they deform.
    pub deform: Vec<(usize, HumanBone)>,
    pub dialect: Dialect,
}

impl RigMap {
    pub fn node(&self, b: HumanBone) -> Option<usize> {
        self.by_bone[b.index()]
    }
    /// Share of the 15 required bones that mapped, 0 to 1.
    pub fn coverage(&self) -> f64 {
        (REQUIRED.len() - self.missing_required.len()) as f64 / REQUIRED.len() as f64
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Kind {
    Bone(HumanBone, u8),
    Spine,
    Neck,
    Finger(Side, u8, u32),
}

const FINGER_WORDS: &[(&str, u8)] = &[
    ("thumb", 0),
    ("index", 1),
    ("pointer", 1),
    ("middle", 2),
    ("ring", 3),
    ("pinky", 4),
    ("pinkie", 4),
    ("little", 4),
];

fn sided(side: Side, left: HumanBone) -> HumanBone {
    if side == Side::Left {
        left
    } else {
        left.mirror()
    }
}

fn classify(p: &Parsed) -> Option<Kind> {
    let core = p.core();
    if core.is_empty() {
        return None;
    }
    // fingers: Mixamo prefixes "hand", Rigify "f", some rigs suffix "finger"
    let mut f = core.as_str();
    f = f.strip_prefix("hand").unwrap_or(f);
    if let Some(rest) = f.strip_prefix('f')
        && FINGER_WORDS.iter().any(|(w, _)| rest.starts_with(w))
    {
        f = rest;
    }
    for (w, idx) in FINGER_WORDS {
        if let Some(rest) = f.strip_prefix(w) {
            let rest = rest.strip_prefix("finger").unwrap_or(rest);
            let side = p.side?;
            if rest == "metacarpal" {
                return if *idx == 0 {
                    Some(Kind::Bone(sided(side, LeftThumbMetacarpal), 3))
                } else {
                    None
                };
            }
            if !rest.is_empty() {
                return None;
            }
            return Some(Kind::Finger(side, *idx, p.number?));
        }
    }
    if let Some(side) = p.side {
        let (left, score) = match core.as_str() {
            "upleg" | "upperleg" | "thigh" | "upperthigh" | "uplegs" => (LeftUpperLeg, 3),
            "hip" | "hipjoint" => (LeftUpperLeg, 1),
            "leg" | "lowerleg" | "lowleg" | "calf" | "shin" | "knee" | "crus" => (LeftLowerLeg, 3),
            "foot" | "ankle" => (LeftFoot, 3),
            "toe" | "toes" | "toebase" | "ball" | "toebone" => (LeftToes, 3),
            "shoulder" | "clavicle" | "collar" | "clav" | "collarbone" => (LeftShoulder, 3),
            "arm" | "upperarm" | "uparm" | "shldr" => (LeftUpperArm, 3),
            "forearm" | "lowerarm" | "lowarm" | "elbow" => (LeftLowerArm, 3),
            "hand" | "wrist" | "palm" => (LeftHand, 3),
            "eye" | "eyeball" | "faceeye" => (LeftEye, 3),
            _ => return None,
        };
        return Some(Kind::Bone(sided(side, left), score));
    }
    match core.as_str() {
        "hips" | "hip" | "pelvis" => Some(Kind::Bone(Hips, 3)),
        "spine" | "chest" | "upperchest" | "lowerchest" | "back" | "lowerback" | "upperback"
        | "torso" | "abdomen" | "abdomenlower" | "abdomenupper" | "waist" | "stomach" | "belly"
        | "ribcage" => Some(Kind::Spine),
        "neck" | "neckupper" | "necklower" => Some(Kind::Neck),
        "head" => Some(Kind::Bone(Head, 3)),
        "jaw" | "jawbone" | "lowerjaw" => Some(Kind::Bone(Jaw, 3)),
        _ => None,
    }
}

fn finger_bone(side: Side, finger: u8, seg: u32) -> Option<HumanBone> {
    let base = match finger {
        0 => LeftThumbMetacarpal,
        1 => LeftIndexProximal,
        2 => LeftMiddleProximal,
        3 => LeftRingProximal,
        _ => LeftLittleProximal,
    };
    if !(1..=3).contains(&seg) {
        return None;
    }
    ALL.get(base.index() + seg as usize - 1)
        .map(|b| sided(side, *b))
}

fn guess_dialect(nodes: &[RigNode], mmd_hits: usize) -> Dialect {
    let has = |f: &dyn Fn(&str) -> bool| nodes.iter().any(|n| f(&n.name.to_ascii_lowercase()));
    if mmd_hits >= 5 {
        Dialect::Mmd
    } else if has(&|s| s.contains("mixamorig")) {
        Dialect::Mixamo
    } else if has(&|s| s.starts_with("j_bip_")) {
        Dialect::Vroid
    } else if has(&|s| s.contains("cc_base_")) {
        Dialect::CharacterCreator
    } else if has(&|s| s.contains("bip01") || s.contains("bip001")) {
        Dialect::Biped
    } else if has(&|s| s.starts_with("def-") || s.starts_with("org-") || s.ends_with(".l")) {
        Dialect::Blender
    } else if has(&|s| s == "l_collar" || s == "l_hip") {
        Dialect::Smpl
    } else if has(&|s| s.starts_with("spine_0")) && has(&|s| s.ends_with("_l")) {
        Dialect::Unreal
    } else if has(&|s| s == "leftupleg") && has(&|s| s == "lefthand") {
        Dialect::MixamoLike
    } else {
        Dialect::Generic
    }
}

/// Maps `nodes` (each with its parent index) to humanoid bones.
pub fn map_rig(nodes: &[RigNode]) -> RigMap {
    let n = nodes.len();
    // FBX loaders repeat a bone once per skinned mesh as a same named child;
    // the first node of a name is the real one
    let mut first_of_name = vec![true; n];
    for i in 0..n {
        if nodes[..i].iter().any(|o| o.name == nodes[i].name) {
            first_of_name[i] = false;
        }
    }
    let parent = |i: usize| nodes[i].parent.filter(|&p| p < n && p != i);
    // depth walk is bounded: names and parents are not trusted to form a tree
    let depth: Vec<u32> = (0..n)
        .map(|i| {
            let mut d = 0;
            let mut p = parent(i);
            while let Some(q) = p {
                d += 1;
                if d > 256 {
                    break;
                }
                p = parent(q);
            }
            d
        })
        .collect();
    let is_ancestor = |a: usize, mut b: usize| {
        for _ in 0..257 {
            match parent(b) {
                Some(p) if p == a => return true,
                Some(p) => b = p,
                None => return false,
            }
        }
        false
    };

    let parsed: Vec<Parsed> = nodes.iter().map(|x| parse(&x.name)).collect();
    let mut kinds: Vec<Option<Kind>> = vec![None; n];
    let mut deform = Vec::new();
    let mut mmd_hits = 0;
    for i in 0..n {
        if !first_of_name[i] {
            continue;
        }
        if !nodes[i].name.is_ascii()
            && let Some((b, d)) = mmd_bone(&nodes[i].name)
        {
            mmd_hits += 1;
            if d {
                deform.push((i, b));
            } else {
                kinds[i] = Some(Kind::Bone(b, 3));
            }
            continue;
        }
        if parsed[i].helper {
            continue;
        }
        kinds[i] = classify(&parsed[i]);
    }

    // fingers: a fourth joint with a non helper child means the numbering
    // starts at the metacarpal; numbering from zero shifts up by one
    let has_real_child = |i: usize| (0..n).any(|c| parent(c) == Some(i) && !parsed[c].helper);
    let mut finger_min = [[u32::MAX; 5]; 2];
    let mut four = [[false; 5]; 2];
    for i in 0..n {
        if let Some(Kind::Finger(side, f, num)) = kinds[i] {
            let s = (side == Side::Right) as usize;
            finger_min[s][f as usize] = finger_min[s][f as usize].min(num);
            if num == 4 && f != 0 && has_real_child(i) {
                four[s][f as usize] = true;
            }
        }
    }
    let mut cands: Vec<Option<(HumanBone, u8)>> = vec![None; n];
    let mut spine = Vec::new();
    let mut necks = Vec::new();
    for i in 0..n {
        match kinds[i] {
            Some(Kind::Bone(b, s)) => cands[i] = Some((b, s)),
            Some(Kind::Spine) => spine.push(i),
            Some(Kind::Neck) => necks.push(i),
            Some(Kind::Finger(side, f, num)) => {
                let s = (side == Side::Right) as usize;
                let mut seg = num as i64;
                if finger_min[s][f as usize] == 0 {
                    seg += 1;
                }
                if four[s][f as usize] {
                    seg -= 1;
                }
                if seg >= 1 {
                    cands[i] = finger_bone(side, f, seg as u32).map(|b| (b, 3));
                }
            }
            None => {}
        }
    }

    // chain shifts, parents first so a shifted parent is seen by its child
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by_key(|&i| (depth[i], i));
    for &i in &order {
        let (Some((b, s)), Some(p)) = (cands[i], parent(i)) else {
            continue;
        };
        let Some((pb, ps)) = cands[p] else { continue };
        // a weaker parent claim (CMU LHipJoint above LeftUpLeg) is settled by score below
        if pb != b || ps != s {
            continue;
        }
        let side = b.side().unwrap_or(Side::Left);
        let base = if side == Side::Left { b } else { b.mirror() };
        match base {
            LeftShoulder => cands[i] = Some((sided(side, LeftUpperArm), s)),
            LeftFoot => cands[i] = Some((sided(side, LeftToes), s)),
            LeftLowerLeg => cands[p] = Some((sided(side, LeftUpperLeg), ps)),
            _ => cands[i] = None,
        }
    }

    // settle claims: higher score, then the shallower bone, then input order
    let mut by_bone: Vec<Option<usize>> = vec![None; ALL.len()];
    let mut ambiguous = Vec::new();
    for &i in &order {
        let Some((b, s)) = cands[i] else { continue };
        match by_bone[b.index()] {
            None => by_bone[b.index()] = Some(i),
            Some(j) => {
                let (_, sj) = cands[j].unwrap_or((b, 0));
                if s > sj {
                    ambiguous.push((j, b));
                    by_bone[b.index()] = Some(i);
                } else {
                    ambiguous.push((i, b));
                }
            }
        }
    }

    // spine chain by depth, kept to bones above the head or the arms when
    // those are known
    let anchor = by_bone[Head.index()]
        .or(by_bone[LeftUpperArm.index()])
        .or(by_bone[LeftShoulder.index()])
        .or(necks.first().copied());
    spine.sort_by_key(|&i| (depth[i], i));
    // Rigify deform rigs name hips, spine, neck and head all spine.NNN
    let rigify =
        by_bone[Head.index()].is_none() && by_bone[Hips.index()].is_none() && spine.len() >= 5;
    let chain: Vec<usize> = if rigify {
        by_bone[Hips.index()] = Some(spine[0]);
        by_bone[Head.index()] = spine.last().copied();
        let mid: Vec<usize> = spine[1..spine.len() - 1].to_vec();
        if mid.len() >= 4 {
            necks.insert(0, mid[3]);
        }
        mid.into_iter().take(3).collect()
    } else {
        spine
            .iter()
            .copied()
            .filter(|&i| anchor.is_none_or(|a| is_ancestor(i, a)))
            .filter(|&i| by_bone[Hips.index()].is_none_or(|h| h == i || is_ancestor(h, i)))
            .collect()
    };
    let slots: &[HumanBone] = match chain.len() {
        0 => &[],
        1 => &[Spine],
        2 => &[Spine, Chest],
        _ => &[Spine, Chest, UpperChest],
    };
    for (k, b) in slots.iter().enumerate() {
        let node = if k == 2 {
            chain[chain.len() - 1]
        } else {
            chain[k]
        };
        if by_bone[b.index()].is_none() {
            by_bone[b.index()] = Some(node);
        }
    }
    necks.sort_by_key(|&i| (depth[i], i));
    if let Some(&neck) = necks.iter().find(|&&i| {
        by_bone[Head.index()].is_none_or(|h| is_ancestor(i, h))
            && by_bone[Hips.index()].is_none_or(|h| is_ancestor(h, i))
    }) {
        by_bone[Neck.index()] = Some(neck);
    }
    if by_bone[Hips.index()].is_none()
        && let Some(p) = by_bone[LeftUpperLeg.index()].and_then(parent)
        && !by_bone.contains(&Some(p))
    {
        by_bone[Hips.index()] = Some(p);
    }
    // eyes and jaw only under the head
    if let Some(h) = by_bone[Head.index()] {
        for b in [LeftEye, RightEye, Jaw] {
            if let Some(i) = by_bone[b.index()]
                && !is_ancestor(h, i)
            {
                by_bone[b.index()] = None;
                ambiguous.push((i, b));
            }
        }
    }

    let mut bones = vec![None; n];
    for b in ALL {
        if let Some(i) = by_bone[b.index()] {
            bones[i] = Some(*b);
        }
    }
    let helpers: Vec<usize> = (0..n)
        .filter(|&i| parsed[i].helper && first_of_name[i])
        .collect();
    let unmapped: Vec<usize> = (0..n)
        .filter(|&i| {
            bones[i].is_none()
                && !parsed[i].helper
                && first_of_name[i]
                && !deform.iter().any(|(d, _)| *d == i)
        })
        .collect();
    let missing_required = REQUIRED
        .iter()
        .copied()
        .filter(|b| by_bone[b.index()].is_none())
        .collect();
    RigMap {
        bones,
        by_bone,
        missing_required,
        unmapped,
        helpers,
        ambiguous,
        deform,
        dialect: guess_dialect(nodes, mmd_hits),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) fn rig(spec: &[(&str, Option<&str>)]) -> Vec<RigNode> {
        spec.iter()
            .map(|(name, parent)| RigNode {
                name: (*name).into(),
                parent: parent.and_then(|p| spec.iter().position(|(n, _)| *n == p)),
            })
            .collect()
    }

    #[test]
    fn smpl_chain_shifts() {
        let nodes = rig(&[
            ("Pelvis", None),
            ("L_Hip", Some("Pelvis")),
            ("L_Knee", Some("L_Hip")),
            ("L_Ankle", Some("L_Knee")),
            ("L_Foot", Some("L_Ankle")),
            ("Spine1", Some("Pelvis")),
            ("Spine2", Some("Spine1")),
            ("Spine3", Some("Spine2")),
            ("Neck", Some("Spine3")),
            ("Head", Some("Neck")),
            ("L_Collar", Some("Spine3")),
            ("L_Shoulder", Some("L_Collar")),
            ("L_Elbow", Some("L_Shoulder")),
            ("L_Wrist", Some("L_Elbow")),
            ("L_Hand", Some("L_Wrist")),
        ]);
        let m = map_rig(&nodes);
        let at = |b: HumanBone| m.node(b).map(|i| nodes[i].name.as_str());
        assert_eq!(at(LeftUpperLeg), Some("L_Hip"));
        assert_eq!(at(LeftFoot), Some("L_Ankle"));
        assert_eq!(at(LeftToes), Some("L_Foot"));
        assert_eq!(at(LeftShoulder), Some("L_Collar"));
        assert_eq!(at(LeftUpperArm), Some("L_Shoulder"));
        assert_eq!(at(LeftHand), Some("L_Wrist"));
        assert_eq!(at(UpperChest), Some("Spine3"));
    }
}
