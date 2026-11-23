//! Whole body motion on top of the legs: posture springs, terrain pitch and
//! roll, gait bob and rock, lean into turns, fore and hind load shift under
//! acceleration, breathing and standing sway.

use alloc::string::String;
use alloc::vec::Vec;
use organic::Rng;
use organic::math::clamp;
use organic::noise::{Ou, Pink};
use organic::spring::{Exp, SpringState, spring};

/// A named posture: how the body moves and where each foot goes when its
/// weight is 1.
#[derive(Clone, Debug, PartialEq)]
pub struct Posture {
    pub name: String,
    pub pitch: f64,
    pub drop: f64,
    pub dz: f64,
    /// Per leg foot offset (x, z) in the body frame.
    pub offsets: Vec<[f64; 2]>,
    pub tilt_front: f64,
    pub tilt_rear: f64,
}

fn p(
    name: &str,
    pitch: f64,
    drop: f64,
    dz: f64,
    off: [[f64; 2]; 4],
    tilt_rear: f64,
    tilt_front: f64,
) -> Posture {
    Posture {
        name: name.into(),
        pitch,
        drop,
        dz,
        offsets: off.to_vec(),
        tilt_front,
        tilt_rear,
    }
}

/// Sit, down, bow and reach for a dog, legs LF RF LH RH. Values from the
/// HACKLE body (vendor, tuned by eye on a 0.78 m tall dog).
pub fn dog_postures() -> Vec<Posture> {
    alloc::vec![
        p(
            "sit",
            -0.42,
            0.175,
            -0.02,
            [[0.0, -0.05], [0.0, -0.05], [0.015, 0.13], [-0.015, 0.13]],
            -1.0,
            0.0
        ),
        p(
            "down",
            -0.04,
            0.215,
            0.0,
            [[0.0, 0.17], [0.0, 0.17], [0.05, 0.17], [-0.05, 0.17]],
            -1.35,
            -1.2
        ),
        p(
            "bow",
            0.36,
            0.02,
            0.0,
            [[0.01, 0.13], [-0.01, 0.13], [0.0, 0.0], [0.0, 0.0]],
            0.0,
            -0.9
        ),
        p(
            "reach",
            0.22,
            0.02,
            0.0,
            [[0.0, -0.02], [0.0, -0.02], [0.0, 0.02], [0.0, 0.02]],
            0.0,
            0.0
        ),
    ]
}

#[derive(Clone, Debug)]
pub struct BodyParams {
    /// Posture spring halflife in seconds; settling down is a quarter faster.
    pub posture_halflife: f64,
    pub lean_gain: f64,
    /// Pitch in radians per m/s^2 of acceleration.
    pub load_shift: f64,
    /// Lengths scale: 1 for the dog the tables were tuned on.
    pub size: f64,
    /// z of the front and rear foot spots and half the track width, meters.
    pub front_z: f64,
    pub rear_z: f64,
    pub half_width: f64,
}

impl Default for BodyParams {
    fn default() -> Self {
        BodyParams {
            posture_halflife: 0.2,
            lean_gain: 1.0,
            load_shift: 0.045,
            size: 1.0,
            front_z: 0.22,
            rear_z: -0.2,
            half_width: 0.09,
        }
    }
}

