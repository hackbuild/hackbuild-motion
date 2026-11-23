//! Samplers for latencies, step lengths, turn angles and event gaps. Every
//! function takes the random source as an argument; none keeps hidden state.

use crate::rng::Rng;
use core::f64::consts::PI;

/// Uniform in `(0, 1)`, never exactly zero.
fn open01<R: Rng + ?Sized>(rng: &mut R) -> f64 {
    loop {
        let u = rng.next_f64();
        if u > 0.0 {
            return u;
        }
    }
}

/// Standard normal by the Box Muller transform (two draws per call).
pub fn gauss<R: Rng + ?Sized>(rng: &mut R) -> f64 {
    let u = open01(rng);
    let v = open01(rng);
    libm::sqrt(-2.0 * libm::log(u)) * libm::cos(2.0 * PI * v)
}

/// Ex-Gaussian: Normal(mu, sigma) plus Exponential(tau); mean `mu + tau`.
/// The usual model of human and animal reaction times.
pub fn ex_gaussian<R: Rng + ?Sized>(mu: f64, sigma: f64, tau: f64, rng: &mut R) -> f64 {
    let g = gauss(rng);
    let u = rng.next_f64();
    mu + sigma * g - tau * libm::log(1.0 - u)
}

/// Truncated power law step length with exponent `mu` in `(1, 3]`, between
/// `min` and `max` (Levy flight steps).
pub fn truncated_power_law<R: Rng + ?Sized>(min: f64, mu: f64, max: f64, rng: &mut R) -> f64 {
    let u = rng.next_f64();
    let x = min * libm::pow(1.0 - u, -1.0 / (mu - 1.0));
    if x > max { max } else { x }
}

/// Von Mises angle around zero with concentration `kappa` (Best and Fisher
/// 1979). `kappa` near zero gives a uniform angle.
pub fn von_mises<R: Rng + ?Sized>(kappa: f64, rng: &mut R) -> f64 {
    if kappa < 1e-6 {
        return (rng.next_f64() * 2.0 - 1.0) * PI;
    }
    let a = 1.0 + libm::sqrt(1.0 + 4.0 * kappa * kappa);
    let b = (a - libm::sqrt(2.0 * a)) / (2.0 * kappa);
    let r = (1.0 + b * b) / (2.0 * b);
    loop {
        let z = libm::cos(PI * rng.next_f64());
        let f = (1.0 + r * z) / (r + z);
        let c = kappa * (r - f);
        let u = open01(rng);
        if c * (2.0 - c) - u > 0.0 || libm::log(c / u) + 1.0 - c >= 0.0 {
            let sign = if rng.next_f64() < 0.5 { -1.0 } else { 1.0 };
            return sign * libm::acos(f.clamp(-1.0, 1.0));
        }
    }
}

/// Seconds until the next event of a Poisson process with `rate` per second.
pub fn poisson_gap<R: Rng + ?Sized>(rate: f64, rng: &mut R) -> f64 {
    -libm::log(1.0 - rng.next_f64()) / rate.max(1e-12)
}

/// Whether an event of a Poisson process with `rate` per second falls in a
/// step of `dt` seconds. Exact for any `dt`, unlike `u < rate * dt`.
pub fn event_in_step<R: Rng + ?Sized>(rate: f64, dt: f64, rng: &mut R) -> bool {
    rng.next_f64() < 1.0 - libm::exp(-rate.max(0.0) * dt)
}

/// Gamma(k, theta) by Marsaglia and Tsang, with the `k < 1` boost.
pub fn gamma<R: Rng + ?Sized>(k: f64, theta: f64, rng: &mut R) -> f64 {
    if k < 1.0 {
        let g = gamma(k + 1.0, theta, rng);
        return g * libm::pow(open01(rng), 1.0 / k);
    }
    let d = k - 1.0 / 3.0;
    let c = 1.0 / libm::sqrt(9.0 * d);
    loop {
        let mut x;
        let mut v;
        loop {
            x = gauss(rng);
            v = 1.0 + c * x;
            if v > 0.0 {
                break;
            }
        }
        v = v * v * v;
        let u = open01(rng);
        if u < 1.0 - 0.0331 * x * x * x * x
            || libm::log(u) < 0.5 * x * x + d * (1.0 - v + libm::log(v))
        {
            return d * v * theta;
        }
    }
}

