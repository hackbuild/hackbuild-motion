//! Time curves for hand authored motion.

/// Minimum jerk profile on `t` in 0 to 1 (Flash and Hogan): zero velocity
/// and acceleration at both ends.
pub fn minimum_jerk(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    t * t * t * (10.0 - 15.0 * t + 6.0 * t * t)
}

/// Piecewise minimum jerk through `(time, value)` keys sorted by time. Holds
/// the first value before the first key and the last after the last.
pub fn keyed(t: f64, keys: &[(f64, f64)]) -> f64 {
    let Some(first) = keys.first() else {
        return 0.0;
    };
    if t <= first.0 {
        return first.1;
    }
    for w in keys.windows(2) {
        let (t0, a) = w[0];
        let (t1, b) = w[1];
        if t <= t1 {
            return a + (b - a) * minimum_jerk((t - t0) / (t1 - t0).max(1e-3));
        }
    }
    keys[keys.len() - 1].1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ends_and_middle() {
        assert_eq!(minimum_jerk(0.0), 0.0);
        assert_eq!(minimum_jerk(1.0), 1.0);
        assert!((minimum_jerk(0.5) - 0.5).abs() < 1e-12);
    }

    #[test]
    fn keyed_holds_and_hits_keys() {
        let k = [(0.0, 1.0), (1.0, 3.0), (2.0, -1.0)];
        assert_eq!(keyed(-1.0, &k), 1.0);
        assert!((keyed(1.0, &k) - 3.0).abs() < 1e-12);
        assert_eq!(keyed(5.0, &k), -1.0);
    }
}