/// What the body pass needs each frame.
#[derive(Clone, Debug, Default)]
pub struct BodyInput {
    /// Gait weights: walk, pace, trot, canter, gallop.
    pub weights: [f64; 5],
    /// Stride phase, 0 to 1.
    pub phase: f64,
    pub standing: bool,
    pub v: f64,
    pub w: f64,
    /// Posture goals, one per posture, 0 to 1.
    pub posture_goals: Vec<f64>,
    /// Ground height under each leg's nominal spot (LF RF LH RH).
    pub ground: [f64; 4],
    /// Breaths per second, and depth in meters.
    pub breath_rate: f64,
    pub breath_depth: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct BodyPose {
    /// Root height: the rear ground height.
    pub root_y: f64,
    /// How far the body sinks below its rest height, meters.
    pub drop: f64,
    pub dz: f64,
    pub pitch: f64,
    pub roll: f64,
    /// Spine yaw bend into the turn and spine flex of the faster gaits.
    pub bend: f64,
    pub flex: f64,
    pub breathe: f64,
    /// Current posture weights after the springs.
    pub posture: Vec<f64>,
    /// Per leg posture offsets for `Gait::offsets`.
    pub leg_offsets: Vec<[f64; 2]>,
    /// Per leg paw tilt in radians.
    pub tilt: Vec<f64>,
}

pub struct BodyDynamics {
    pub postures: Vec<Posture>,
    pub params: BodyParams,
    post: Vec<SpringState>,
    lean: SpringState,
    load: SpringState,
    v_prev: f64,
    sway: Pink,
    sway_roll: Pink,
    breath: f64,
    breath_jitter: Ou,
}

impl BodyDynamics {
    pub fn new<R: Rng + ?Sized>(postures: Vec<Posture>, params: BodyParams, rng: &mut R) -> Self {
        let n = postures.len();
        BodyDynamics {
            postures,
            params,
            post: alloc::vec![SpringState::default(); n],
            lean: SpringState::default(),
            load: SpringState::default(),
            v_prev: 0.0,
            sway: Pink::new(0.6, 5, rng),
            sway_roll: Pink::new(0.6, 5, rng),
            breath: 0.0,
            breath_jitter: Ou::new(3.0, 0.12, 0.0),
        }
    }