/// Log normal with the given median and log space sigma.
pub fn log_normal<R: Rng + ?Sized>(median: f64, sigma: f64, rng: &mut R) -> f64 {
    libm::exp(libm::log(median) + sigma * gauss(rng))
}

/// Index drawn with probability proportional to `weights`.
pub fn weighted_index<R: Rng + ?Sized>(weights: &[f64], rng: &mut R) -> usize {
    let total: f64 = weights.iter().map(|w| w.max(0.0)).sum();
    if total <= 0.0 || weights.is_empty() {
        return 0;
    }
    let mut r = rng.next_f64() * total;
    for (i, w) in weights.iter().enumerate() {
        r -= w.max(0.0);
        if r < 0.0 {
            return i;
        }
    }
    weights.len() - 1
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::Mulberry32;

    fn mean(n: usize, mut f: impl FnMut() -> f64) -> f64 {
        (0..n).map(|_| f()).sum::<f64>() / n as f64
    }

    #[test]
    fn gauss_moments() {
        let mut r = Mulberry32::new(3);
        let m = mean(40_000, || gauss(&mut r));
        let mut r = Mulberry32::new(4);
        let v = mean(40_000, || {
            let g = gauss(&mut r);
            g * g
        });
        assert!(m.abs() < 0.02 && (v - 1.0).abs() < 0.03, "{m} {v}");
    }

    #[test]
    fn ex_gaussian_mean() {
        let mut r = Mulberry32::new(5);
        let m = mean(40_000, || ex_gaussian(0.3, 0.05, 0.2, &mut r));
        assert!((m - 0.5).abs() < 0.01, "{m}");
    }

    #[test]
    fn gamma_mean() {
        for k in [0.5, 2.0, 7.0] {
            let mut r = Mulberry32::new(6);
            let m = mean(40_000, || gamma(k, 1.5, &mut r));
            assert!(
                (m - k * 1.5).abs() < 0.05 * k * 1.5 + 0.02,
                "k {k} mean {m}"
            );
        }
    }

    #[test]
    fn poisson_gap_mean() {
        let mut r = Mulberry32::new(8);
        let m = mean(40_000, || poisson_gap(4.0, &mut r));
        assert!((m - 0.25).abs() < 0.01, "{m}");
    }

    #[test]
    fn von_mises_range_and_concentration() {
        let mut r = Mulberry32::new(9);
        let m = mean(20_000, || libm::cos(von_mises(4.0, &mut r)));
        // E[cos] = I1(4) / I0(4) = 0.8635 (computed)
        assert!((m - 0.8635).abs() < 0.01, "{m}");
    }

    #[test]
    fn power_law_bounds() {
        let mut r = Mulberry32::new(10);
        for _ in 0..10_000 {
            let x = truncated_power_law(0.2, 2.0, 5.0, &mut r);
            assert!((0.2..=5.0).contains(&x));
        }
    }

    #[test]
    fn event_rate_is_step_independent() {
        for dt in [1.0 / 30.0, 1.0 / 144.0] {
            let mut r = Mulberry32::new(11);
            let steps = (200.0 / dt) as usize;
            let n = (0..steps)
                .filter(|_| event_in_step(2.0, dt, &mut r))
                .count();
            let rate = n as f64 / 200.0;
            assert!(
                (rate - 2.0).abs() < 0.15 * 2.0 * dt * 60.0 + 0.1,
                "dt {dt} rate {rate}"
            );
        }
    }
}
