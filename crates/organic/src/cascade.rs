//! Target approximation smoothing: a cascade of `order` identical first
//! order lags, H(s) = 1 / (1 + tau s)^N, stepped in closed form.
//!
//! Ported from bellows-voice `src/dsp/cascade.ts` (MIT, by the same owner
//! as this repository), which implements the target approximation model
//! Birkholz fitted to measured articulator movements (Birkholz, Kroger and
//! Neuschaefer-Rube 2011, IEEE TASLP 19(5); Birkholz and Hoole 2012,
//! Interspeech). At order 6 a move from rest is bell shaped: its velocity
//! peaks at 0.42 of the 98 percent time with 38 percent of the way done,
//! where a critically damped spring (order 2) peaks at 0.17 (computed in
//! the source's header).
//!
//! Each stage follows the one before it, x_k' = (x_{k-1} - x_k) / tau, with
//! x_0 the target. With the target held over a step h, the errors
//! e_k = x_k - target evolve exactly as
//!
//!   e_k(h) = exp(-r) sum_{j=1..k} e_j(0) r^(k-j) / (k-j)!,   r = h / tau
//!
//! so a step is N (N + 1) / 2 multiply adds with coefficients computed once
//! per rate, exact at any step rate and stable for any r. From rest the
//! remaining fraction after t is the gamma tail exp(-u) sum_{k<N} u^k / k!,
//! u = t / tau, which reaches 2 percent at u = 12.03 for N = 6 (computed by
//! `settle`), so `set_time(s)` sets tau = s / 12.03.
//!
//! `place` moves the output stage alone, leaving the motion still on its
//! way in the stages before it: a channel held against a contact keeps
//! that motion and leaves the contact already accelerating.

use alloc::vec;
use alloc::vec::Vec;

/// The default order, VocalTractLab's.
pub const CASCADE_ORDER: usize = 6;

const VALUE_LIMIT: f64 = 1e15;
const MIN_RATE: f64 = 1e-3;
const MAX_RATE: f64 = 1e9;
const SETTLED: f64 = 1e-30;

