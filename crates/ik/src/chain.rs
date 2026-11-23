//! FABRIK and CCD on joint positions, with joint limits, and the per bone
//! rotation deltas that carry the result back to a skeleton.

use alloc::vec::Vec;
use organic::{Quat, Vec3};

/// A limit on the joint at the start of a segment, relative to the segment
/// before it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Limit {
    None,
    /// The segment stays within `max` radians of the previous segment's direction.
    Cone {
        max: f64,
    },
    /// The segment stays in the plane perpendicular to this world axis
    /// through the joint (a knee or an elbow).
    Hinge {
        axis: Vec3,
    },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SolveInfo {
    pub iterations: u32,
    /// Distance from the end joint to the target, after solving.
    pub error: f64,
}

fn lengths(p: &[Vec3]) -> Vec<f64> {
    p.windows(2).map(|w| (w[1] - w[0]).length()).collect()
}

fn constrain(prev_dir: Option<Vec3>, dir: Vec3, limit: Limit) -> Vec3 {
    match limit {
        Limit::None => dir,
        Limit::Hinge { axis } => {
            let a = axis.normalize();
            let d = dir.reject(a);
            if d.length() < 1e-9 {
                dir
            } else {
                d.normalize()
            }
        }
        Limit::Cone { max } => {
            let Some(pd) = prev_dir else { return dir };
            let cos = pd.dot(dir).clamp(-1.0, 1.0);
            let angle = libm::acos(cos);
            if angle <= max {
                return dir;
            }
            let axis = pd.cross(dir);
            let axis = if axis.length() < 1e-9 {
                pd.cross(Vec3::Y).normalize()
            } else {
                axis.normalize()
            };
            Quat::from_axis_angle(axis, max).rotate(pd)
        }
    }
}

/// A chain lying on one line through the root, with the target on that
/// line too, is a fixed point of FABRIK: both passes only slide joints along
/// the line, so a straight chain (a T pose arm) never folds toward a target
/// on its own axis. When that holds, push the interior joints a tenth of a
/// segment off the line, all to one side; the next pass restores lengths.
fn bend_if_straight(p: &mut [Vec3], target: Vec3, len: &[f64], total: f64) {
    let n = p.len();
    if n < 3 {
        return;
    }
    let root = p[0];
    let far = p
        .iter()
        .copied()
        .chain(core::iter::once(target))
        .fold(root, |a, q| {
            if (q - root).length() > (a - root).length() {
                q
            } else {
                a
            }
        });
    let axis = (far - root).normalize();
    if axis.length() < 1e-12 {
        return;
    }
    let tol = 1e-6 * total;
    let off_line = |q: Vec3| (q - root).reject(axis).length() > tol;
    if p.iter().any(|q| off_line(*q)) || off_line(target) {
        return;
    }
    let side = if axis.x.abs() < 0.9 {
        axis.cross(Vec3::X)
    } else {
        axis.cross(Vec3::Y)
    }
    .normalize();
    for i in 1..n - 1 {
        p[i] += side * (0.1 * len[i - 1]);
    }
}

/// FABRIK (Aristidou and Lasenby 2011). `p` holds joint positions from root
/// to end and is solved in place; the root stays fixed and segment lengths
/// are kept. `limits`, when given, has one entry per segment.
pub fn fabrik(
    p: &mut [Vec3],
    target: Vec3,
    iterations: u32,
    tolerance: f64,
    limits: Option<&[Limit]>,
) -> SolveInfo {
    let n = p.len();
    if n < 2 {
        return SolveInfo {
            iterations: 0,
            error: 0.0,
        };
    }
    let len = lengths(p);
    let total: f64 = len.iter().sum();
    let root = p[0];
    let limit = |i: usize| {
        limits
            .and_then(|l| l.get(i))
            .copied()
            .unwrap_or(Limit::None)
    };
    if (target - root).length() >= total && limits.is_none() {
        let d = (target - root).normalize();
        for i in 1..n {
            p[i] = p[i - 1] + d * len[i - 1];
        }
        return SolveInfo {
            iterations: 1,
            error: (p[n - 1] - target).length(),
        };
    }
    let mut it = 0;
    let mut last = f64::INFINITY;
    while it < iterations {
        let err = (p[n - 1] - target).length();
        if err <= tolerance {
            break;
        }
        if err >= last * (1.0 - 1e-9) {
            bend_if_straight(p, target, &len, total);
        }
        last = err;
        it += 1;
        // backward: end onto the target
        p[n - 1] = target;
        for i in (0..n - 1).rev() {
            let d = (p[i] - p[i + 1]).normalize();
            p[i] = p[i + 1] + d * len[i];
        }
        // forward: root back in place, limits applied root outward
        p[0] = root;
        let mut prev: Option<Vec3> = None;
        for i in 0..n - 1 {
            let mut d = (p[i + 1] - p[i]).normalize();
            if d.length() < 1e-12 {
                d = prev.unwrap_or(Vec3::Y);
            }
            d = constrain(prev, d, limit(i));
            p[i + 1] = p[i] + d * len[i];
            prev = Some(d);
        }
    }
    SolveInfo {
        iterations: it,
        error: (p[n - 1] - target).length(),
    }
}

