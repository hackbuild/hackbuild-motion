//! Settles a motion on the floor. Motion capture often stands a few
//! centimetres off y = 0; when the lowest joint over the clip sits near the
//! rest floor but not on it, the hips track shifts so it touches. The
//! lowest joint is taken at the 10th percentile over 60 samples, so a few
//! glitched frames do not lift the clip, and a clip that never comes near
//! the floor (an airborne loop) is left alone.

use crate::analyze::reference_pose;
use crate::motion::HumanoidMotion;
use rig::bones::HumanBone;
use rig::reference::{reference_position, reference_rest};

/// Shift applied, in meters on the reference body (0 when left alone).
pub fn settle_on_floor(m: &mut HumanoidMotion) -> f64 {
    let n = m.frames();
    if n == 0 || m.hips.is_none() {
        return 0.0;
    }
    let h = reference_position(HumanBone::Hips).y;
    let rest_low = reference_rest()
        .iter()
        .map(|v| v.y)
        .fold(f64::INFINITY, f64::min);
    let samples = 60.min(n.max(1));
    let mut lows: alloc::vec::Vec<f64> = (0..samples)
        .map(|k| {
            let f = if samples > 1 {
                k * (n - 1) / (samples - 1)
            } else {
                0
            };
            let (wp, _) = reference_pose(m, f);
            wp.iter().map(|v| v.y).fold(f64::INFINITY, f64::min)
        })
        .collect();
    lows.sort_by(|a, b| a.partial_cmp(b).unwrap_or(core::cmp::Ordering::Equal));
    let low = lows[(samples as f64 * 0.1) as usize] - rest_low;
    if libm::fabs(low) < 1e-3 * h || libm::fabs(low) > 0.15 * h {
        return 0.0;
    }
    if let Some(hips) = &mut m.hips {
        for v in hips.iter_mut() {
            v.y -= low / h;
        }
    }
    low
}
