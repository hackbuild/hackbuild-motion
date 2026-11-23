//! A body clock: game time, a circadian drive and homeostatic sleep pressure
//! (the two process model of Borbely 1982, with the commonly cited time
//! constants of 18.2 h rising awake and 4.2 h falling asleep).

#[derive(Clone, Debug)]
pub struct BodyClock {
    /// Minutes since midnight of day zero.
    pub minutes: f64,
    /// Game minutes per real second.
    pub rate: f64,
    /// Sleep pressure, 0 to 1.
    pub pressure: f64,
    pub asleep: bool,
}

impl BodyClock {
    pub fn new(start_minutes: f64, rate: f64) -> Self {
        BodyClock {
            minutes: start_minutes,
            rate,
            pressure: 0.3,
            asleep: false,
        }
    }
    pub fn tick(&mut self, dt: f64) {
        let dm = dt * self.rate;
        self.minutes += dm;
        let hours = dm / 60.0;
        if self.asleep {
            self.pressure *= libm::exp(-hours / 4.2);
        } else {
            self.pressure = 1.0 - (1.0 - self.pressure) * libm::exp(-hours / 18.2);
        }
    }
    /// Hour of day, 0 to 24.
    pub fn hour(&self) -> f64 {
        let m = self.minutes - 1440.0 * libm::floor(self.minutes / 1440.0);
        m / 60.0
    }
    pub fn day(&self) -> i64 {
        libm::floor(self.minutes / 1440.0) as i64
    }
    /// Circadian alertness, 0 to 1, peaking at 16:00 and lowest at 04:00.
    pub fn circadian(&self) -> f64 {
        0.5 + 0.5 * libm::cos(2.0 * core::f64::consts::PI * (self.hour() - 16.0) / 24.0)
    }
    /// Drive to sleep: pressure against the circadian alertness.
    pub fn sleepiness(&self) -> f64 {
        (self.pressure - 0.5 * self.circadian() + 0.25).clamp(0.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pressure_rises_awake_and_falls_asleep() {
        let mut c = BodyClock::new(8.0 * 60.0, 60.0);
        let p0 = c.pressure;
        for _ in 0..600 {
            c.tick(1.0);
        }
        assert!(c.pressure > p0);
        c.asleep = true;
        let p1 = c.pressure;
        for _ in 0..600 {
            c.tick(1.0);
        }
        assert!(c.pressure < p1);
        assert!((c.hour() - 8.0).abs() < 1e-6, "{}", c.hour());
    }
}
