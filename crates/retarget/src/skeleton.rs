//! Joints with rest transforms (translation and rotation, no scale) and a
//! clip of local rotations and optional translations per frame.

use alloc::string::String;
use alloc::vec::Vec;
use organic::{Quat, Vec3};

#[derive(Clone, Debug, PartialEq)]
pub struct Skeleton {
    pub names: Vec<String>,
    /// Parent index per joint; parents come before children.
    pub parents: Vec<Option<usize>>,
    pub rest_t: Vec<Vec3>,
    pub rest_r: Vec<Quat>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Clip {
    pub times: Vec<f64>,
    /// Local rotation per frame per joint.
    pub rotations: Vec<Vec<Quat>>,
    /// Local translation per frame per joint, for the joints in `moves`.
    pub translations: Vec<Vec<Vec3>>,
    /// Joints whose translation the clip keys; the rest keep `rest_t`.
    pub moves: Vec<bool>,
}

impl Clip {
    pub fn frames(&self) -> usize {
        self.times.len()
    }
    pub fn duration(&self) -> f64 {
        self.times.last().copied().unwrap_or(0.0)
    }
}

impl Skeleton {
    pub fn len(&self) -> usize {
        self.names.len()
    }
    pub fn is_empty(&self) -> bool {
        self.names.is_empty()
    }
    /// Parents first order check: true when every parent index is lower.
    pub fn is_ordered(&self) -> bool {
        self.parents
            .iter()
            .enumerate()
            .all(|(i, p)| p.is_none_or(|p| p < i))
    }
    /// World rotation and position per joint for local rotations and translations.
    pub fn forward(&self, rot: &[Quat], trans: &[Vec3]) -> (Vec<Quat>, Vec<Vec3>) {
        let n = self.len();
        let mut wr = alloc::vec![Quat::IDENTITY; n];
        let mut wp = alloc::vec![Vec3::ZERO; n];
        for i in 0..n {
            let r = rot.get(i).copied().unwrap_or(self.rest_r[i]);
            let t = trans.get(i).copied().unwrap_or(self.rest_t[i]);
            match self.parents[i] {
                Some(p) => {
                    wr[i] = wr[p].mul(r);
                    wp[i] = wp[p] + wr[p].rotate(t);
                }
                None => {
                    wr[i] = r;
                    wp[i] = t;
                }
            }
        }
        (wr, wp)
    }
    pub fn rest_world(&self) -> (Vec<Quat>, Vec<Vec3>) {
        self.forward(&self.rest_r, &self.rest_t)
    }
    /// World transforms at frame `f` of `clip`.
    pub fn pose(&self, clip: &Clip, f: usize) -> (Vec<Quat>, Vec<Vec3>) {
        let rot = &clip.rotations[f];
        let trans: Vec<Vec3> = (0..self.len())
            .map(|j| {
                if clip.moves.get(j) == Some(&true) {
                    clip.translations[f][j]
                } else {
                    self.rest_t[j]
                }
            })
            .collect();
        self.forward(rot, &trans)
    }
    pub fn nodes(&self) -> Vec<rig::RigNode> {
        self.names
            .iter()
            .zip(&self.parents)
            .map(|(n, p)| rig::RigNode {
                name: n.clone(),
                parent: *p,
            })
            .collect()
    }
}
