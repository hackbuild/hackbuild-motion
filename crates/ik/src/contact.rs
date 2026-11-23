//! Foot contact locking and the pelvis drop that keeps locked feet in reach.

use organic::Vec3;

/// Holds a foot where it landed while contact is above a threshold, and on
/// release lets the held offset decay exponentially so the foot does not
/// jump to the free target.
#[derive(Clone, Debug, PartialEq)]
pub struct ContactLock {
    pub threshold: f64,
    /// Release time constant in seconds.
    pub release: f64,
    lock: Option<Vec3>,
    offset: Option<(Vec3, f64)>,
}

impl Default for ContactLock {
    fn default() -> Self {
        ContactLock {
            threshold: 0.55,
            release: 0.06,
            lock: None,
            offset: None,
        }
    }
}

impl ContactLock {
    pub fn new(threshold: f64, release: f64) -> Self {
        ContactLock {
            threshold,
            release,
            lock: None,
            offset: None,
        }
    }
    pub fn locked(&self) -> bool {
        self.lock.is_some()
    }
    /// The foot position for this frame given the free `target` and a
    /// contact value in 0 to 1. A negative or non finite `dt` counts as 0.
    pub fn update(&mut self, dt: f64, target: Vec3, contact: f64) -> Vec3 {
        let dt = if dt.is_finite() && dt > 0.0 { dt } else { 0.0 };
        // where the foot is shown now: the target plus what is left of a release
        let shown = |s: &Self, t: f64| match s.offset {
            Some((off, _)) => target + off * s.release_weight(t),
            None => target,
        };
        if contact > self.threshold {
            // contact again during a release locks where the foot is, not on the free target
            let at = shown(self, self.offset.map_or(0.0, |o| o.1));
            let l = *self.lock.get_or_insert(at);
            self.offset = None;
            return l;
        }
        if let Some(l) = self.lock.take() {
            self.offset = Some((l - target, 0.0));
        }
        let Some((off, t)) = self.offset else {
            return target;
        };
        let t = t + dt;
        let k = self.release_weight(t);
        self.offset = if k > 0.0 { Some((off, t)) } else { None };
        target + off * k
    }

    /// Share of the held offset left `t` seconds into a release: exp(-t /
    /// release), shifted and scaled so it reaches exactly 0 where exp
    /// falls to 0.02 and the foot arrives without a step.
    fn release_weight(&self, t: f64) -> f64 {
        const END: f64 = 0.02;
        let e = libm::exp(-t / self.release.max(1e-6));
        ((e - END) / (1.0 - END)).max(0.0)
    }
}

/// How far the hip must drop along `-up` so that `foot` is within `reach`.
/// Zero when it already is; when no drop reaches, the drop that comes closest.
pub fn pelvis_drop(hip: Vec3, foot: Vec3, reach: f64, up: Vec3) -> f64 {
    let v = foot - hip;
    let c = v.length_sq() - reach * reach;
    if c <= 0.0 {
        return 0.0;
    }
    let b = v.dot(up.normalize());
    let disc = b * b - c;
    if disc < 0.0 {
        return (-b).max(0.0);
    }
    let s = -b - libm::sqrt(disc);
    if s >= 0.0 { s } else { (-b).max(0.0) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_holds_then_releases_smoothly() {
        let mut c = ContactLock::default();
        let a = c.update(1.0 / 60.0, Vec3::new(0.0, 0.0, 0.0), 1.0);
        let b = c.update(1.0 / 60.0, Vec3::new(0.1, 0.0, 0.0), 1.0);
        assert_eq!(a, b);
        let r = c.update(1.0 / 60.0, Vec3::new(0.2, 0.0, 0.0), 0.0);
        assert!(r.x > 0.0 && r.x < 0.2);
        let mut last = r;
        for _ in 0..60 {
            last = c.update(1.0 / 60.0, Vec3::new(0.2, 0.0, 0.0), 0.0);
        }
        assert!((last.x - 0.2).abs() < 1e-9);
    }

    #[test]
    fn drop_reaches() {
        let hip = Vec3::new(0.1, 0.9, 0.0);
        let foot = Vec3::new(0.1, 0.0, 0.3);
        let d = pelvis_drop(hip, foot, 0.85, Vec3::Y);
        let h = hip - Vec3::Y * d;
        assert!(((foot - h).length() - 0.85).abs() < 1e-9);
        assert_eq!(
            pelvis_drop(hip, Vec3::new(0.1, 0.2, 0.0), 0.85, Vec3::Y),
            0.0
        );
    }

    #[test]
    fn recontact_during_release_holds_the_current_foot() {
        let dt = 1.0 / 60.0;
        let mut c = ContactLock::default();
        c.update(dt, Vec3::ZERO, 1.0);
        c.update(dt, Vec3::new(0.3, 0.0, 0.0), 0.0);
        let last = c.update(dt, Vec3::new(0.3, 0.0, 0.0), 0.0);
        // contact again while the offset still decays: no jump to the free target
        let held = c.update(dt, Vec3::new(0.3, 0.0, 0.0), 1.0);
        assert!(
            (held - last).length() < 0.06,
            "jumped {} m",
            (held - last).length()
        );
        let again = c.update(dt, Vec3::new(0.35, 0.0, 0.0), 1.0);
        assert_eq!(held, again);
    }

    #[test]
    fn negative_dt_does_not_move_the_foot_past_the_target() {
        let mut c = ContactLock::default();
        c.update(1.0 / 60.0, Vec3::ZERO, 1.0);
        let a = c.update(-0.1, Vec3::new(0.2, 0.0, 0.0), 0.0);
        assert!(a.x >= 0.0 && a.x <= 0.2, "{}", a.x);
        let b = c.update(f64::NAN, Vec3::new(0.2, 0.0, 0.0), 0.0);
        assert!(b.x.is_finite() && b.x >= 0.0 && b.x <= 0.2, "{}", b.x);
    }

    #[test]
    fn release_ends_without_a_pop() {
        // every release step is no larger than the one before it, the last
        // one included (it used to drop the final 2 percent in one frame)
        let dt = 1.0 / 60.0;
        let mut c = ContactLock::default();
        c.update(dt, Vec3::ZERO, 1.0);
        let target = Vec3::new(1.0, 0.0, 0.0);
        let mut prev = c.update(dt, target, 0.0);
        let mut last_step = f64::INFINITY;
        for k in 0..120 {
            let o = c.update(dt, target, 0.0);
            let step = (o - prev).length();
            assert!(
                step <= last_step + 1e-12,
                "frame {k}: step {step} m after {last_step} m"
            );
            last_step = step;
            prev = o;
        }
        assert_eq!(prev, target);
    }
}
