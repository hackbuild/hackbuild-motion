//! Clip retargeting through the normalized humanoid space.
//!
//! For each skeleton a [`Rig`] measures, once:
//! - the facing fix `F`, from the rest pose (head above hips, left arm on +X);
//! - the units, from the rest height, or as given;
//! - per humanoid bone an alignment `C` that turns the bone's rest direction
//!   (toward its humanoid child) onto the reference T pose direction. For a
//!   T pose rig every `C` is near the identity; for an A pose rig the arms
//!   carry the A to T turn, so no T pose frame is needed.
//!
//! A pose then becomes, per bone, the normalized world rotation
//! `N = F W W_rest^-1 F^-1 C^-1` (the bone's turn away from its own rest,
//! expressed so the reference rest maps onto it), and normalized locals are
//! `N_parent^-1 N`. Binding runs the same steps backwards on the target.

use crate::motion::HumanoidMotion;
use crate::skeleton::{Clip, Skeleton};
use alloc::vec::Vec;
use organic::{Quat, Vec3};
use rig::bones::{ALL, HumanBone};
use rig::reference::reference_position;
use rig::rest::analyze_rest;
use rig::{RigMap, map_rig};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RetargetError {
    /// The name mapper could not find these required bones.
    Missing(Vec<HumanBone>),
    /// Rest analysis needs the hips, head and both arms.
    NoRestFrame,
    NotOrdered,
}

#[derive(Clone, Debug)]
pub struct Rig {
    pub skeleton: Skeleton,
    pub map: RigMap,
    /// Facing fix.
    pub fix: Quat,
    /// Source units to meters.
    pub unit: f64,
    /// Lowest foot joint height after fix and unit, meters.
    pub floor: f64,
    pub align: [Quat; 55],
    pub rest_world_r: Vec<Quat>,
    pub rest_world_p: Vec<Vec3>,
    /// Hips rest position after fix and unit, floor at y = 0.
    pub hips_rest: Vec3,
    pub hips_height: f64,
}

/// The humanoid child used to measure a bone's direction.
fn child_of(b: HumanBone) -> Option<HumanBone> {
    use HumanBone::*;
    Some(match b {
        Hips => Spine,
        Spine => Chest,
        Chest => UpperChest,
        UpperChest => Neck,
        Neck => Head,
        LeftUpperLeg => LeftLowerLeg,
        LeftLowerLeg => LeftFoot,
        LeftFoot => LeftToes,
        RightUpperLeg => RightLowerLeg,
        RightLowerLeg => RightFoot,
        RightFoot => RightToes,
        LeftShoulder => LeftUpperArm,
        LeftUpperArm => LeftLowerArm,
        LeftLowerArm => LeftHand,
        LeftHand => LeftMiddleProximal,
        RightShoulder => RightUpperArm,
        RightUpperArm => RightLowerArm,
        RightLowerArm => RightHand,
        RightHand => RightMiddleProximal,
        b if b.is_finger() && !b.name().ends_with("Distal") => ALL[b.index() + 1],
        _ => return None,
    })
}

impl Rig {
    /// Maps and measures a skeleton. `unit` overrides the unit guess.
    pub fn new(skeleton: Skeleton, unit: Option<f64>) -> Result<Rig, RetargetError> {
        if !skeleton.is_ordered() {
            return Err(RetargetError::NotOrdered);
        }
        let map = map_rig(&skeleton.nodes());
        if !map.missing_required.is_empty() {
            return Err(RetargetError::Missing(map.missing_required.clone()));
        }
        let (rwr, rwp) = skeleton.rest_world();
        Rig::measure(skeleton, map, rwr, rwp, unit)
    }

    /// Like [`Rig::new`] with a mapping chosen by the caller (a VRM humanoid
    /// table, or manual overrides).
    pub fn with_map(
        skeleton: Skeleton,
        map: RigMap,
        unit: Option<f64>,
    ) -> Result<Rig, RetargetError> {
        let (rwr, rwp) = skeleton.rest_world();
        Rig::measure(skeleton, map, rwr, rwp, unit)
    }