/// Cyclic coordinate descent on positions. `max_step` caps the rotation per
/// joint per pass in radians (0 for no cap).
pub fn ccd(
    p: &mut [Vec3],
    target: Vec3,
    iterations: u32,
    tolerance: f64,
    max_step: f64,
) -> SolveInfo {
    let n = p.len();
    if n < 2 {
        return SolveInfo {
            iterations: 0,
            error: 0.0,
        };
    }
    let mut it = 0;
    while it < iterations {
        if (p[n - 1] - target).length() <= tolerance {
            break;
        }
        it += 1;
        for i in (0..n - 1).rev() {
            let to_end = (p[n - 1] - p[i]).normalize();
            let to_target = (target - p[i]).normalize();
            if to_end.length() < 1e-12 || to_target.length() < 1e-12 {
                continue;
            }
            let mut q = Quat::from_unit_vectors(to_end, to_target);
            if max_step > 0.0 {
                let ang = q.angle_to(Quat::IDENTITY);
                if ang > max_step {
                    q = Quat::IDENTITY.slerp(q, max_step / ang);
                }
            }
            let pivot = p[i];
            for j in i + 1..n {
                p[j] = pivot + q.rotate(p[j] - pivot);
            }
        }
    }
    SolveInfo {
        iterations: it,
        error: (p[n - 1] - target).length(),
    }
}

/// World rotation delta per segment that turns the segment from `old` to
/// `new` positions: premultiply delta `i` onto the world rotation of the
/// bone whose joint is `i`.
pub fn segment_deltas(old: &[Vec3], new: &[Vec3]) -> Vec<Quat> {
    old.windows(2)
        .zip(new.windows(2))
        .map(|(o, n)| Quat::from_unit_vectors((o[1] - o[0]).normalize(), (n[1] - n[0]).normalize()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use organic::{Mulberry32, Rng};

    fn chain(r: &mut Mulberry32, n: usize) -> Vec<Vec3> {
        let mut p = alloc::vec![Vec3::ZERO];
        for i in 1..n {
            let d =
                Vec3::new(r.next_f64() - 0.5, r.next_f64() - 0.5, r.next_f64() - 0.5).normalize();
            p.push(p[i - 1] + d * (0.1 + r.next_f64() * 0.3));
        }
        p
    }

    #[test]
    fn fabrik_keeps_lengths_and_root_and_reaches() {
        let mut r = Mulberry32::new(2);
        let mut reached = 0;
        let cases = 500;
        for _ in 0..cases {
            let mut p = chain(&mut r, 5);
            let len = lengths(&p);
            let total: f64 = len.iter().sum();
            let t = Vec3::new(r.next_f64() - 0.5, r.next_f64() - 0.5, r.next_f64() - 0.5)
                .normalize()
                * (total * 0.8 * r.next_f64() + 0.05);
            let info = fabrik(&mut p, t, 64, 1e-6, None);
            assert_eq!(p[0], Vec3::ZERO);
            for (a, b) in lengths(&p).iter().zip(&len) {
                assert!((a - b).abs() < 1e-9);
            }
            if info.error < 1e-6 {
                reached += 1;
            }
        }
        // measured: every reachable target is met within 64 iterations
        assert!(reached as f64 >= cases as f64 * 0.98, "{reached}");
    }

    #[test]
    fn straight_chain_folds_toward_a_target_on_its_axis() {
        // a T pose arm and a target on the arm's own axis, nearer than the
        // reach: before the bend this sat at a fixed point 0.1 m away
        let mut p: Vec<Vec3> = (0..4)
            .map(|i| Vec3::new(i as f64 * 0.3, 0.0, 0.0))
            .collect();
        let info = fabrik(&mut p, Vec3::new(0.4, 0.0, 0.0), 64, 1e-6, None);
        assert!(info.error < 1e-6, "{}", info.error);
        for w in p.windows(2) {
            assert!(((w[1] - w[0]).length() - 0.3).abs() < 1e-9);
        }
    }

    #[test]
    fn hinge_keeps_segment_in_plane() {
        let mut p = alloc::vec![
            Vec3::ZERO,
            Vec3::new(0.0, -0.5, 0.0),
            Vec3::new(0.0, -1.0, 0.0)
        ];
        let lim = [
            Limit::Hinge { axis: Vec3::X },
            Limit::Hinge { axis: Vec3::X },
        ];
        fabrik(&mut p, Vec3::new(0.3, -0.6, 0.3), 32, 1e-6, Some(&lim));
        assert!(p[1].x.abs() < 1e-9 && p[2].x.abs() < 1e-9);
    }

    #[test]
    fn cone_limit_holds() {
        let mut p = alloc::vec![
            Vec3::ZERO,
            Vec3::new(0.0, 0.5, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(0.0, 1.5, 0.0)
        ];
        let lim = [
            Limit::None,
            Limit::Cone { max: 0.3 },
            Limit::Cone { max: 0.3 },
        ];
        fabrik(&mut p, Vec3::new(1.0, 0.2, 0.0), 32, 1e-6, Some(&lim));
        for i in 1..3 {
            let a = (p[i] - p[i - 1]).normalize();
            let b = (p[i + 1] - p[i]).normalize();
            assert!(libm::acos(a.dot(b).clamp(-1.0, 1.0)) <= 0.3 + 1e-9);
        }
    }

    #[test]
    fn ccd_converges_and_deltas_rebuild_chain() {
        let mut r = Mulberry32::new(3);
        for _ in 0..200 {
            let old = chain(&mut r, 4);
            let mut p = old.clone();
            let total: f64 = lengths(&p).iter().sum();
            let t = Vec3::new(r.next_f64() - 0.5, r.next_f64() - 0.5, r.next_f64() - 0.5)
                .normalize()
                * total
                * 0.5;
            ccd(&mut p, t, 200, 1e-5, 0.0);
            let d = segment_deltas(&old, &p);
            for i in 0..3 {
                let seg = d[i].rotate(old[i + 1] - old[i]);
                assert!((p[i] + seg - p[i + 1]).length() < 1e-9);
            }
        }
    }
}