    pub fn update<R: Rng + ?Sized>(&mut self, dt: f64, inp: &BodyInput, rng: &mut R) -> BodyPose {
        // a frame clock can step back (an animation frame stamped before the last read); time never runs backward here
        let dt = if dt > 0.0 { dt } else { 0.0 };
        let k = self.params.size;
        let n_legs = 4;
        for (i, s) in self.post.iter_mut().enumerate() {
            let goal = inp.posture_goals.get(i).copied().unwrap_or(0.0);
            let hl = self.params.posture_halflife * if goal < s.x { 0.75 } else { 1.0 };
            spring(s, goal, hl, dt, Exp::Exact);
            s.x = clamp(s.x, -0.05, 1.05);
        }
        let pw: Vec<f64> = self.post.iter().map(|s| s.x).collect();
        let mut leg_offsets = alloc::vec![[0.0; 2]; n_legs];
        let mut tilt = alloc::vec![0.0; n_legs];
        for (p, w) in self.postures.iter().zip(&pw) {
            for i in 0..n_legs {
                let o = p.offsets.get(i).copied().unwrap_or([0.0; 2]);
                leg_offsets[i][0] += o[0] * w * k;
                leg_offsets[i][1] += o[1] * w * k;
                tilt[i] += if i < 2 { p.tilt_front } else { p.tilt_rear } * w;
            }
        }
        let g = inp.ground;
        let front = (g[0] + g[1]) / 2.0;
        let rear = (g[2] + g[3]) / 2.0;
        let t_pitch = -libm::atan2(front - rear, self.params.front_z - self.params.rear_z);
        let t_roll = libm::atan2(
            ((g[0] + g[2]) - (g[1] + g[3])) / 2.0,
            self.params.half_width * 2.0,
        ) * 0.6;
        self.breath += dt
            * 2.0
            * core::f64::consts::PI
            * inp.breath_rate
            * libm::exp(self.breath_jitter.step(dt, rng));
        let breathe = libm::sin(self.breath) * inp.breath_depth;
        let ph = inp.phase * 2.0 * core::f64::consts::PI;
        let gw = inp.weights;
        let mov = if inp.standing { 0.0 } else { 1.0 };
        let c2 = libm::cos(2.0 * ph);
        let bob = mov
            * k
            * (gw[0] * 0.006 * c2 - gw[1] * 0.008 * c2 - gw[2] * 0.014 * c2
                + (gw[3] * 0.02 + gw[4] * 0.03) * libm::sin(ph));
        let g_pitch = mov * (gw[3] * 0.08 + gw[4] * 0.11) * libm::sin(ph + 0.6);
        let g_roll = mov * (gw[0] * 0.035 + gw[1] * 0.07) * libm::sin(ph);
        let mut pitch = t_pitch + g_pitch;
        let mut drop = -bob - breathe;
        let mut dz = 0.0;
        for (p, w) in self.postures.iter().zip(&pw) {
            pitch += p.pitch * w;
            drop += p.drop * w * k;
            dz += p.dz * w * k;
        }
        let mut roll = t_roll + g_roll;
        spring(
            &mut self.lean,
            libm::atan(inp.v * inp.w / 9.81) * self.params.lean_gain,
            0.12,
            dt,
            Exp::Exact,
        );
        roll -= self.lean.x;
        let acc = (inp.v - self.v_prev) / dt.max(1e-3);
        self.v_prev = inp.v;
        spring(
            &mut self.load,
            clamp(-acc * self.params.load_shift, -0.12, 0.12),
            0.1,
            dt,
            Exp::Exact,
        );
        pitch += self.load.x;
        let sit_down: f64 = pw.iter().take(2).sum();
        let s1 = self.sway.step(dt, rng);
        let s2 = self.sway_roll.step(dt, rng);
        if inp.standing && sit_down < 0.3 {
            drop += s1 * 0.003 * k;
            roll += s2 * 0.012;
        }
        BodyPose {
            root_y: rear,
            drop,
            dz,
            pitch,
            roll,
            bend: clamp(inp.w * 0.09, -0.22, 0.22),
            flex: mov * (gw[4] * 0.16 + gw[3] * 0.08) * libm::sin(ph + 1.4),
            breathe,
            posture: pw,
            leg_offsets,
            tilt,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use organic::Mulberry32;

    #[test]
    fn sit_settles_and_slope_pitches() {
        let mut r = Mulberry32::new(1);
        let mut b = BodyDynamics::new(dog_postures(), BodyParams::default(), &mut r);
        let mut inp = BodyInput {
            posture_goals: alloc::vec![1.0, 0.0, 0.0, 0.0],
            standing: true,
            ..Default::default()
        };
        let mut pose = BodyPose::default();
        for _ in 0..240 {
            pose = b.update(1.0 / 60.0, &inp, &mut r);
        }
        assert!((pose.posture[0] - 1.0).abs() < 1e-3);
        assert!((pose.pitch + 0.42).abs() < 0.02 && pose.drop > 0.15);
        inp.posture_goals = alloc::vec![0.0; 4];
        inp.ground = [0.1, 0.1, 0.0, 0.0];
        for _ in 0..240 {
            pose = b.update(1.0 / 60.0, &inp, &mut r);
        }
        // front higher than rear: nose up, which is negative pitch about +X here
        assert!(pose.pitch < -0.2, "{}", pose.pitch);
    }

    #[test]
    fn leans_into_turns() {
        let mut r = Mulberry32::new(2);
        let mut b = BodyDynamics::new(dog_postures(), BodyParams::default(), &mut r);
        let inp = BodyInput {
            v: 2.0,
            w: 1.5,
            posture_goals: alloc::vec![0.0; 4],
            ..Default::default()
        };
        let mut pose = BodyPose::default();
        for _ in 0..120 {
            pose = b.update(1.0 / 60.0, &inp, &mut r);
        }
        assert!(
            (pose.roll + libm::atan(3.0 / 9.81)).abs() < 0.05,
            "{}",
            pose.roll
        );
    }

    #[test]
    fn a_backward_frame_step_stays_finite() {
        let mut r = Mulberry32::new(3);
        let mut b = BodyDynamics::new(dog_postures(), BodyParams::default(), &mut r);
        let inp = BodyInput {
            v: 0.8,
            w: 0.4,
            posture_goals: alloc::vec![0.0; 4],
            ..Default::default()
        };
        // measured before the fix: drop and breathe were NaN after a dt of -0.004
        let pose = b.update(-0.004, &inp, &mut r);
        assert!(pose.drop.is_finite() && pose.breathe.is_finite());
        let pose = b.update(1.0 / 60.0, &inp, &mut r);
        assert!(pose.drop.is_finite() && pose.breathe.is_finite());
    }
}