    fn measure(
        skeleton: Skeleton,
        map: RigMap,
        rwr: Vec<Quat>,
        rwp: Vec<Vec3>,
        unit: Option<f64>,
    ) -> Result<Rig, RetargetError> {
        let pos: Vec<Option<Vec3>> = ALL.iter().map(|b| map.node(*b).map(|i| rwp[i])).collect();
        let rep = analyze_rest(&pos).ok_or(RetargetError::NoRestFrame)?;
        let fix = rep.fix;
        let unit = unit.unwrap_or(rep.scale);
        let floor = if unit == rep.scale {
            rep.floor
        } else {
            rep.floor / rep.scale * unit
        };
        let fixed = |p: Vec3| fix.rotate(p) * unit - Vec3::new(0.0, floor, 0.0);
        let mut align = [Quat::IDENTITY; 55];
        for b in ALL {
            let (Some(i), Some(c)) = (map.node(*b), child_of(*b)) else {
                continue;
            };
            let Some(j) = map.node(c) else { continue };
            let d = (fixed(rwp[j]) - fixed(rwp[i])).normalize();
            let r = (reference_position(c) - reference_position(*b)).normalize();
            if d.length() > 0.5 {
                align[b.index()] = Quat::from_unit_vectors(d, r);
            }
        }
        let hips = map
            .node(HumanBone::Hips)
            .ok_or(RetargetError::Missing(alloc::vec![HumanBone::Hips]))?;
        let hips_rest = fixed(rwp[hips]);
        Ok(Rig {
            skeleton,
            map,
            fix,
            unit,
            floor,
            align,
            rest_world_r: rwr,
            rest_world_p: rwp,
            hips_height: hips_rest.y.max(1e-3),
            hips_rest,
        })
    }

    fn to_fixed(&self, p: Vec3) -> Vec3 {
        self.fix.rotate(p) * self.unit - Vec3::new(0.0, self.floor, 0.0)
    }
    fn unfix(&self, p: Vec3) -> Vec3 {
        self.fix
            .inverse()
            .rotate((p + Vec3::new(0.0, self.floor, 0.0)) * (1.0 / self.unit))
    }

    /// Normalized world rotation per humanoid bone (identity where unmapped)
    /// and the hips offset in hip heights, for one pose of this skeleton.
    pub fn pose_to_normalized(&self, world_r: &[Quat], world_p: &[Vec3]) -> ([Quat; 55], Vec3) {
        let mut n = [Quat::IDENTITY; 55];
        let fi = self.fix.inverse();
        for b in ALL {
            if let Some(i) = self.map.node(*b) {
                let d = self
                    .fix
                    .mul(world_r[i])
                    .mul(self.rest_world_r[i].inverse())
                    .mul(fi);
                n[b.index()] = d.mul(self.align[b.index()].inverse()).normalize();
            }
        }
        let hips = self.map.node(HumanBone::Hips).unwrap_or(0);
        let off = (self.to_fixed(world_p[hips]) - self.hips_rest) * (1.0 / self.hips_height);
        (n, off)
    }

    /// Local rotations and translations for this skeleton from normalized
    /// world rotations and a hips offset. Unmapped joints keep their rest.
    pub fn normalized_to_pose(
        &self,
        n: &[Quat; 55],
        hips_off: Option<Vec3>,
    ) -> (Vec<Quat>, Vec<Vec3>) {
        let s = &self.skeleton;
        let len = s.len();
        let fi = self.fix.inverse();
        let mut wr = alloc::vec![Quat::IDENTITY; len];
        let mut wp = alloc::vec![Vec3::ZERO; len];
        let mut lr = s.rest_r.clone();
        let mut lt = s.rest_t.clone();
        let hips = self.map.node(HumanBone::Hips);
        for j in 0..len {
            let parent_r = s.parents[j].map_or(Quat::IDENTITY, |p| wr[p]);
            let parent_p = s.parents[j].map_or(Vec3::ZERO, |p| wp[p]);
            match self.map.bones[j] {
                Some(b) => {
                    let d = n[b.index()].mul(self.align[b.index()]);
                    wr[j] = fi
                        .mul(d)
                        .mul(self.fix)
                        .mul(self.rest_world_r[j])
                        .normalize();
                    lr[j] = parent_r.inverse().mul(wr[j]).normalize();
                }
                None => wr[j] = parent_r.mul(lr[j]),
            }
            if Some(j) == hips
                && let Some(off) = hips_off
            {
                let target = self.unfix(self.hips_rest + off * self.hips_height);
                lt[j] = parent_r.inverse().rotate(target - parent_p);
            }
            wp[j] = parent_p + parent_r.rotate(lt[j]);
        }
        (lr, lt)
    }

