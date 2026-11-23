//! `HumanoidMotion`: the interchange format. Rotations are local to each
//! bone's humanoid parent in the normalized space, where every bone's rest
//! rotation is the identity (VRM 1.0 normalized bones). Hip travel is in
//! multiples of the hips height above the floor.

use alloc::vec::Vec;
use organic::{Quat, Vec3};
use rig::bones::{ALL, HumanBone};

#[derive(Clone, Debug, PartialEq)]
pub struct HumanoidMotion {
    pub times: Vec<f64>,
    /// Per bone (by `HumanBone::index`), one rotation per frame, or `None`
    /// when the motion does not key that bone.
    pub rotations: Vec<Option<Vec<Quat>>>,
    /// Hips offset from rest per frame, in hip heights.
    pub hips: Option<Vec<Vec3>>,
}

impl HumanoidMotion {
    pub fn empty(times: Vec<f64>) -> Self {
        HumanoidMotion {
            times,
            rotations: alloc::vec![None; ALL.len()],
            hips: None,
        }
    }
    pub fn frames(&self) -> usize {
        self.times.len()
    }
    pub fn duration(&self) -> f64 {
        self.times.last().copied().unwrap_or(0.0)
    }
    pub fn has(&self, b: HumanBone) -> bool {
        self.rotations[b.index()].is_some()
    }
    pub fn rotation(&self, b: HumanBone, f: usize) -> Quat {
        self.rotations[b.index()]
            .as_ref()
            .map_or(Quat::IDENTITY, |r| r[f])
    }

    /// Binary form: `HBM1`, frame count, a 64 bit mask of keyed bones, a hips
    /// flag, then f32 times, rotations per keyed bone and hips offsets, all
    /// little endian. About 16 bytes per bone per frame.
    pub fn pack(&self) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"HBM1");
        out.extend_from_slice(&(self.frames() as u32).to_le_bytes());
        let mut mask = 0u64;
        for (i, r) in self.rotations.iter().enumerate() {
            if r.is_some() {
                mask |= 1 << i;
            }
        }
        out.extend_from_slice(&mask.to_le_bytes());
        out.extend_from_slice(&(self.hips.is_some() as u32).to_le_bytes());
        let f = |o: &mut Vec<u8>, x: f64| o.extend_from_slice(&(x as f32).to_le_bytes());
        for t in &self.times {
            f(&mut out, *t);
        }
        for r in self.rotations.iter().flatten() {
            for q in r {
                for x in [q.x, q.y, q.z, q.w] {
                    f(&mut out, x);
                }
            }
        }
        if let Some(h) = &self.hips {
            for v in h {
                for x in [v.x, v.y, v.z] {
                    f(&mut out, x);
                }
            }
        }
        out
    }

    pub fn unpack(bytes: &[u8]) -> Option<HumanoidMotion> {
        if bytes.len() < 20 || &bytes[0..4] != b"HBM1" {
            return None;
        }
        let u32_at = |o: usize| u32::from_le_bytes(bytes[o..o + 4].try_into().unwrap());
        let n = u32_at(4) as usize;
        let mask = u64::from_le_bytes(bytes[8..16].try_into().unwrap());
        let has_hips = u32_at(16) != 0;
        let keyed = mask.count_ones() as usize;
        let need = 20 + 4 * (n + keyed * n * 4 + if has_hips { n * 3 } else { 0 });
        if bytes.len() < need {
            return None;
        }
        let mut o = 20;
        let mut next = || {
            let v = f32::from_le_bytes(bytes[o..o + 4].try_into().unwrap()) as f64;
            o += 4;
            v
        };
        let times: Vec<f64> = (0..n).map(|_| next()).collect();
        let mut m = HumanoidMotion::empty(times);
        for i in 0..ALL.len() {
            if mask & (1 << i) != 0 {
                m.rotations[i] = Some(
                    (0..n)
                        .map(|_| Quat::new(next(), next(), next(), next()))
                        .collect(),
                );
            }
        }
        if has_hips {
            m.hips = Some((0..n).map(|_| Vec3::new(next(), next(), next())).collect());
        }
        Some(m)
    }

    /// Horizontal hip travel shifted so the first frame starts at the origin.
    pub fn start_at_origin(&mut self) {
        if let Some(h) = &mut self.hips
            && let Some(first) = h.first().copied()
        {
            for v in h.iter_mut() {
                v.x -= first.x;
                v.z -= first.z;
            }
        }
    }
}
