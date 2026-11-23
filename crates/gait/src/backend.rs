//! The locomotion backend interface: a procedural gait, a neural network or
//! a motion matcher each declare what they can do, so the caller asks the
//! backend for its stop distance instead of assuming one.

use crate::gait::{BodyMotion, Gait};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Capabilities {
    pub turn_in_place: bool,
    /// The closest the backend can stop to a goal, meters.
    pub min_stop_distance: f64,
    /// Head pitch the backend's own motion carries, radians.
    pub head_pitch_bias: f64,
}

/// Root motion a backend produced this frame.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RootMotion {
    pub x: f64,
    pub z: f64,
    pub yaw: f64,
    pub v: f64,
    pub w: f64,
}

pub trait LocomotionBackend {
    fn capabilities(&self) -> Capabilities;
    /// Advances one frame toward the commanded speed and turn rate.
    fn step(&mut self, dt: f64, v: f64, w: f64, rng: &mut dyn organic::Rng) -> RootMotion;
    /// The common motor state after the last step.
    fn motor_state(&self) -> crate::motor::MotorState;
}

/// The procedural gait as a backend: integrates the commands into root
/// motion and steps the legs.
pub struct ProceduralBackend {
    pub gait: Gait,
    pub root: RootMotion,
    pub posed: f64,
}

impl LocomotionBackend for ProceduralBackend {
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            turn_in_place: true,
            min_stop_distance: 0.05,
            head_pitch_bias: 0.0,
        }
    }
    fn step(&mut self, dt: f64, v: f64, w: f64, rng: &mut dyn organic::Rng) -> RootMotion {
        let r = &mut self.root;
        r.v = v;
        r.w = w;
        r.yaw = organic::math::wrap_angle(r.yaw + w * dt);
        r.x += libm::sin(r.yaw) * v * dt;
        r.z += libm::cos(r.yaw) * v * dt;
        let body = BodyMotion {
            x: r.x,
            z: r.z,
            yaw: r.yaw,
            v,
            w,
            posed: self.posed,
        };
        self.gait.update(dt, body, rng);
        *r
    }
    fn motor_state(&self) -> crate::motor::MotorState {
        self.gait.motor_state()
    }
}