    /// A clip on this skeleton as a humanoid motion.
    pub fn to_humanoid(&self, clip: &Clip) -> HumanoidMotion {
        let frames = clip.frames();
        let mut m = HumanoidMotion::empty(clip.times.clone());
        let keyed: Vec<HumanBone> = ALL
            .iter()
            .copied()
            .filter(|b| self.map.node(*b).is_some())
            .collect();
        for b in &keyed {
            m.rotations[b.index()] = Some(Vec::with_capacity(frames));
        }
        let mut hips = Vec::with_capacity(frames);
        for f in 0..frames {
            let (wr, wp) = self.skeleton.pose(clip, f);
            let (n, off) = self.pose_to_normalized(&wr, &wp);
            for b in &keyed {
                let parent = b.parent_present(|p| self.map.node(p).is_some());
                let pn = parent.map_or(Quat::IDENTITY, |p| n[p.index()]);
                let local = pn.inverse().mul(n[b.index()]).normalize();
                m.rotations[b.index()].as_mut().unwrap().push(local);
            }
            hips.push(off);
        }
        m.hips = Some(hips);
        m
    }

    /// A humanoid motion as a clip on this skeleton.
    pub fn bind(&self, m: &HumanoidMotion) -> Clip {
        let frames = m.frames();
        let len = self.skeleton.len();
        let mut clip = Clip {
            times: m.times.clone(),
            rotations: Vec::with_capacity(frames),
            translations: Vec::with_capacity(frames),
            moves: alloc::vec![false; len],
        };
        if let Some(h) = self.map.node(HumanBone::Hips)
            && m.hips.is_some()
        {
            clip.moves[h] = true;
        }
        for f in 0..frames {
            let n = normalized_world(m, f);
            let (lr, lt) = self.normalized_to_pose(&n, m.hips.as_ref().map(|h| h[f]));
            clip.rotations.push(lr);
            clip.translations.push(lt);
        }
        clip
    }
}

/// Normalized world rotation per bone at frame `f`: each bone composes
/// onto its nearest keyed ancestor; a bone the motion does not key follows
/// that ancestor.
pub fn normalized_world(m: &HumanoidMotion, f: usize) -> [Quat; 55] {
    let mut n = [Quat::IDENTITY; 55];
    for b in ALL {
        let parent = b.parent_present(|p| m.has(p));
        let pn = parent.map_or(Quat::IDENTITY, |p| n[p.index()]);
        n[b.index()] = if m.has(*b) {
            pn.mul(m.rotation(*b, f))
        } else {
            pn
        };
    }
    n
}

/// Retargets `clip` from `src` onto `dst`.
pub fn retarget_clip(src: &Rig, clip: &Clip, dst: &Rig) -> Clip {
    dst.bind(&src.to_humanoid(clip))
}

/// An end effector target for a limb of a different length: the source
/// limb vector scaled by the length ratio, from the target limb's root.
pub fn retarget_limb(
    src_top: Vec3,
    src_end: Vec3,
    src_len: f64,
    dst_top: Vec3,
    dst_len: f64,
) -> Vec3 {
    dst_top + (src_end - src_top) * (dst_len / src_len.max(1e-9))
}

/// A reference humanoid skeleton (55 joints, T pose, meters, identity rest
/// rotations) with VRM bone names.
pub fn reference_skeleton() -> Skeleton {
    let mut names = Vec::new();
    let mut parents = Vec::new();
    let mut rest_t = Vec::new();
    for b in ALL {
        names.push(b.name().into());
        let p = b.parent_present(|_| true);
        parents.push(p.map(|p| p.index()));
        let wp = reference_position(*b);
        rest_t.push(match p {
            Some(p) => wp - reference_position(p),
            None => wp,
        });
    }
    Skeleton {
        names,
        parents,
        rest_t,
        rest_r: alloc::vec![Quat::IDENTITY; ALL.len()],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reference_round_trip_is_identity() {
        let rig = Rig::new(reference_skeleton(), None).unwrap();
        assert!(rig.fix.angle_to(Quat::IDENTITY) < 1e-9);
        for b in ALL {
            assert!(
                rig.align[b.index()].angle_to(Quat::IDENTITY) < 1e-9,
                "{}",
                b.name()
            );
        }
    }
}
