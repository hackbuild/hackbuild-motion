//! Analytic two bone IK (law of cosines) with a pole vector.

use organic::{Quat, Vec3};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TwoBone {
    /// New middle joint position.
    pub mid: Vec3,
    /// New end joint position.
    pub end: Vec3,
    /// World delta for the upper bone.
    pub upper: Quat,
    /// World delta for the lower bone, applied after `upper` has moved it:
    /// the lower bone's new world rotation is `lower * upper * old`.
    pub lower: Quat,
    /// Whether the target was within reach.
    pub reached: bool,
}

/// Solves the chain `a` (root) to `b` (middle) to `c` (end) toward
/// `target`, bending the middle joint toward `pole` (a direction, not a
/// point). `soft` in meters eases the last stretch of reach so a straight
/// limb does not snap (0 turns it off).
pub fn two_bone(a: Vec3, b: Vec3, c: Vec3, target: Vec3, pole: Vec3, soft: f64) -> TwoBone {
    let l1 = (b - a).length();
    let l2 = (c - b).length();
    let to = target - a;
    let raw = to.length();
    let dn = if raw > 1e-12 {
        to * (1.0 / raw)
    } else {
        (c - a).normalize()
    };
    let max = l1 + l2;
    let min = libm::fabs(l1 - l2);
    let mut d = raw;
    if soft > 0.0 && d > max - soft {
        let s = soft.min(max);
        d = (max - s) + s * (1.0 - libm::exp(-(d - (max - s)) / s));
    }
    let reached = raw <= max + 1e-9 && raw >= min - 1e-9;
    d = d.clamp(min + 1e-9, max - 1e-9);
    // pole made perpendicular to the reach direction; fall back to the
    // current bend when the pole is parallel to it
    let mut p = pole.reject(dn);
    if p.length() < 1e-9 {
        p = (b - a).reject(dn);
    }
    if p.length() < 1e-9 {
        p = if libm::fabs(dn.y) < 0.9 {
            Vec3::Y.reject(dn)
        } else {
            Vec3::X.reject(dn)
        };
    }
    let p = p.normalize();
    let along = (l1 * l1 - l2 * l2 + d * d) / (2.0 * d);
    let h = libm::sqrt((l1 * l1 - along * along).max(0.0));
    let mid = a + dn * along + p * h;
    let end = a + dn * d;
    let upper = Quat::from_unit_vectors((b - a).normalize(), (mid - a).normalize());
    let c1 = a + upper.rotate(c - a);
    let lower = Quat::from_unit_vectors((c1 - mid).normalize(), (end - mid).normalize());
    TwoBone {
        mid,
        end,
        upper,
        lower,
        reached,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use organic::{Mulberry32, Rng};

    fn rv(r: &mut Mulberry32) -> Vec3 {
        Vec3::new(
            r.next_f64() * 2.0 - 1.0,
            r.next_f64() * 2.0 - 1.0,
            r.next_f64() * 2.0 - 1.0,
        )
    }

    #[test]
    fn reaches_every_reachable_target_and_keeps_lengths() {
        let mut r = Mulberry32::new(1);
        for _ in 0..2000 {
            let a = rv(&mut r);
            let b = a + rv(&mut r).normalize() * (0.2 + r.next_f64());
            let c = b + rv(&mut r).normalize() * (0.2 + r.next_f64());
            let l1 = (b - a).length();
            let l2 = (c - b).length();
            let dist = (l1 - l2).abs() + 0.01 + r.next_f64() * (l1 + l2 - (l1 - l2).abs() - 0.02);
            let t = a + rv(&mut r).normalize() * dist;
            let s = two_bone(a, b, c, t, rv(&mut r), 0.0);
            assert!(s.reached);
            assert!((s.end - t).length() < 1e-9, "miss {}", (s.end - t).length());
            assert!(((s.mid - a).length() - l1).abs() < 1e-9);
            assert!(((s.end - s.mid).length() - l2).abs() < 1e-9);
            // the deltas carry the bones onto the solved joints
            let mid = a + s.upper.rotate(b - a);
            let end = mid + s.lower.mul(s.upper).rotate(c - b);
            assert!((mid - s.mid).length() < 1e-9 && (end - s.end).length() < 1e-8);
        }
    }

    #[test]
    fn out_of_reach_points_at_target() {
        let s = two_bone(
            Vec3::ZERO,
            Vec3::new(0.0, -0.5, 0.0),
            Vec3::new(0.0, -1.0, 0.0),
            Vec3::new(3.0, 0.0, 0.0),
            Vec3::Z,
            0.0,
        );
        assert!(!s.reached);
        assert!((s.end - Vec3::new(1.0, 0.0, 0.0)).length() < 1e-6);
    }

    #[test]
    fn bends_toward_pole() {
        let s = two_bone(
            Vec3::ZERO,
            Vec3::new(0.0, -0.5, 0.01),
            Vec3::new(0.0, -1.0, 0.0),
            Vec3::new(0.0, -0.8, 0.0),
            Vec3::Z,
            0.0,
        );
        assert!(s.mid.z > 0.2);
        let s = two_bone(
            Vec3::ZERO,
            Vec3::new(0.0, -0.5, 0.01),
            Vec3::new(0.0, -1.0, 0.0),
            Vec3::new(0.0, -0.8, 0.0),
            -Vec3::Z,
            0.0,
        );
        assert!(s.mid.z < -0.2);
    }
}
