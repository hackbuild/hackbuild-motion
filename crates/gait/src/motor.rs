//! One motor state that every motor source fills, so diagnostics and
//! downstream layers (ears bouncing with the stride, footprints, sounds)
//! read the body that is actually moving, whichever source drives it.
//! A source that has no oscillator (a neural network, a clip, a motion
//! matcher) gets its phase from touchdown to touchdown timing through
//! [`PhaseEstimator`].

use alloc::vec::Vec;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MotorSource {
    Procedural,
    Neural,
    MotionMatch,
    Clip,
    Other,
}

impl MotorSource {
    pub fn name(self) -> &'static str {
        match self {
            MotorSource::Procedural => "procedural",
            MotorSource::Neural => "neural",
            MotorSource::MotionMatch => "motion-match",
            MotorSource::Clip => "clip",
            MotorSource::Other => "other",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct MotorState {
    /// Which source drives the body this frame.
    pub source: MotorSource,
    /// Stride phase of the reference leg, 0 to 1, 0 at its touchdown.
    pub phase: f64,
    /// Share of the stride a foot is down.
    pub duty: f64,
    /// Strides per second.
    pub stride_frequency: f64,
    /// Foot contact per leg.
    pub contacts: Vec<bool>,
}

/// Phase, duty and stride frequency from contacts alone: the period is the
/// time between two touchdowns of the reference leg, the phase the time
/// since the last one over that period, the duty the mean stance share of
/// every leg over the last full stride.
#[derive(Clone, Debug)]
pub struct PhaseEstimator {
    pub reference: usize,
    time: f64,
    last_touchdown: Option<f64>,
    period: Option<f64>,
    prev: Vec<bool>,
    stance: Vec<f64>,
    duty: f64,
}

impl PhaseEstimator {
    pub fn new(legs: usize, reference: usize) -> Self {
        PhaseEstimator {
            reference,
            time: 0.0,
            last_touchdown: None,
            period: None,
            prev: alloc::vec![false; legs],
            stance: alloc::vec![0.0; legs],
            duty: 0.0,
        }
    }

    pub fn update(&mut self, dt: f64, contacts: &[bool], source: MotorSource) -> MotorState {
        self.time += dt;
        for (i, c) in contacts.iter().enumerate().take(self.stance.len()) {
            if *c {
                self.stance[i] += dt;
            }
        }
        let r = self.reference;
        let down = contacts.get(r).copied().unwrap_or(false);
        let was = self.prev.get(r).copied().unwrap_or(false);
        if down && !was {
            if let Some(t0) = self.last_touchdown {
                let p = self.time - t0;
                if p > 0.05 {
                    self.period = Some(p);
                    let n = self.stance.len().max(1) as f64;
                    self.duty = (self.stance.iter().sum::<f64>() / n / p).clamp(0.0, 1.0);
                }
            }
            self.last_touchdown = Some(self.time);
            self.stance.iter_mut().for_each(|s| *s = 0.0);
        }
        self.prev.clear();
        self.prev.extend_from_slice(contacts);
        let (phase, freq) = match (self.last_touchdown, self.period) {
            (Some(t0), Some(p)) => (((self.time - t0) / p).min(0.999), 1.0 / p),
            _ => (0.0, 0.0),
        };
        MotorState {
            source,
            phase,
            duty: self.duty,
            stride_frequency: freq,
            contacts: contacts.to_vec(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gait::{BodyMotion, Gait};
    use crate::golden::dog_legs;
    use organic::Mulberry32;

    #[test]
    fn contacts_alone_recover_the_oscillator_state() {
        let mut g = Gait::quadruped(dog_legs(), 0.42);
        let mut r = Mulberry32::new(9);
        let mut est = PhaseEstimator::new(4, 0);
        let dt = 1.0 / 120.0;
        let mut body = BodyMotion {
            v: 1.6,
            ..Default::default()
        };
        let mut worst_phase: f64 = 0.0;
        let mut last = None;
        for k in 0..1200 {
            body.z += body.v * dt;
            g.update(dt, body, &mut r);
            let contacts: Vec<bool> = g.feet.iter().map(|f| f.stance).collect();
            let m = est.update(dt, &contacts, MotorSource::Neural);
            if k > 480 {
                let d = organic::math::wrap_half(m.phase - g.feet[0].phase);
                worst_phase = worst_phase.max(d.abs());
            }
            last = Some(m);
        }
        let m = last.unwrap();
        assert_eq!(m.source.name(), "neural");
        assert!(
            (m.stride_frequency - g.freq).abs() / g.freq < 0.03,
            "{} vs {}",
            m.stride_frequency,
            g.freq
        );
        assert!((m.duty - g.duty).abs() < 0.06, "{} vs {}", m.duty, g.duty);
        assert!(worst_phase < 0.05, "{worst_phase}");
    }
}
