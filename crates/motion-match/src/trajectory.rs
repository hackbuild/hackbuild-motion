//! The desired future trajectory for a speed and turn rate command, in the
//! character's root frame: the facing turns at the commanded rate and the
//! velocity follows the commanded velocity through a first order spring
//! with the given halflife, starting from the current velocity.

use alloc::vec::Vec;

/// `x z` per time, then `dx dz` (facing) per time, the layout
/// [`Database::write_trajectory`](crate::db::Database::write_trajectory)
/// reads. `times` must be ascending.
pub fn predict(
    vel: (f64, f64),
    speed: f64,
    turn_rate: f64,
    halflife: f64,
    times: &[f64],
    step: f64,
) -> Vec<f64> {
    let n = times.len();
    let mut out = alloc::vec![0.0; 4 * n];
    let (mut vx, mut vz) = vel;
    let (mut x, mut z, mut t) = (0.0, 0.0, 0.0);
    let k = core::f64::consts::LN_2 / halflife.max(1e-4);
    for (i, &target) in times.iter().enumerate() {
        while t < target - 1e-12 {
            let h = step.min(target - t);
            let yaw = turn_rate * (t + 0.5 * h);
            let (dx, dz) = (speed * libm::sin(yaw), speed * libm::cos(yaw));
            let a = libm::exp(-k * h);
            vx = dx + (vx - dx) * a;
            vz = dz + (vz - dz) * a;
            x += vx * h;
            z += vz * h;
            t += h;
        }
        let yaw = turn_rate * target;
        out[2 * i] = x;
        out[2 * i + 1] = z;
        out[2 * n + 2 * i] = libm::sin(yaw);
        out[2 * n + 2 * i + 1] = libm::cos(yaw);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steady_walk_goes_straight_ahead() {
        let p = predict((0.0, 1.5), 1.5, 0.0, 0.2, &[0.5, 1.0], 1.0 / 60.0);
        assert!((p[1] - 0.75).abs() < 1e-9 && (p[3] - 1.5).abs() < 1e-9);
        assert!(p[0].abs() < 1e-12 && (p[5] - 1.0).abs() < 1e-12);
    }

    #[test]
    fn start_from_rest_lags_the_command() {
        let p = predict((0.0, 0.0), 2.0, 0.0, 0.25, &[1.0], 1.0 / 60.0);
        assert!(p[1] > 1.2 && p[1] < 2.0, "{}", p[1]);
    }

    #[test]
    fn turn_in_place_rotates_without_moving() {
        let p = predict((0.0, 0.0), 0.0, 1.0, 0.2, &[1.0], 1.0 / 60.0);
        assert!(p[0].abs() < 1e-12 && p[1].abs() < 1e-12);
        assert!((p[2] - libm::sin(1.0)).abs() < 1e-12);
    }
}
