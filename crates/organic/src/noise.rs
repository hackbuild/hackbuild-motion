//! Ornstein Uhlenbeck noise with the exact discrete update, and pink like
//! drift from summed OU octaves. Both are frame rate independent.

use crate::rng::Rng;
use crate::sample::gauss;
use alloc::vec::Vec;

#[derive(Clone, Debug)]
pub struct Ou {
    pub tau: f64,
    pub sigma: f64,
    pub mu: f64,
    pub x: f64,
}

impl Ou {
    /// Starts at the mean.
    pub fn new(tau: f64, sigma: f64, mu: f64) -> Self {
        Ou {
            tau,
            sigma,
            mu,
            x: mu,
        }
    }
    /// Starts at a random point of the stationary spread, halved.
    pub fn with_rng<R: Rng + ?Sized>(tau: f64, sigma: f64, mu: f64, rng: &mut R) -> Self {
        Ou {
            tau,
            sigma,
            mu,
            x: mu + sigma * gauss(rng) * 0.5,
        }
    }
    pub fn step<R: Rng + ?Sized>(&mut self, dt: f64, rng: &mut R) -> f64 {
        let e = libm::exp(-dt / self.tau.max(1e-9));
        self.x =
            self.mu + (self.x - self.mu) * e + self.sigma * libm::sqrt(1.0 - e * e) * gauss(rng);
        self.x
    }
}

/// Summed OU octaves with time constants `tau0 * 2^k`: an approximately 1/f
/// drift with no visible period and unit variance.
#[derive(Clone, Debug)]
pub struct Pink {
    pub octaves: Vec<Ou>,
    pub x: f64,
}

impl Pink {
    pub fn new<R: Rng + ?Sized>(tau0: f64, octaves: usize, rng: &mut R) -> Self {
        let n = octaves.max(1);
        let s = 1.0 / libm::sqrt(n as f64);
        let mut o = Vec::with_capacity(n);
        let mut tau = tau0;
        for _ in 0..n {
            o.push(Ou::with_rng(tau, s, 0.0, rng));
            tau *= 2.0;
        }
        Pink { octaves: o, x: 0.0 }
    }
    pub fn step<R: Rng + ?Sized>(&mut self, dt: f64, rng: &mut R) -> f64 {
        let mut s = 0.0;
        for o in self.octaves.iter_mut() {
            s += o.step(dt, rng);
        }
        self.x = s;
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::Mulberry32;

    #[test]
    fn ou_stationary_variance() {
        let mut r = Mulberry32::new(12);
        let mut o = Ou::new(0.5, 2.0, 1.0);
        let mut acc = 0.0;
        let mut acc2 = 0.0;
        let n = 200_000;
        for _ in 0..n {
            let x = o.step(0.05, &mut r);
            acc += x;
            acc2 += (x - 1.0) * (x - 1.0);
        }
        assert!((acc / n as f64 - 1.0).abs() < 0.1);
        assert!((acc2 / n as f64 - 4.0).abs() < 0.3);
    }

    #[test]
    fn pink_unit_variance() {
        let mut r = Mulberry32::new(13);
        let mut p = Pink::new(0.05, 4, &mut r);
        let n = 200_000;
        let v = (0..n).map(|_| p.step(0.05, &mut r).powi(2)).sum::<f64>() / n as f64;
        assert!((v - 1.0).abs() < 0.15, "{v}");
    }
}
