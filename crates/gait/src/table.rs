//! Footfall tables. Offsets are the phase at which each leg's stance
//! starts, as a fraction of the stride (Hildebrand's diagrams), in leg order
//! LF RF LH RH for four legs and L1 R1 L2 R2 L3 R3 for six.

use alloc::string::String;
use alloc::vec::Vec;

#[derive(Clone, Debug, PartialEq)]
pub struct GaitTable {
    pub name: String,
    pub offsets: Vec<f64>,
    /// Share of the stride each foot is on the ground.
    pub duty: f64,
    /// Swing height in meters for a leg about 0.4 m long.
    pub clearance: f64,
    /// Stride frequency: `freq0 + freq_v * min(v, v_cap) + freq_w * |turn rate|`, in Hz.
    pub freq0: f64,
    pub freq_v: f64,
    pub v_cap: f64,
    pub freq_w: f64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TableError {
    Empty,
    OffsetRange(usize),
    Duty,
    LegCount,
}

impl GaitTable {
    pub fn validate(&self) -> Result<(), TableError> {
        if self.offsets.is_empty() {
            return Err(TableError::Empty);
        }
        for (i, o) in self.offsets.iter().enumerate() {
            if !(0.0..1.0).contains(o) {
                return Err(TableError::OffsetRange(i));
            }
        }
        if !(self.duty > 0.0 && self.duty < 1.0) {
            return Err(TableError::Duty);
        }
        Ok(())
    }
    pub fn frequency(&self, v: f64, w: f64) -> f64 {
        self.freq0 + self.freq_v * v.min(self.v_cap) + self.freq_w * libm::fabs(w)
    }
    /// Whether leg `i` is in stance at stride phase `t` (0 to 1).
    pub fn in_stance(&self, i: usize, t: f64) -> bool {
        organic::math::frac(t - self.offsets[i]) < self.duty
    }
    /// Stance per leg at `samples` evenly spaced phases.
    pub fn footfall_diagram(&self, samples: usize) -> Vec<Vec<bool>> {
        (0..samples)
            .map(|k| {
                (0..self.offsets.len())
                    .map(|i| self.in_stance(i, k as f64 / samples as f64))
                    .collect()
            })
            .collect()
    }
}

fn t(name: &str, offsets: &[f64], duty: f64, clearance: f64, f: (f64, f64, f64, f64)) -> GaitTable {
    GaitTable {
        name: name.into(),
        offsets: offsets.to_vec(),
        duty,
        clearance,
        freq0: f.0,
        freq_v: f.1,
        v_cap: f.2,
        freq_w: f.3,
    }
}

/// Walk, pace, trot, canter and gallop for a dog sized quadruped, in the
/// order the Froude selector weights them. Values from an earlier in-house dog simulator
/// (vendor, tuned by eye on a 0.78 m tall dog).
pub fn quadruped() -> Vec<GaitTable> {
    alloc::vec![
        t(
            "walk",
            &[0.25, 0.75, 0.0, 0.5],
            0.64,
            0.045,
            (1.05, 0.9, 1.2, 0.25)
        ),
        t(
            "pace",
            &[0.0, 0.5, 0.0, 0.5],
            0.5,
            0.055,
            (1.6, 0.35, 1e9, 0.0)
        ),
        t(
            "trot",
            &[0.0, 0.5, 0.5, 0.0],
            0.42,
            0.07,
            (1.8, 0.3, 1e9, 0.0)
        ),
        t(
            "canter",
            &[0.3, 0.55, 0.0, 0.3],
            0.38,
            0.08,
            (2.0, 0.15, 1e9, 0.0)
        ),
        t(
            "gallop",
            &[0.62, 0.5, 0.0, 0.12],
            0.32,
            0.09,
            (2.3, 0.12, 1e9, 0.0)
        ),
    ]
}

/// Tripod, ripple and wave gaits for six legs (L1 R1 L2 R2 L3 R3).
pub fn hexapod() -> Vec<GaitTable> {
    alloc::vec![
        t(
            "wave",
            &[0.0, 0.5, 1.0 / 6.0, 4.0 / 6.0, 2.0 / 6.0, 5.0 / 6.0],
            5.0 / 6.0,
            0.04,
            (0.8, 0.8, 1.0, 0.2)
        ),
        t(
            "ripple",
            &[0.0, 0.5, 1.0 / 3.0, 5.0 / 6.0, 2.0 / 3.0, 1.0 / 6.0],
            2.0 / 3.0,
            0.05,
            (1.0, 0.8, 1.5, 0.2)
        ),
        t(
            "tripod",
            &[0.0, 0.5, 0.5, 0.0, 0.0, 0.5],
            0.5,
            0.06,
            (1.4, 0.6, 3.0, 0.2)
        ),
    ]
}

/// Leg phase offsets for a weighted mix of tables, blended on the circle
/// so 0.95 and 0.05 average to 0, not 0.5.
pub fn blend_offsets(tables: &[GaitTable], weights: &[f64], out: &mut [f64]) {
    for i in 0..out.len() {
        let mut c = 0.0;
        let mut s = 0.0;
        for (t, w) in tables.iter().zip(weights) {
            let a = 2.0 * core::f64::consts::PI * t.offsets[i];
            c += w * libm::cos(a);
            s += w * libm::sin(a);
        }
        out[i] = organic::math::frac(libm::atan2(s, c) / (2.0 * core::f64::consts::PI));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tables_validate() {
        for t in quadruped().iter().chain(hexapod().iter()) {
            assert_eq!(t.validate(), Ok(()), "{}", t.name);
        }
    }

    #[test]
    fn hildebrand_patterns() {
        let q = quadruped();
        // trot: diagonal pairs (LF with RH, RF with LH) move together
        let trot = &q[2];
        for row in trot.footfall_diagram(40) {
            assert_eq!(row[0], row[3]);
            assert_eq!(row[1], row[2]);
        }
        // pace: lateral pairs move together
        for row in q[1].footfall_diagram(40) {
            assert_eq!(row[0], row[2]);
            assert_eq!(row[1], row[3]);
        }
        // walk: duty above 0.5 means at least two feet always down
        for row in q[0].footfall_diagram(100) {
            assert!(row.iter().filter(|x| **x).count() >= 2);
        }
        // walk sequence is lateral: LH, LF, RH, RF (offsets 0, 0.25, 0.5, 0.75)
        let w = &q[0].offsets;
        assert!(w[2] < w[0] && w[0] < w[3] && w[3] < w[1]);
        // tripod: three feet down at every phase
        for row in hexapod()[2].footfall_diagram(40) {
            assert_eq!(row.iter().filter(|x| **x).count(), 3);
        }
    }

    #[test]
    fn circular_blend() {
        let a = t("a", &[0.95], 0.5, 0.0, (1.0, 0.0, 1.0, 0.0));
        let b = t("b", &[0.05], 0.5, 0.0, (1.0, 0.0, 1.0, 0.0));
        let mut o = [0.0];
        blend_offsets(&[a, b], &[0.5, 0.5], &mut o);
        assert!(o[0] < 1e-9 || o[0] > 1.0 - 1e-9);
    }
}