/// `u` at which the gamma tail exp(-u) sum_{k<n} u^k / k! falls to `1 - fraction`.
pub fn settle(order: usize, fraction: f64) -> f64 {
    let tail = |u: f64| {
        let mut term = 1.0;
        let mut sum = 1.0;
        for k in 1..order {
            term *= u / k as f64;
            sum += term;
        }
        libm::exp(-u) * sum
    };
    let mut lo = 0.0;
    let mut hi = 10.0 * order as f64 + 50.0;
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if tail(mid) > 1.0 - fraction {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}

fn clamp(x: f64, lo: f64, hi: f64) -> f64 {
    if x < lo {
        lo
    } else if x > hi {
        hi
    } else {
        x
    }
}

/// Many channels of target approximation, stepped at a fixed rate.
#[derive(Clone, Debug)]
pub struct CascadeBank {
    channels: usize,
    order: usize,
    h: f64,
    settle98: f64,
    /// Outputs (the last stage), one per channel.
    pub values: Vec<f64>,
    x: Vec<f64>,
    goal: Vec<f64>,
    rate: Vec<f64>,
    c: Vec<f64>,
}

impl CascadeBank {
    /// `channels` from 1, `step_rate_hz` within 1e-3 to 1e9, `order` 1 to 12
    /// (all clamped). Every channel starts at 0 with a 100 ms 98 percent time.
    pub fn new(channels: usize, step_rate_hz: f64, order: usize) -> Self {
        let channels = channels.max(1);
        let order = order.clamp(1, 12);
        let rate_hz = if step_rate_hz.is_finite() {
            clamp(step_rate_hz, 1e-3, 1e9)
        } else {
            60.0
        };
        let settle98 = settle(order, 0.98);
        let mut b = CascadeBank {
            channels,
            order,
            h: 1.0 / rate_hz,
            settle98,
            values: vec![0.0; channels],
            x: vec![0.0; channels * order],
            goal: vec![0.0; channels],
            rate: vec![0.0; channels],
            c: vec![0.0; channels * order],
        };
        for i in 0..channels {
            b.set_rate(i, settle98 / 0.1);
        }
        b
    }

    pub fn channels(&self) -> usize {
        self.channels
    }

    pub fn order(&self) -> usize {
        self.order
    }

    /// 1 / tau for channel `i`, clamped to 1e-3 to 1e9 per second.
    pub fn set_rate(&mut self, i: usize, per_second: f64) {
        if i >= self.channels || !per_second.is_finite() {
            return;
        }
        let q = clamp(per_second, MIN_RATE, MAX_RATE);
        if q == self.rate[i] {
            return;
        }
        self.rate[i] = q;
        self.coefficients(i);
    }

    /// The 98 percent time from rest for channel `i`, seconds (0 arrives on the next step).
    pub fn set_time(&mut self, i: usize, seconds: f64) {
        if !seconds.is_finite() {
            return;
        }
        let t = seconds.max(0.0);
        let r = if t > 0.0 { self.settle98 / t } else { MAX_RATE };
        self.set_rate(i, r);
    }

    pub fn set_target(&mut self, i: usize, target: f64) {
        if i < self.channels && target.is_finite() {
            self.goal[i] = clamp(target, -VALUE_LIMIT, VALUE_LIMIT);
        }
    }

    /// Every stage and the target of channel `i` to `value`: at rest there.
    pub fn snap(&mut self, i: usize, value: f64) {
        if i >= self.channels || !value.is_finite() {
            return;
        }
        let v = clamp(value, -VALUE_LIMIT, VALUE_LIMIT);
        self.goal[i] = v;
        self.values[i] = v;
        let n = self.order;
        for k in 0..n {
            self.x[i * n + k] = v;
        }
    }

    /// Moves channel `i`'s output stage to `value`, leaving the stages before it (a contact).
    pub fn place(&mut self, i: usize, value: f64) {
        if i >= self.channels || !value.is_finite() {
            return;
        }
        let v = clamp(value, -VALUE_LIMIT, VALUE_LIMIT);
        self.x[i * self.order + self.order - 1] = v;
        self.values[i] = v;
    }

    /// The output's velocity, units per second.
    pub fn velocity(&self, i: usize) -> f64 {
        let n = self.order;
        let b = i * n + n - 1;
        if n > 1 {
            (self.x[b - 1] - self.x[b]) * self.rate[i]
        } else {
            (self.goal[i] - self.x[b]) * self.rate[i]
        }
    }

    /// Stage `k` (0 first, `order - 1` the output) of channel `i`.
    pub fn stage(&self, i: usize, k: usize) -> f64 {
        self.x[i * self.order + k]
    }

    pub fn target(&self, i: usize) -> f64 {
        self.goal[i]
    }

    /// Every channel's target, from a slice as long as the bank or shorter.
    pub fn set_targets(&mut self, targets: &[f64]) {
        for (i, &t) in targets.iter().enumerate().take(self.channels) {
            self.set_target(i, t);
        }
    }

    /// Advances every channel one step.
    pub fn step(&mut self) {
        let n = self.order;
        for i in 0..self.channels {
            let base = i * n;
            let g = self.goal[i];
            let mut big: f64 = 0.0;
            // in place from the last stage down: stage k needs the old stages 0 to k
            for k in (0..n).rev() {
                let mut s = 0.0;
                for j in 0..=k {
                    s += self.c[base + k - j] * (self.x[base + j] - g);
                }
                self.x[base + k] = g + s;
                big = big.max(s.abs());
            }
            if big < SETTLED {
                for k in 0..n {
                    self.x[base + k] = g;
                }
            }
            self.values[i] = self.x[base + n - 1];
        }
    }

    fn coefficients(&mut self, i: usize) {
        let n = self.order;
        let r = self.h * self.rate[i];
        let mut term = libm::exp(-r);
        for m in 0..n {
            self.c[i * n + m] = term;
            term *= r / (m + 1) as f64;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settles_at_the_published_constant() {
        assert!((settle(6, 0.98) - 12.03).abs() < 0.01);
        assert!((settle(2, 0.98) - 5.83).abs() < 0.01);
    }

    #[test]
    fn reaches_98_percent_at_the_set_time() {
        let rate = 1000.0;
        let mut b = CascadeBank::new(1, rate, CASCADE_ORDER);
        b.set_time(0, 0.2);
        b.set_target(0, 1.0);
        for _ in 0..199 {
            b.step();
        }
        assert!(b.values[0] < 0.98);
        b.step();
        assert!((b.values[0] - 0.98).abs() < 2e-3);
    }

    #[test]
    fn same_curve_at_any_step_rate() {
        let mut a = CascadeBank::new(1, 100.0, 6);
        let mut b = CascadeBank::new(1, 1000.0, 6);
        a.set_time(0, 0.15);
        b.set_time(0, 0.15);
        a.set_target(0, 2.0);
        b.set_target(0, 2.0);
        for _ in 0..7 {
            a.step();
            for _ in 0..10 {
                b.step();
            }
        }
        assert!((a.values[0] - b.values[0]).abs() < 1e-12);
    }

    #[test]
    fn bell_shaped_velocity_peaks_near_042_of_t98() {
        let rate = 10_000.0;
        let mut b = CascadeBank::new(1, rate, 6);
        b.set_time(0, 1.0);
        b.set_target(0, 1.0);
        let (mut peak, mut at, mut done) = (0.0, 0.0, 0.0);
        for s in 1..=10_000 {
            b.step();
            let v = b.velocity(0);
            if v > peak {
                peak = v;
                at = s as f64 / rate;
                done = b.values[0];
            }
        }
        assert!((at - 0.42).abs() < 0.01, "peak at {at}");
        assert!((done - 0.38).abs() < 0.01, "done {done}");
    }

    #[test]
    fn place_keeps_the_motion_on_its_way() {
        let mut b = CascadeBank::new(1, 100.0, 6);
        b.set_target(0, 1.0);
        for _ in 0..3 {
            b.step();
        }
        let before = b.stage(0, 0);
        b.place(0, 0.0);
        assert_eq!(b.values[0], 0.0);
        assert_eq!(b.stage(0, 0), before);
        b.step();
        assert!(b.values[0] > 0.0);
    }

    #[test]
    fn snap_rests_and_ignores_bad_input() {
        let mut b = CascadeBank::new(2, 60.0, 6);
        b.snap(1, 3.0);
        b.set_target(1, f64::NAN);
        b.set_rate(1, f64::INFINITY);
        b.step();
        assert_eq!(b.values[1], 3.0);
        assert_eq!(b.velocity(1), 0.0);
        b.snap(9, 1.0);
    }
}
