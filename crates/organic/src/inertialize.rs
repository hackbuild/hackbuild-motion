//! Offset inertialization (Bollo 2016, in the decaying spring form Holden
//! describes). At a transition the difference between the last output pose
//! and the new source pose becomes an offset, with the last output velocity
//! as its velocity; the offset then decays to zero by a critically damped
//! spring while the new source plays underneath. No pop, no blend of two
//! live sources.
//!
//! Works on any number of rotations and of positions, so root motion, IK
//! targets and look targets inertialize the same way as bone rotations.

use crate::math::{Quat, Vec3};
use crate::spring::{Exp, SpringState, decay};
use alloc::vec::Vec;

#[derive(Clone, Debug)]
pub struct Inertializer {
    prev: Vec<Quat>,
    prev2: Vec<Quat>,
    rot_x: Vec<Vec3>,
    rot_v: Vec<Vec3>,
    pprev: Vec<Vec3>,
    pprev2: Vec<Vec3>,
    pos_x: Vec<Vec3>,
    pos_v: Vec<Vec3>,
    frames: u32,
    pending: bool,
    active: bool,
    last_dt: f64,
    pub exp: Exp,
}

impl Inertializer {
    pub fn new(rotations: usize, positions: usize) -> Self {
        Inertializer {
            prev: alloc::vec![Quat::IDENTITY; rotations],
            prev2: alloc::vec![Quat::IDENTITY; rotations],
            rot_x: alloc::vec![Vec3::ZERO; rotations],
            rot_v: alloc::vec![Vec3::ZERO; rotations],
            pprev: alloc::vec![Vec3::ZERO; positions],
            pprev2: alloc::vec![Vec3::ZERO; positions],
            pos_x: alloc::vec![Vec3::ZERO; positions],
            pos_v: alloc::vec![Vec3::ZERO; positions],
            frames: 0,
            pending: false,
            active: false,
            last_dt: 1.0 / 60.0,
            exp: Exp::Exact,
        }
    }

    /// Marks a transition: the next [`apply`](Self::apply) measures the jump.
    pub fn capture(&mut self) {
        self.pending = true;
    }

    /// Whether an offset is still decaying.
    pub fn active(&self) -> bool {
        self.active
    }

    /// Call once per frame after the new source pose is written into `rot`
    /// and `pos`. Adds the decaying offset in place and remembers the output.
    pub fn apply(&mut self, rot: &mut [Quat], pos: &mut [Vec3], dt: f64, halflife: f64) {
        let nr = rot.len().min(self.prev.len());
        let np = pos.len().min(self.pprev.len());
        if self.pending && self.frames > 0 {
            let inv_dt = 1.0 / self.last_dt.max(1e-3);
            for i in 0..nr {
                self.rot_x[i] = self.prev[i].mul(rot[i].inverse()).abs().to_scaled_axis();
                let w = if self.frames > 1 {
                    self.prev[i]
                        .mul(self.prev2[i].inverse())
                        .abs()
                        .to_scaled_axis()
                } else {
                    Vec3::ZERO
                };
                self.rot_v[i] = w * inv_dt;
            }
            for i in 0..np {
                self.pos_x[i] = self.pprev[i] - pos[i];
                self.pos_v[i] = if self.frames > 1 {
                    (self.pprev[i] - self.pprev2[i]) * inv_dt
                } else {
                    Vec3::ZERO
                };
            }
            self.active = true;
        }
        self.pending = false;
        self.last_dt = dt;
        if self.active {
            let mut mag = 0.0;
            for i in 0..nr {
                let (x, v) = decay3(self.rot_x[i], self.rot_v[i], halflife, dt, self.exp);
                self.rot_x[i] = x;
                self.rot_v[i] = v;
                mag += x.length() + v.length() * dt;
                rot[i] = Quat::from_scaled_axis(x).mul(rot[i]).normalize();
            }
            for i in 0..np {
                let (x, v) = decay3(self.pos_x[i], self.pos_v[i], halflife, dt, self.exp);
                self.pos_x[i] = x;
                self.pos_v[i] = v;
                mag += x.length() + v.length() * dt;
                pos[i] += x;
            }
            if mag < 1e-6 {
                self.active = false;
            }
        }
        for i in 0..nr {
            self.prev2[i] = if self.frames > 0 {
                self.prev[i]
            } else {
                rot[i]
            };
            self.prev[i] = rot[i];
        }
        for i in 0..np {
            self.pprev2[i] = if self.frames > 0 {
                self.pprev[i]
            } else {
                pos[i]
            };
            self.pprev[i] = pos[i];
        }
        self.frames = self.frames.saturating_add(1);
    }
}

fn decay3(x: Vec3, v: Vec3, halflife: f64, dt: f64, exp: Exp) -> (Vec3, Vec3) {
    let mut a = SpringState {
        x: x.x,
        v: v.x,
        a: 0.0,
    };
    let mut b = SpringState {
        x: x.y,
        v: v.y,
        a: 0.0,
    };
    let mut c = SpringState {
        x: x.z,
        v: v.z,
        a: 0.0,
    };
    decay(&mut a, halflife, dt, exp);
    decay(&mut b, halflife, dt, exp);
    decay(&mut c, halflife, dt, exp);
    (Vec3::new(a.x, b.x, c.x), Vec3::new(a.v, b.v, c.v))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transition_starts_at_old_pose_and_settles_on_new() {
        let mut inert = Inertializer::new(1, 1);
        let old = Quat::from_axis_angle(Vec3::Y, 0.8);
        let new = Quat::from_axis_angle(Vec3::Y, -0.4);
        for _ in 0..3 {
            let mut r = [old];
            let mut p = [Vec3::new(1.0, 0.0, 0.0)];
            inert.apply(&mut r, &mut p, 1.0 / 60.0, 0.1);
        }
        inert.capture();
        let mut r = [new];
        let mut p = [Vec3::ZERO];
        inert.apply(&mut r, &mut p, 1.0 / 60.0, 0.1);
        // first frame after the switch is still close to the old pose
        assert!(r[0].angle_to(old) < 0.1, "{}", r[0].angle_to(old));
        assert!((p[0].x - 1.0).abs() < 0.1);
        for _ in 0..120 {
            let mut r = [new];
            let mut p = [Vec3::ZERO];
            inert.apply(&mut r, &mut p, 1.0 / 60.0, 0.1);
            if !inert.active() {
                break;
            }
        }
        let mut r = [new];
        let mut p = [Vec3::ZERO];
        inert.apply(&mut r, &mut p, 1.0 / 60.0, 0.1);
        assert!(r[0].angle_to(new) < 1e-3 && p[0].length() < 1e-3);
    }
}
