//! Secondary motion: spring chains for tails, wag modes, ear springs.

use alloc::string::String;
use alloc::vec::Vec;
use organic::Rng;
use organic::sample::{ex_gaussian, weighted_index};
use organic::spring::{Exp, SpringState, spring};

/// Links that each chase the one before, each slower than the last, so a
/// drive at the root travels down the chain as a wave.
#[derive(Clone, Debug)]
pub struct SpringChain {
    pub links: Vec<SpringState>,
    pub halflife: f64,
    /// Halflife multiplier per link.
    pub falloff: Vec<f64>,
}

impl SpringChain {
    pub fn new(n: usize, halflife: f64) -> Self {
        let falloff = (0..n)
            .map(|i| [1.0, 1.5, 2.1, 2.8, 3.6][i.min(4)])
            .collect();
        SpringChain {
            links: alloc::vec![SpringState::default(); n],
            halflife,
            falloff,
        }
    }
    /// Link 0 chases `drive + extra[0]`, link k chases link k-1 plus `extra[k]`.
    pub fn update(&mut self, dt: f64, drive: f64, extra: &[f64]) {
        let mut goal = drive;
        for i in 0..self.links.len() {
            let g = goal + extra.get(i).copied().unwrap_or(0.0);
            spring(
                &mut self.links[i],
                g,
                self.halflife * self.falloff[i],
                dt,
                Exp::Exact,
            );
            goal = self.links[i].x;
        }
    }
    pub fn angles(&self) -> Vec<f64> {
        self.links.iter().map(|s| s.x).collect()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct WagMode {
    pub name: String,
    pub amp: f64,
    pub hz: f64,
    pub lift: f64,
    pub circle: f64,
    pub tip: f64,
}

fn m(name: &str, amp: f64, hz: f64, lift: f64, circle: f64, tip: f64) -> WagMode {
    WagMode {
        name: name.into(),
        amp,
        hz,
        lift,
        circle,
        tip,
    }
}

/// Eight wag modes: tail wagging moves between about eight stable modes
/// (Ren 2022). Amplitudes and rates from the HACKLE body (vendor).
pub fn wag_modes() -> Vec<WagMode> {
    alloc::vec![
        m("still", 0.05, 0.45, -0.25, 0.0, 0.0),
        m("slow wide", 0.5, 0.6, 0.0, 0.0, 0.0),
        m("fast small", 0.2, 1.45, 0.0, 0.0, 0.0),
        m("loose broad", 0.75, 0.95, 0.0, 0.0, 0.0),
        m("helicopter", 0.55, 1.2, 0.0, 1.0, 0.0),
        m("high stiff", 0.12, 1.7, 0.6, 0.0, 0.0),
        m("tucked", 0.05, 1.6, -1.0, 0.0, 0.0),
        m("tip flick", 0.28, 1.1, 0.0, 0.0, 1.0),
    ]
}

#[derive(Clone, Debug, Default)]
pub struct WagInput {
    /// Weight per mode; the next mode is drawn from them when the dwell ends.
    pub mode_weights: Vec<f64>,
    /// 0 to 1: faster wags.
    pub arousal: f64,
    /// Tail lift goal from mood and posture, radians.
    pub lift: f64,
    /// Lateral bias, radians: right toward a liked person (Quaranta 2007).
    pub bias: f64,
    pub turn_rate: f64,
    /// Amplitude and rate scales (0.3 asleep, 1 awake).
    pub amp_scale: f64,
    pub hz_scale: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct TailPose {
    /// Side to side angle per link.
    pub yaw: Vec<f64>,
    /// Lift of the root link, radians.
    pub lift: f64,
    pub mode: usize,
}

pub struct Wag {
    pub modes: Vec<WagMode>,
    pub chain: SpringChain,
    mode: usize,
    until: f64,
    time: f64,
    amp: SpringState,
    hz: SpringState,
    center: SpringState,
    lift: SpringState,
    circle: SpringState,
    tip: SpringState,
    phase: f64,
}

impl Wag {
    pub fn new(links: usize, halflife: f64) -> Self {
        Wag {
            modes: wag_modes(),
            chain: SpringChain::new(links, halflife),
            mode: 1,
            until: 0.0,
            time: 0.0,
            amp: SpringState::at(0.3),
            hz: SpringState::at(0.6),
            center: SpringState::default(),
            lift: SpringState::default(),
            circle: SpringState::default(),
            tip: SpringState::default(),
            phase: 0.0,
        }
    }

    pub fn update<R: Rng + ?Sized>(&mut self, dt: f64, inp: &WagInput, rng: &mut R) -> TailPose {
        self.time += dt;
        if self.time > self.until {
            if !inp.mode_weights.is_empty() {
                self.mode = weighted_index(&inp.mode_weights, rng).min(self.modes.len() - 1);
            }
            self.until = self.time + ex_gaussian(1.2, 0.3, 1.8, rng).max(0.2);
        }
        let md = &self.modes[self.mode];
        let hl = 0.25;
        let fz = ((1.5 + 3.5 * inp.arousal) * md.hz * inp.hz_scale).clamp(0.8, 5.0);
        spring(
            &mut self.amp,
            md.amp * inp.amp_scale * (1.8 / fz).clamp(0.45, 1.4),
            hl,
            dt,
            Exp::Exact,
        );
        spring(&mut self.hz, fz, hl, dt, Exp::Exact);
        spring(&mut self.center, inp.bias, 0.4, dt, Exp::Exact);
        spring(&mut self.lift, md.lift + inp.lift, 0.3, dt, Exp::Exact);
        spring(&mut self.circle, md.circle, hl, dt, Exp::Exact);
        spring(&mut self.tip, md.tip, hl, dt, Exp::Exact);
        self.phase += dt * 2.0 * core::f64::consts::PI * self.hz.x;
        let a = self.amp.x;
        let drive = self.center.x + a * libm::sin(self.phase) * (1.0 - 0.7 * self.tip.x)
            - inp.turn_rate * 0.12;
        let t = self.tip.x;
        let extra = [
            0.0,
            t * a * 0.6 * libm::sin(self.phase * 1.6),
            t * a * libm::sin(self.phase * 1.6 + 0.8),
        ];
        self.chain.update(dt, drive, &extra);
        let scale = [0.6, 0.45, 0.45];
        let yaw = self
            .chain
            .links
            .iter()
            .enumerate()
            .map(|(i, s)| s.x * scale[i.min(2)])
            .collect();
        TailPose {
            yaw,
            lift: self.lift.x + self.circle.x * a * 0.5 * libm::cos(self.phase),
            mode: self.mode,
        }
    }
}

/// Two ear springs kicked by head turns and flapped by shakes and strides.
#[derive(Clone, Debug)]
pub struct EarPair {
    pub left: SpringState,
    pub right: SpringState,
    pub halflife: f64,
}

impl EarPair {
    pub fn new(halflife: f64) -> Self {
        EarPair {
            left: SpringState::default(),
            right: SpringState::default(),
            halflife,
        }
    }
    /// `perk` -1 to 1, `negative` (fear, frustration) flattens, `head_yaw_rate`
    /// kicks the ears opposite ways, `flap` and `bounce` add on both.
    pub fn update(
        &mut self,
        dt: f64,
        perk: f64,
        negative: f64,
        head_yaw_rate: f64,
        flap: f64,
        bounce: f64,
    ) -> [f64; 2] {
        let kick = -head_yaw_rate * 0.09;
        let base = perk.clamp(-1.0, 1.0) * 0.45 - negative * 0.5 + bounce;
        spring(
            &mut self.left,
            base + kick + flap,
            self.halflife,
            dt,
            Exp::Exact,
        );
        spring(
            &mut self.right,
            base - kick - flap,
            self.halflife,
            dt,
            Exp::Exact,
        );
        [self.left.x, self.right.x]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use organic::Mulberry32;

    #[test]
    fn wave_travels_down_the_chain() {
        let mut c = SpringChain::new(3, 0.06);
        let mut peaks = [0usize; 3];
        let mut best = [0.0f64; 3];
        for k in 0..120 {
            c.update(1.0 / 120.0, if k < 10 { 1.0 } else { 0.0 }, &[]);
            for i in 0..3 {
                if c.links[i].x > best[i] {
                    best[i] = c.links[i].x;
                    peaks[i] = k;
                }
            }
        }
        assert!(peaks[0] < peaks[1] && peaks[1] < peaks[2], "{peaks:?}");
    }

    #[test]
    fn wag_stays_bounded_and_changes_mode() {
        let mut w = Wag::new(3, 0.06);
        let mut r = Mulberry32::new(3);
        let inp = WagInput {
            mode_weights: alloc::vec![1.0; 8],
            arousal: 0.6,
            amp_scale: 1.0,
            hz_scale: 1.0,
            ..Default::default()
        };
        let mut modes = alloc::collections::BTreeSet::new();
        for _ in 0..6000 {
            let p = w.update(1.0 / 60.0, &inp, &mut r);
            assert!(p.yaw.iter().all(|a| a.abs() < 1.2));
            modes.insert(p.mode);
        }
        assert!(modes.len() >= 5, "{modes:?}");
    }
}
