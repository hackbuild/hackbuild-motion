//! A fixed scenario for the native and wasm agreement test.

use crate::body::{BodyDynamics, BodyInput, BodyParams, dog_postures};
use crate::gait::{BodyMotion, Gait, LegSpec};
use crate::secondary::{EarPair, Wag, WagInput};
use crate::steer::{Obstacle, SteerParams, steer};
use alloc::vec::Vec;
use organic::{Mulberry32, Rng};

pub fn dog_legs() -> Vec<LegSpec> {
    alloc::vec![
        LegSpec {
            x: 0.09,
            z: 0.22,
            toe: 0.02,
            front: true
        },
        LegSpec {
            x: -0.09,
            z: 0.22,
            toe: 0.02,
            front: true
        },
        LegSpec {
            x: 0.09,
            z: -0.2,
            toe: 0.02,
            front: false
        },
        LegSpec {
            x: -0.09,
            z: -0.2,
            toe: 0.02,
            front: false
        },
    ]
}

pub fn trace(seed: u32) -> Vec<f64> {
    let mut r = Mulberry32::new(seed);
    let mut out = Vec::new();
    let mut g = Gait::quadruped(dog_legs(), 0.42);
    let mut b = BodyDynamics::new(dog_postures(), BodyParams::default(), &mut r);
    let mut wag = Wag::new(3, 0.06);
    let mut ears = EarPair::new(0.07);
    let mut body = BodyMotion::default();
    let dt = 1.0 / 60.0;
    let obs = [Obstacle {
        x: 0.4,
        z: 3.0,
        r: 0.5,
    }];
    for k in 0..240 {
        let s = steer(
            body.x,
            body.z,
            body.yaw,
            body.v,
            0.0,
            6.0,
            &obs,
            &SteerParams::default(),
        );
        body.v += (s.v * (0.5 + r.next_f64()) - body.v) * 0.1;
        body.w = s.w;
        body.yaw += body.w * dt;
        body.x += libm::sin(body.yaw) * body.v * dt;
        body.z += libm::cos(body.yaw) * body.v * dt;
        let touch = g.update(dt, body, &mut r);
        let inp = BodyInput {
            weights: [
                g.weights[0],
                g.weights[1],
                g.weights[2],
                g.weights[3],
                g.weights[4],
            ],
            phase: g.phase,
            standing: g.standing,
            v: body.v,
            w: body.w,
            posture_goals: alloc::vec![0.0; 4],
            ground: [0.0; 4],
            breath_rate: 0.3,
            breath_depth: 0.003,
        };
        let pose = b.update(dt, &inp, &mut r);
        let tail = wag.update(
            dt,
            &WagInput {
                mode_weights: alloc::vec![1.0; 8],
                arousal: 0.5,
                amp_scale: 1.0,
                hz_scale: 1.0,
                ..Default::default()
            },
            &mut r,
        );
        let e = ears.update(dt, 0.3, 0.0, body.w, 0.0, 0.0);
        if k % 20 == 0 {
            out.extend_from_slice(&[g.phase, g.freq, g.duty, touch as f64]);
            for f in &g.feet {
                out.extend_from_slice(&[f.x, f.y, f.z]);
            }
            out.extend_from_slice(&[
                pose.pitch,
                pose.roll,
                pose.drop,
                tail.yaw[2],
                tail.lift,
                e[0],
            ]);
        }
    }
    out
}
