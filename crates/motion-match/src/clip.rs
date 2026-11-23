//! Ground plane root transforms and clips.

use alloc::vec::Vec;
use organic::{Quat, Vec3};

/// A root on the ground plane: position `x z` and yaw about +Y. Yaw 0
/// faces +Z; forward is `(sin yaw, cos yaw)`.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Root {
    pub x: f64,
    pub z: f64,
    pub yaw: f64,
}

impl Root {
    pub const fn new(x: f64, z: f64, yaw: f64) -> Self {
        Root { x, z, yaw }
    }

    /// `b` expressed in this root's frame.
    pub fn relative(self, b: Root) -> Root {
        let (s, c) = (libm::sin(self.yaw), libm::cos(self.yaw));
        let (dx, dz) = (b.x - self.x, b.z - self.z);
        Root::new(c * dx - s * dz, s * dx + c * dz, b.yaw - self.yaw)
    }

    /// A transform given in this root's frame, placed in the world.
    pub fn to_world(self, l: Root) -> Root {
        let (s, c) = (libm::sin(self.yaw), libm::cos(self.yaw));
        Root::new(
            self.x + c * l.x + s * l.z,
            self.z - s * l.x + c * l.z,
            self.yaw + l.yaw,
        )
    }

    pub fn point_to_world(self, p: Vec3) -> Vec3 {
        let w = self.to_world(Root::new(p.x, p.z, 0.0));
        Vec3::new(w.x, p.y, w.z)
    }

    pub fn point_to_local(self, p: Vec3) -> Vec3 {
        let l = self.relative(Root::new(p.x, p.z, 0.0));
        Vec3::new(l.x, p.y, l.z)
    }

    /// A world direction (a velocity) in this root's frame.
    pub fn dir_to_local(self, v: Vec3) -> Vec3 {
        let (s, c) = (libm::sin(self.yaw), libm::cos(self.yaw));
        Vec3::new(c * v.x - s * v.z, v.y, s * v.x + c * v.z)
    }

    pub fn lerp(self, b: Root, t: f64) -> Root {
        Root::new(
            self.x + (b.x - self.x) * t,
            self.z + (b.z - self.z) * t,
            self.yaw + (b.yaw - self.yaw) * t,
        )
    }
}

/// One clip. Per frame: the root, `bones` local rotations, the hip
/// position and `feet` foot positions in the root's frame, and one contact
/// flag per foot. Yaw is unwrapped (no jumps of 2 pi between frames).
#[derive(Clone, Debug)]
pub struct Clip {
    pub frames: usize,
    pub looped: bool,
    pub root: Vec<Root>,
    pub rotations: Vec<Quat>,
    pub hips: Vec<Vec3>,
    pub feet: Vec<Vec3>,
    pub contacts: Vec<bool>,
}

/// A sampled pose in the root's frame.
#[derive(Clone, Debug, Default)]
pub struct Pose {
    pub rotations: Vec<Quat>,
    pub hips: Vec3,
    pub feet: Vec<Vec3>,
}

impl Clip {
    /// Frame index wrapped (looped) or clamped (one shot).
    pub fn wrap(&self, j: i64) -> usize {
        let n = self.frames as i64;
        if self.looped {
            j.rem_euclid(n) as usize
        } else {
            j.clamp(0, n - 1) as usize
        }
    }

    /// The transform from frame 0 to the frame one past the end, continuing
    /// the last frame's step, so a loop keeps moving.
    pub fn loop_step(&self) -> Root {
        let n = self.frames;
        if n < 2 {
            return Root::default();
        }
        let d = self.root[n - 2].relative(self.root[n - 1]);
        self.root[0].relative(self.root[n - 1].to_world(d))
    }

    /// Root at an integer frame, continuing past the end of a loop.
    pub fn root_at(&self, j: i64) -> Root {
        let n = self.frames as i64;
        if !self.looped || (0..n).contains(&j) {
            return self.root[self.wrap(j)];
        }
        let q = j.div_euclid(n).max(0);
        let r = j.rem_euclid(n) as usize;
        let step = self.loop_step();
        let mut acc = self.root[0];
        for _ in 0..q {
            acc = acc.to_world(step);
        }
        acc.to_world(self.root[0].relative(self.root[r]))
    }

    /// Root at a fractional frame.
    pub fn root_at_f(&self, f: f64) -> Root {
        let i = libm::floor(f);
        let t = f - i;
        let a = self.root_at(i as i64);
        if t == 0.0 {
            return a;
        }
        a.lerp(self.root_at(i as i64 + 1), t)
    }

    pub fn bones(&self) -> usize {
        self.rotations.len() / self.frames.max(1)
    }

    pub fn feet_count(&self) -> usize {
        self.feet.len() / self.frames.max(1)
    }

    /// Pose at a fractional frame: slerp of rotations, lerp of positions.
    pub fn sample(&self, f: f64, out: &mut Pose) {
        let b = self.bones();
        let nf = self.feet_count();
        let fl = libm::floor(f);
        let t = f - fl;
        let i0 = self.wrap(fl as i64);
        let i1 = self.wrap(fl as i64 + 1);
        out.rotations.clear();
        for k in 0..b {
            let a = self.rotations[i0 * b + k];
            out.rotations.push(if t == 0.0 {
                a
            } else {
                a.slerp(self.rotations[i1 * b + k], t)
            });
        }
        out.hips = self.hips[i0].lerp(self.hips[i1], t);
        out.feet.clear();
        for k in 0..nf {
            out.feet
                .push(self.feet[i0 * nf + k].lerp(self.feet[i1 * nf + k], t));
        }
    }

    /// Contacts at the nearest frame.
    pub fn contacts_at(&self, f: f64, out: &mut Vec<bool>) {
        let nf = self.feet_count();
        let i = self.wrap(libm::round(f) as i64);
        out.clear();
        out.extend_from_slice(&self.contacts[i * nf..(i + 1) * nf]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_and_to_world_invert() {
        let a = Root::new(1.0, -2.0, 0.7);
        let b = Root::new(-0.3, 4.0, -1.1);
        let w = a.to_world(a.relative(b));
        assert!((w.x - b.x).abs() < 1e-12 && (w.z - b.z).abs() < 1e-12);
        assert!((w.yaw - b.yaw).abs() < 1e-12);
        let fwd = Root::new(0.0, 0.0, 0.0).to_world(Root::new(0.0, 1.0, 0.0));
        assert!((fwd.z - 1.0).abs() < 1e-12);
        let turned =
            Root::new(0.0, 0.0, core::f64::consts::FRAC_PI_2).to_world(Root::new(0.0, 1.0, 0.0));
        assert!((turned.x - 1.0).abs() < 1e-12, "{turned:?}");
    }
}
