//! The motion matching controller. Each update plays the current clip
//! forward, moves the character root by the clip's root delta, searches
//! the database on an interval (or at once when a one shot clip ends) and,
//! when a better frame turns up, jumps there with an inertialized
//! transition: the pose offset at the jump, with the velocity difference
//! between the old output and the new clip, decays to zero by a critically
//! damped spring, so neither the pose nor its velocity steps at a switch.
//! The root never jumps since it only ever moves by deltas. Feet are not
//! locked; a clip's own slide passes through.

use crate::clip::{Pose, Root};
use crate::db::{Database, Exclude, Hit};
use crate::trajectory::predict;
use alloc::vec::Vec;
use gait::motor::{MotorSource, MotorState, PhaseEstimator};
use organic::Vec3;
use organic::inertialize::Inertializer;

#[derive(Clone, Copy, Debug)]
pub struct MatcherParams {
    /// Seconds between searches.
    pub search_interval: f64,
    /// Inertialization halflife, seconds.
    pub halflife: f64,
    /// A jump needs a cost at least this much below the current frame's.
    pub min_improvement: f64,
    /// Halflife of the predicted trajectory's velocity spring, seconds.
    pub trajectory_halflife: f64,
}

impl Default for MatcherParams {
    fn default() -> Self {
        MatcherParams {
            search_interval: 0.1,
            halflife: 0.1,
            min_improvement: 0.05,
            trajectory_halflife: 0.25,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Matcher {
    pub db: Database,
    pub params: MatcherParams,
    pub clip: usize,
    pub frame: f64,
    /// The character root in the world.
    pub root: Root,
    /// Root velocity in the root's frame and turn rate, from the last step.
    pub velocity: (f64, f64),
    pub turn_rate: f64,
    /// Output pose (root frame) after inertialization.
    pub pose: Pose,
    pub contacts: Vec<bool>,
    pub motor: MotorState,
    pub transitions: u32,
    pub last_hit: Hit,
    pub last_current_cost: f64,
    timer: f64,
    force: bool,
    inert: Inertializer,
    estimator: PhaseEstimator,
    query: Vec<f64>,
    positions: Vec<Vec3>,
}

impl Matcher {
    pub fn new(db: Database, params: MatcherParams, clip: usize, frame: usize, root: Root) -> Self {
        let feet = db.feet;
        let bones = db.bones;
        let dims = db.dims;
        Matcher {
            params,
            clip,
            frame: frame as f64,
            root,
            velocity: (0.0, 0.0),
            turn_rate: 0.0,
            pose: Pose::default(),
            contacts: alloc::vec![true; feet],
            motor: MotorState {
                source: MotorSource::MotionMatch,
                phase: 0.0,
                duty: 0.0,
                stride_frequency: 0.0,
                contacts: alloc::vec![true; feet],
            },
            transitions: 0,
            last_hit: Hit::NONE,
            last_current_cost: f64::INFINITY,
            timer: 0.0,
            force: true,
            inert: Inertializer::new(bones, 1 + feet),
            estimator: PhaseEstimator::new(feet, 0),
            query: alloc::vec![0.0; dims],
            positions: Vec::with_capacity(1 + feet),
            db,
        }
    }

    /// Search on the next update whatever the timer says (a sharp change
    /// of command, say).
    pub fn force_search(&mut self) {
        self.force = true;
    }

    /// Global index of the current frame.
    pub fn current_index(&self) -> usize {
        self.db.starts[self.clip] + self.db.clips[self.clip].wrap(libm::floor(self.frame) as i64)
    }

    /// The desired trajectory for a speed and turn rate, from the current
    /// root velocity.
    pub fn trajectory(&self, speed: f64, turn_rate: f64) -> Vec<f64> {
        predict(
            self.velocity,
            speed,
            turn_rate,
            self.params.trajectory_halflife,
            &self.db.config.traj_times,
            1.0 / 60.0,
        )
    }

    /// One frame. `traj` is the desired trajectory in the layout
    /// [`predict`] writes. Returns whether a transition happened.
    pub fn update(&mut self, dt: f64, traj: &[f64]) -> bool {
        let fps = self.db.fps;
        let clip = &self.db.clips[self.clip];
        let last = (clip.frames - 1) as f64;
        let mut f1 = self.frame + dt * fps;
        let at_end = !clip.looped && f1 >= last;
        if at_end {
            f1 = last;
        }
        let d = clip.root_at_f(self.frame).relative(clip.root_at_f(f1));
        self.root = self.root.to_world(d);
        if dt > 0.0 {
            self.velocity = (d.x / dt, d.z / dt);
            self.turn_rate = d.yaw / dt;
        }
        self.frame = if clip.looped {
            f1 % clip.frames as f64
        } else {
            f1
        };

        self.timer -= dt;
        let mut jumped = false;
        if self.timer <= 0.0 || self.force || at_end {
            self.timer = self.params.search_interval;
            self.force = false;
            jumped = self.search(traj);
        }

        let clip = &self.db.clips[self.clip];
        clip.sample(self.frame, &mut self.pose);
        clip.contacts_at(self.frame, &mut self.contacts);
        if jumped {
            self.inert.capture();
        }
        self.positions.clear();
        self.positions.push(self.pose.hips);
        self.positions.extend_from_slice(&self.pose.feet);
        self.inert.apply(
            &mut self.pose.rotations,
            &mut self.positions,
            dt,
            self.params.halflife,
        );
        self.pose.hips = self.positions[0];
        self.pose.feet.copy_from_slice(&self.positions[1..]);
        self.motor = self
            .estimator
            .update(dt, &self.contacts, MotorSource::MotionMatch);
        jumped
    }

    fn search(&mut self, traj: &[f64]) -> bool {
        let cur = self.current_index();
        let o = self.db.traj_offset();
        self.query[..o].copy_from_slice(&self.db.row(cur)[..o]);
        self.db.write_trajectory(traj, &mut self.query);
        let current_cost = if self.db.searchable[cur] {
            self.db.cost_of(cur, &self.query)
        } else {
            f64::INFINITY
        };
        self.last_current_cost = current_cost;
        let init = Hit {
            index: cur,
            cost: current_cost - self.params.min_improvement,
        };
        let (c, f) = self.db.locate(cur);
        let ex = Exclude {
            clip: c,
            frame: f,
            window: self.db.config.ignore_window,
        };
        let hit = self.db.search(&self.query, Some(ex), init);
        self.last_hit = hit;
        if hit.index == cur || hit.index == usize::MAX {
            return false;
        }
        let (nc, nf) = self.db.locate(hit.index);
        self.clip = nc;
        self.frame = nf as f64;
        self.transitions += 1;
        true
    }

    /// Whether a transition offset is still decaying.
    pub fn blending(&self) -> bool {
        self.inert.active()
    }

    /// World positions of the feet after the last update.
    pub fn world_feet(&self) -> Vec<Vec3> {
        self.pose
            .feet
            .iter()
            .map(|&p| self.root.point_to_world(p))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::synth::{stride_period, test_database};

    fn run(schedule: &[(f64, f64, usize)], mut each: impl FnMut(&Matcher, bool)) -> Matcher {
        let db = test_database(30.0);
        let mut m = Matcher::new(db, MatcherParams::default(), 0, 0, Root::default());
        let dt = 1.0 / 60.0;
        for &(speed, turn, frames) in schedule {
            m.force_search();
            for _ in 0..frames {
                let tr = m.trajectory(speed, turn);
                let j = m.update(dt, &tr);
                each(&m, j);
            }
        }
        m
    }

    #[test]
    fn commands_pick_matching_clips() {
        let m = run(&[(1.2, 0.0, 180)], |_, _| {});
        assert_eq!(m.clip, 1, "walk");
        let m = run(&[(3.0, 0.0, 240)], |_, _| {});
        assert_eq!(m.clip, 2, "run");
        let m = run(&[(1.2, 0.8, 120)], |_, _| {});
        assert_eq!(m.clip, 3, "left arc");
        let m = run(&[(0.0, 0.0, 120)], |_, _| {});
        assert_eq!(m.clip, 0, "idle");
        let m = run(&[(1.2, 0.0, 120), (0.0, 1.2, 120)], |_, _| {});
        assert_eq!(m.clip, 5, "turn in place");
        let speed = libm::hypot(m.velocity.0, m.velocity.1);
        assert!(speed < 0.05 && m.turn_rate > 1.0, "{speed} {}", m.turn_rate);
    }

    #[test]
    fn root_speed_follows_the_command() {
        let m = run(&[(3.0, 0.0, 300)], |_, _| {});
        let speed = libm::hypot(m.velocity.0, m.velocity.1);
        assert!((speed - 3.0).abs() < 0.05, "{speed}");
    }

    /// Per frame displacement of the hip and feet on transition frames
    /// stays within the largest displacement on ordinary frames, and so
    /// does the change of velocity: no pose or velocity pop.
    #[test]
    fn transitions_do_not_pop() {
        let schedule = [
            (0.0, 0.0, 60),
            (1.2, 0.0, 120),
            (3.0, 0.0, 120),
            (1.2, -0.8, 120),
            (2.0, 0.0, 120),
            (0.0, 1.2, 120),
            (0.0, 0.0, 120),
        ];
        let mut prev: Option<Vec<Vec3>> = None;
        let mut prev_d: Option<Vec<Vec3>> = None;
        let (mut plain_step, mut jump_step): (f64, f64) = (0.0, 0.0);
        let (mut plain_acc, mut jump_acc): (f64, f64) = (0.0, 0.0);
        let mut jumps = 0;
        let mut since = 99;
        let m = run(&schedule, |m, j| {
            let mut p = alloc::vec![m.pose.hips];
            p.extend_from_slice(&m.pose.feet);
            if j {
                jumps += 1;
                since = 0;
            } else {
                since += 1;
            }
            if let Some(q) = &prev {
                let d: Vec<Vec3> = p.iter().zip(q).map(|(a, b)| *a - *b).collect();
                let step = d.iter().map(|v| v.length()).fold(0.0, f64::max);
                if let Some(pd) = &prev_d {
                    let acc = d
                        .iter()
                        .zip(pd)
                        .map(|(a, b)| (*a - *b).length())
                        .fold(0.0, f64::max);
                    if since < 2 {
                        jump_acc = jump_acc.max(acc);
                    } else {
                        plain_acc = plain_acc.max(acc);
                    }
                }
                if since < 2 {
                    jump_step = jump_step.max(step);
                } else {
                    plain_step = plain_step.max(step);
                }
                prev_d = Some(d);
            }
            prev = Some(p);
        });
        assert!(jumps >= 5 && m.transitions as usize == jumps, "{jumps}");
        assert!(
            jump_step <= plain_step * 1.05,
            "step {jump_step} vs {plain_step}"
        );
        assert!(jump_acc <= plain_acc * 1.5, "acc {jump_acc} vs {plain_acc}");
    }

    /// Mean world slide of a foot that is in contact on two frames running,
    /// over a run with transitions.
    #[test]
    fn foot_slide_stays_small() {
        let schedule = [
            (1.2, 0.0, 240),
            (3.0, 0.0, 240),
            (1.2, 0.8, 240),
            (0.0, 0.0, 120),
        ];
        let mut prev: Option<(Vec<Vec3>, Vec<bool>)> = None;
        let (mut total, mut count) = (0.0, 0);
        let mut worst: f64 = 0.0;
        let (mut settled, mut settled_n) = (0.0, 0);
        let (mut near, mut far): (f64, f64) = (0.0, 0.0);
        let mut since = 99;
        let m = run(&schedule, |m, j| {
            since = if j { 0 } else { since + 1 };
            let w = m.world_feet();
            if let Some((pw, pc)) = &prev {
                for k in 0..w.len() {
                    if pc[k] && m.contacts[k] {
                        let s = w[k].distance(pw[k]);
                        total += s;
                        count += 1;
                        worst = worst.max(s);
                        // planted feet only: swing feet never enter this measure
                        if since < 12 {
                            near = near.max(s);
                        } else {
                            far = far.max(s);
                        }
                        if !m.blending() {
                            settled += s;
                            settled_n += 1;
                        }
                    }
                }
            }
            prev = Some((w, m.contacts.clone()));
        });
        assert!(m.transitions >= 4, "{}", m.transitions);
        let mean = total / count as f64;
        let settled = settled / settled_n as f64;
        // measured 2026-11-23 after the inertializer velocity fix: mean 1.5 mm,
        // settled 0.8 mm, worst 39 mm per frame at 60 Hz; planted feet within
        // 12 frames of a transition 26 mm, elsewhere 39 mm (the synthetic
        // clips slide on their own; nothing locks feet here)
        assert!(
            near <= far,
            "transition slide {near} m against {far} m elsewhere"
        );
        assert!(mean < 0.0025, "mean slide {mean} m per frame");
        assert!(settled < 0.0012, "settled slide {settled} m per frame");
        assert!(worst < 0.05, "worst slide {worst}");
    }

    #[test]
    fn motor_state_tracks_the_stride() {
        let m = run(&[(1.2, 0.0, 600)], |_, _| {});
        let expect = 1.0 / stride_period(1.2, 0.0, 30.0);
        assert_eq!(m.motor.source.name(), "motion-match");
        assert!(
            (m.motor.stride_frequency - expect).abs() / expect < 0.05,
            "{} vs {expect}",
            m.motor.stride_frequency
        );
        assert!((m.motor.duty - 0.6).abs() < 0.08, "{}", m.motor.duty);
    }
}
