//! Potential field steering toward a goal: obstacles push away and to the
//! side the goal lies on, an optional round fence pushes inward, speed drops
//! with heading error and near the goal.

use organic::math::{clamp, lerp, smoothstep, wrap_angle};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Obstacle {
    pub x: f64,
    pub z: f64,
    pub r: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SteerParams {
    pub speed: f64,
    pub stop_distance: f64,
    /// Body radius kept clear of obstacles.
    pub clearance: f64,
    /// Distance at which obstacles start to push.
    pub influence: f64,
    /// Turn rate limits at low and high speed.
    pub turn_slow: f64,
    pub turn_fast: f64,
    /// Fence radius around the origin, 0 for none.
    pub fence: f64,
}

impl Default for SteerParams {
    fn default() -> Self {
        SteerParams {
            speed: 1.6,
            stop_distance: 0.3,
            clearance: 0.3,
            influence: 1.6,
            turn_slow: 3.2,
            turn_fast: 1.6,
            fence: 0.0,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SteerOut {
    pub v: f64,
    pub w: f64,
    pub arrived: bool,
}

/// Speed and turn rate commands toward `(tx, tz)` for a body at `(x, z)`
/// facing `yaw` and moving at `v`.
pub fn steer(
    x: f64,
    z: f64,
    yaw: f64,
    v: f64,
    tx: f64,
    tz: f64,
    obstacles: &[Obstacle],
    p: &SteerParams,
) -> SteerOut {
    let (dx, dz) = (tx - x, tz - z);
    let dist = libm::hypot(dx, dz);
    if dist < p.stop_distance {
        return SteerOut {
            v: 0.0,
            w: 0.0,
            arrived: true,
        };
    }
    let (mut ux, mut uz) = (dx / dist, dz / dist);
    let (mut ax, mut az) = (0.0, 0.0);
    for o in obstacles {
        let (ox, oz) = (x - o.x, z - o.z);
        let dd = libm::hypot(ox, oz) - o.r - p.clearance;
        let goal_outside = libm::hypot(tx - o.x, tz - o.z) > o.r + p.clearance + 0.05;
        if dd < p.influence && goal_outside {
            let w = (1.0 / dd.max(0.05) - 1.0 / p.influence) * 0.35;
            let r = dd + o.r + p.clearance;
            ax += ox / r * w;
            az += oz / r * w;
            let side = {
                let s = ux * oz - uz * ox;
                if s >= 0.0 { 1.0 } else { -1.0 }
            };
            ax += -uz * side * w * 0.6;
            az += ux * side * w * 0.6;
        }
    }
    if p.fence > 0.0 {
        let r = libm::hypot(x, z);
        if r > p.fence - p.influence && r > 1e-9 {
            let k = (r - p.fence + p.influence) * 1.2;
            ax -= x / r * k;
            az -= z / r * k;
        }
    }
    ux += ax;
    uz += az;
    let l = libm::hypot(ux, uz).max(1e-9);
    ux /= l;
    uz /= l;
    let want = libm::atan2(ux, uz);
    let err = wrap_angle(want - yaw);
    let w_max = lerp(p.turn_slow, p.turn_fast, smoothstep(1.5, 4.5, v));
    let w = clamp(err * 3.2, -w_max, w_max);
    let mut vc = p.speed
        * clamp(libm::cos(err) * 1.2, 0.0, 1.0)
        * clamp((dist - p.stop_distance) / 0.9 + 0.15, 0.0, 1.0);
    if libm::fabs(err) > 1.4 {
        vc = vc.min(0.35);
    }
    if dist < 1.1 && libm::fabs(err) > 0.5 {
        vc = vc.min(0.12);
    }
    SteerOut {
        v: vc,
        w,
        arrived: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reaches_goal_around_an_obstacle() {
        let obs = [Obstacle {
            x: 0.0,
            z: 2.5,
            r: 0.6,
        }];
        let p = SteerParams::default();
        let (mut x, mut z, mut yaw) = (0.05, 0.0, 0.0);
        let dt = 1.0 / 60.0;
        let mut arrived = false;
        for _ in 0..3000 {
            let s = steer(x, z, yaw, p.speed, 0.0, 5.0, &obs, &p);
            if s.arrived {
                arrived = true;
                break;
            }
            yaw += s.w * dt;
            x += libm::sin(yaw) * s.v * dt;
            z += libm::cos(yaw) * s.v * dt;
            assert!(
                libm::hypot(x - obs[0].x, z - obs[0].z) > obs[0].r,
                "went through the obstacle"
            );
        }
        assert!(arrived);
    }
}
