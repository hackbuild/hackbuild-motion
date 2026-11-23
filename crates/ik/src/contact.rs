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
    /// contact value in 0 to 1.
    pub fn update(&mut self, dt: f64, target: Vec3, contact: f64) -> Vec3 {
        let mut out = target;
        if contact > self.threshold {
            let l = *self.lock.get_or_insert(target);
            self.offset = None;
            out = l;
        } else if let Some(l) = self.lock.take() {
            self.offset = Some((l - target, 0.0));
        }
        if let Some((off, t)) = self.offset {
            let t = t + dt;
            let k = libm::exp(-t / self.release.max(1e-6));
            out += off * k;
            self.offset = if k < 0.02 { None } else { Some((off, t)) };
        }
        out
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
}
