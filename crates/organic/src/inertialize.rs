//! Offset inertialization (Bollo 2016, in the decaying spring form Holden
//! describes). At a transition the difference between the last output pose
//! and the new source pose becomes an offset, with the last output velocity
//! minus the new source's velocity as its velocity; the offset then decays
//! to zero by a critically damped spring while the new source plays
//! underneath. Neither pose nor velocity steps, and no two live sources are
//! blended.
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
    /// The source as given last frame, before the offset, and its velocity.
    src_r: Vec<Quat>,
    src_rv: Vec<Vec3>,
    src_p: Vec<Vec3>,
    src_pv: Vec<Vec3>,
    frames: u32,
    pending: bool,
    /// The frame after a transition, when the new source's velocity is known.
    correct: bool,
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
            src_r: alloc::vec![Quat::IDENTITY; rotations],
            src_rv: alloc::vec![Vec3::ZERO; rotations],
            src_p: alloc::vec![Vec3::ZERO; positions],
            src_pv: alloc::vec![Vec3::ZERO; positions],
            frames: 0,
            pending: false,
            correct: false,
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
    ///
    /// The offset carries the output velocity minus the new source's own
    /// velocity, so a switch to a source moving the same way changes nothing.
    /// The new source's velocity is not known on the switch frame; it is
    /// estimated there from the old source and corrected on the next frame
    /// (the spring is linear, so the correction is exact).
    pub fn apply(&mut self, rot: &mut [Quat], pos: &mut [Vec3], dt: f64, halflife: f64) {
        let nr = rot.len().min(self.prev.len());
        let np = pos.len().min(self.pprev.len());
        let inv_dt = 1.0 / dt.max(1e-6);
        let switching = self.pending && self.frames > 0;
        if switching {
            let inv_last = 1.0 / self.last_dt.max(1e-3);
            for i in 0..nr {
                let w = if self.frames > 1 {
                    self.prev[i]
                        .mul(self.prev2[i].inverse())
                        .abs()
                        .to_scaled_axis()
                        * inv_last
                } else {
                    Vec3::ZERO
                };
                // offset at the previous frame against the new source moved back by its velocity
                let back = self.src_rv[i] * dt;
                self.rot_x[i] = self.prev[i].mul(rot[i].inverse()).abs().to_scaled_axis() + back;
                self.rot_v[i] = w - self.src_rv[i];
            }
            for i in 0..np {
                let v = if self.frames > 1 {
                    (self.pprev[i] - self.pprev2[i]) * inv_last
                } else {
                    Vec3::ZERO
                };
                self.pos_x[i] = self.pprev[i] - pos[i] + self.src_pv[i] * dt;
                self.pos_v[i] = v - self.src_pv[i];
            }
            self.active = true;
            self.correct = self.frames > 1;
        } else if self.correct && self.active {
            // the new source's velocity is known now: replace the estimate
            // used at the switch. The offset state moves by (d dt, -d) at the
            // frame before the switch, decayed over the switch frame.
            let dt0 = self.last_dt;
            for i in 0..nr {
                let real = rot[i].mul(self.src_r[i].inverse()).abs().to_scaled_axis() * inv_dt;
                let d = real - self.src_rv[i];
                let (cx, cv) = decay3(d * dt0, -d, halflife, dt0, self.exp);
                self.rot_x[i] += cx;
                self.rot_v[i] += cv;
            }
            for i in 0..np {
                let real = (pos[i] - self.src_p[i]) * inv_dt;
                let d = real - self.src_pv[i];
                let (cx, cv) = decay3(d * dt0, -d, halflife, dt0, self.exp);
                self.pos_x[i] += cx;
                self.pos_v[i] += cv;
            }
            self.correct = false;
        } else {
            self.correct = false;
        }
        // remember the source as given; on a switch frame its velocity is
        // not measurable and the old estimate is kept for the correction
        for i in 0..nr {
            if self.frames > 0 && !switching {
                self.src_rv[i] =
                    rot[i].mul(self.src_r[i].inverse()).abs().to_scaled_axis() * inv_dt;
            }
            self.src_r[i] = rot[i];
        }
        for i in 0..np {
            if self.frames > 0 && !switching {
                self.src_pv[i] = (pos[i] - self.src_p[i]) * inv_dt;
            }
            self.src_p[i] = pos[i];
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
            if mag < 1e-6 && !self.correct {
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

    fn run_switch(v_new: f64, yaw_rate_new: f64, jump: f64) -> (Vec<f64>, Vec<f64>) {
        // a source moving at 1 m/s and turning at 1 rad/s, switched at frame
        // 30 to a source at `v_new` and `yaw_rate_new`, `jump` away
        let dt = 1.0 / 60.0;
        let mut inert = Inertializer::new(1, 1);
        let (mut vel, mut rate) = (Vec::new(), Vec::new());
        let (mut last_p, mut last_r) = (0.0, Quat::IDENTITY);
        for k in 0..90 {
            let t = k as f64 * dt;
            let (p, a) = if k < 30 {
                (t, t)
            } else {
                (
                    jump + 0.5 + v_new * (t - 0.5),
                    jump + 0.5 + yaw_rate_new * (t - 0.5),
                )
            };
            if k == 30 {
                inert.capture();
            }
            let mut r = [Quat::from_axis_angle(Vec3::Y, a)];
            let mut q = [Vec3::new(p, 0.0, 0.0)];
            inert.apply(&mut r, &mut q, dt, 0.1);
            if k > 0 {
                vel.push((q[0].x - last_p) / dt);
                rate.push(r[0].mul(last_r.inverse()).to_scaled_axis().y / dt);
            }
            last_p = q[0].x;
            last_r = r[0];
        }
        (vel, rate)
    }

    #[test]
    fn switch_to_the_same_moving_source_changes_nothing() {
        let (vel, rate) = run_switch(1.0, 1.0, 0.0);
        for (k, (v, w)) in vel.iter().zip(&rate).enumerate() {
            assert!((v - 1.0).abs() < 1e-9, "frame {k}: {v} m/s");
            assert!((w - 1.0).abs() < 1e-6, "frame {k}: {w} rad/s");
        }
    }

    #[test]
    fn velocity_eases_from_the_old_source_to_the_new() {
        // 1 m/s and 1 rad/s to 2 m/s and -1 rad/s with no pose jump: the
        // output velocity starts at the old value and eases to the new one.
        // A 0.1 s halflife spring changes a 1 m/s mismatch by about 0.46 m/s
        // in a 60 Hz frame (computed), so steps up to 0.7 m/s are the spring.
        let (vel, rate) = run_switch(2.0, -1.0, 0.0);
        for k in 1..vel.len() {
            assert!(
                (vel[k] - vel[k - 1]).abs() < 0.7,
                "frame {k}: {:?}",
                &vel[k - 1..=k]
            );
            assert!(
                (rate[k] - rate[k - 1]).abs() < 1.4,
                "frame {k}: {:?}",
                &rate[k - 1..=k]
            );
            assert!(vel[k] > 0.99 && vel[k] < 2.1, "frame {k}: {} m/s", vel[k]);
            assert!(
                rate[k] < 1.01 && rate[k] > -1.2,
                "frame {k}: {} rad/s",
                rate[k]
            );
        }
        assert!((vel[vel.len() - 1] - 2.0).abs() < 1e-2);
    }
}
