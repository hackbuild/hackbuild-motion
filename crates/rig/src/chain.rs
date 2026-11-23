//! The chain model for rigs that are not humanoid: named limb chains with a
//! root, a tip and a pole, so quadrupeds and other n leg rigs share IK and
//! gait code. Chains come from the bone names: a side plus a region word
//! (front, fore, arm, hand for front legs; rear, hind, thigh, leg, foot for
//! hind legs; tail; ear; spine; neck; head).

use crate::bones::Side;
use crate::mapper::RigNode;
use crate::tokens::parse;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use organic::Vec3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Region {
    Front,
    Hind,
    Tail,
    Ear,
    Spine,
    Neck,
    Head,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Chain {
    /// `LF`, `RF`, `LH`, `RH` for legs; `tail`; `earL`, `earR`; `spine`; `neck`; `head`.
    pub name: String,
    pub region: Region,
    pub side: Option<Side>,
    /// Node indices from root to tip.
    pub bones: Vec<usize>,
    /// Unit direction the middle joint bends toward, in the rest frame.
    pub pole: Vec3,
}

impl Chain {
    pub fn root(&self) -> usize {
        self.bones[0]
    }
    pub fn tip(&self) -> usize {
        self.bones[self.bones.len() - 1]
    }
}

const FRONT: &[&str] = &[
    "front", "fore", "frontleg", "forearm", "arm", "upperarm", "lowerarm", "hand", "wrist",
    "foreleg",
];
const HIND: &[&str] = &[
    "rear",
    "hind",
    "back",
    "thigh",
    "upleg",
    "leg",
    "calf",
    "shin",
    "foot",
    "toe",
    "ankle",
    "knee",
    "hock",
    "horselink",
];

fn region_of(name: &str) -> (Option<Region>, Option<Side>, bool) {
    let p = parse(name);
    let w: Vec<&str> = p.words.iter().map(|s| s.as_str()).collect();
    let has = |list: &[&str]| w.iter().any(|t| list.contains(t));
    let r = if has(&["tail"]) {
        Some(Region::Tail)
    } else if has(&["ear"]) {
        Some(Region::Ear)
    } else if p.side.is_some() && has(FRONT) {
        Some(Region::Front)
    } else if p.side.is_some() && has(HIND) && !has(&["spine"]) {
        Some(Region::Hind)
    } else if has(&["neck"]) {
        Some(Region::Neck)
    } else if w == ["head"] {
        Some(Region::Head)
    } else if has(&["spine", "chest", "hips", "pelvis", "torso"]) {
        Some(Region::Spine)
    } else {
        None
    };
    (r, p.side, p.helper)
}

/// Finds limb chains by name. `rest` holds rest world positions per node
/// (any units, +Z forward); with it each chain gets a measured pole.
pub fn limb_chains(nodes: &[RigNode], rest: Option<&[Vec3]>) -> Vec<Chain> {
    let n = nodes.len();
    let parent = |i: usize| nodes[i].parent.filter(|&p| p < n && p != i);
    let info: Vec<_> = nodes.iter().map(|x| region_of(&x.name)).collect();
    let depth = |mut i: usize| {
        let mut d = 0;
        while let Some(p) = parent(i) {
            d += 1;
            if d > 256 {
                break;
            }
            i = p;
        }
        d
    };
    let mut out = Vec::new();
    let groups: [(Region, Option<Side>, &str); 9] = [
        (Region::Front, Some(Side::Left), "LF"),
        (Region::Front, Some(Side::Right), "RF"),
        (Region::Hind, Some(Side::Left), "LH"),
        (Region::Hind, Some(Side::Right), "RH"),
        (Region::Ear, Some(Side::Left), "earL"),
        (Region::Ear, Some(Side::Right), "earR"),
        (Region::Tail, None, "tail"),
        (Region::Spine, None, "spine"),
        (Region::Neck, None, "neck"),
    ];
    for (region, side, label) in groups {
        let member: Vec<bool> = (0..n)
            .map(|i| {
                let (r, s, helper) = info[i];
                r == Some(region) && !helper && (side.is_none() || s == side)
            })
            .collect();
        let mut roots: Vec<usize> = (0..n)
            .filter(|&i| member[i] && !parent(i).is_some_and(|p| member[p]))
            .collect();
        roots.sort_by_key(|&i| (depth(i), i));
        let Some(&root) = roots.first() else { continue };
        let mut bones = vec![root];
        let mut cur = root;
        for _ in 0..64 {
            // follow the member child with the longest member subtree
            let kids: Vec<usize> = (0..n)
                .filter(|&c| parent(c) == Some(cur) && member[c])
                .collect();
            let best = kids.into_iter().max_by_key(|&c| {
                (0..n)
                    .filter(|&d| member[d] && is_under(nodes, c, d))
                    .count()
            });
            match best {
                Some(c) => {
                    bones.push(c);
                    cur = c;
                }
                None => break,
            }
        }
        let min_len = if matches!(region, Region::Front | Region::Hind) {
            2
        } else {
            1
        };
        if bones.len() < min_len {
            continue;
        }
        let default_pole = match region {
            Region::Front => Vec3::new(0.0, 0.0, -1.0),
            Region::Hind => Vec3::new(0.0, 0.0, 1.0),
            _ => Vec3::new(0.0, 0.0, 1.0),
        };
        let pole = rest
            .filter(|_| bones.len() >= 3)
            .map(|p| {
                let a = p[bones[0]];
                let b = p[bones[1]];
                let c = p[bones[2]];
                let ac = (c - a).normalize();
                let v = (b - a).reject(ac);
                if v.length() > 1e-6 * (c - a).length().max(1e-9) {
                    v.normalize()
                } else {
                    default_pole
                }
            })
            .unwrap_or(default_pole);
        out.push(Chain {
            name: label.into(),
            region,
            side,
            bones,
            pole,
        });
    }
    if let Some(h) = (0..n).find(|&i| info[i].0 == Some(Region::Head)) {
        out.push(Chain {
            name: "head".into(),
            region: Region::Head,
            side: None,
            bones: vec![h],
            pole: Vec3::Z,
        });
    }
    out
}

/// Whether `d` is `c` or below it.
fn is_under(nodes: &[RigNode], c: usize, d: usize) -> bool {
    let mut x = d;
    for _ in 0..257 {
        if x == c {
            return true;
        }
        match nodes[x].parent {
            Some(p) if p != x && p < nodes.len() => x = p,
            _ => return false,
        }
    }
    false
}
