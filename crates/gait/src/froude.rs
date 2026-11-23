//! Gait choice from the Froude number `Fr = v^2 / (g l)`. Dogs walk below
//! about 0.5 and trot up to about 3 (Andrada 2023). A 10 percent dead band
//! on Fr gives hysteresis so the gait does not flicker at a threshold; a
//! per animal bias decides, each time the pace band is entered, whether it
//! paces or trots there.

use organic::Rng;
use organic::math::smoothstep;

#[derive(Clone, Copy, Debug, PartialEq)]
/// Defaults from an earlier in-house dog simulator (vendor): pace 0.12, trot 0.42, canter 1.5.
pub struct FroudeThresholds {
    pub pace: f64,
    pub trot: f64,
    pub canter: f64,
}

impl Default for FroudeThresholds {
    fn default() -> Self {
        FroudeThresholds {
            pace: 0.12,
            trot: 0.42,
            canter: 1.5,
        }
    }
}

#[derive(Clone, Debug)]
pub struct FroudeSelector {
    pub thresholds: FroudeThresholds,
    /// Chance the animal paces instead of trotting in the pace band.
    pub pace_bias: f64,
    effective: f64,
    in_band: bool,
    pacing: bool,
}

impl FroudeSelector {
    pub fn new(thresholds: FroudeThresholds, pace_bias: f64) -> Self {
        FroudeSelector {
            thresholds,
            pace_bias,
            effective: 0.0,
            in_band: false,
            pacing: false,
        }
    }
    /// The Froude number after hysteresis.
    pub fn froude(&self) -> f64 {
        self.effective
    }
    /// Weights for walk, pace, trot, canter and gallop at speed `v` for a
    /// leg of length `leg` meters. They sum to one.
    pub fn update<R: Rng + ?Sized>(&mut self, v: f64, leg: f64, rng: &mut R) -> [f64; 5] {
        let fr = v * v / (9.81 * leg.max(1e-3));
        if fr > self.effective * 1.1 {
            self.effective = fr / 1.1;
        } else if fr < self.effective / 1.1 {
            self.effective = fr * 1.1;
        }
        let f = self.effective;
        let th = self.thresholds;
        if f > th.pace && !self.in_band {
            self.in_band = true;
            self.pacing = rng.next_f64() < self.pace_bias;
        } else if f < th.pace * 0.7 {
            self.in_band = false;
        }
        let band = |x: f64, t: f64| smoothstep(t * 0.85, t * 1.15, x);
        let u1 = band(f, th.pace);
        let u2 = band(f, th.trot);
        let u3 = band(f, th.canter);
        let u4 = band(f, th.canter * 2.6);
        let mid = u1 * (1.0 - u3);
        let pace = if self.pacing { mid * (1.0 - u2) } else { 0.0 };
        [1.0 - u1, pace, mid - pace, u3 * (1.0 - u4), u3 * u4]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use organic::Mulberry32;

    #[test]
    fn weights_sum_to_one_and_order_by_speed() {
        let mut s = FroudeSelector::new(FroudeThresholds::default(), 0.0);
        let mut r = Mulberry32::new(1);
        let mut last_dominant = 0;
        for k in 0..400 {
            let v = k as f64 * 0.02;
            let w = s.update(v, 0.4, &mut r);
            assert!((w.iter().sum::<f64>() - 1.0).abs() < 1e-12);
            let dom = (0..5)
                .max_by(|a, b| w[*a].partial_cmp(&w[*b]).unwrap())
                .unwrap();
            assert!(
                dom >= last_dominant,
                "gait went down while speeding up at v {v}"
            );
            last_dominant = dom;
        }
        assert_eq!(last_dominant, 4);
    }

    #[test]
    fn hysteresis_holds_near_threshold() {
        let mut s = FroudeSelector::new(FroudeThresholds::default(), 0.0);
        let mut r = Mulberry32::new(2);
        // speed at the trot threshold, wobbling by 4 percent: Fr barely moves
        let v0 = libm::sqrt(0.42 * 9.81 * 0.4);
        let mut fr = alloc::vec::Vec::new();
        for k in 0..200 {
            let v = v0 * (1.0 + 0.02 * if k % 2 == 0 { 1.0 } else { -1.0 });
            s.update(v, 0.4, &mut r);
            fr.push(s.froude());
        }
        let tail = &fr[10..];
        let spread = tail.iter().cloned().fold(f64::MIN, f64::max)
            - tail.iter().cloned().fold(f64::MAX, f64::min);
        assert!(spread < 1e-12, "{spread}");
    }
}
