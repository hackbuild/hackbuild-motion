//! wasm-bindgen surface.

use crate::clip::{Clip, Root};
use crate::db::{Config, Database, Hit};
use crate::matcher::{Matcher, MatcherParams};
use crate::synth::{SynthGait, synth_clip};
use alloc::vec::Vec;
use organic::{Quat, Vec3};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = goldenTrace)]
pub fn golden_trace(seed: u32) -> Vec<f64> {
    crate::golden::trace(seed)
}

/// Collects clips before the database is built.
#[wasm_bindgen(js_name = ClipSet)]
pub struct ClipSetJs {
    fps: f64,
    clips: Vec<Clip>,
}

#[wasm_bindgen(js_class = ClipSet)]
impl ClipSetJs {
    #[wasm_bindgen(constructor)]
    pub fn new(fps: f64) -> ClipSetJs {
        ClipSetJs {
            fps,
            clips: Vec::new(),
        }
    }
    /// `root` is `x z yaw` per frame, `rotations` `x y z w` per bone per
    /// frame, `hips` and `feet` `x y z` in the root frame, `contacts` one
    /// byte per foot per frame. Returns the clip index.
    #[wasm_bindgen(js_name = addClip)]
    pub fn add_clip(
        &mut self,
        looped: bool,
        root: &[f64],
        rotations: &[f64],
        hips: &[f64],
        feet: &[f64],
        contacts: &[u8],
    ) -> Result<usize, JsError> {
        let n = root.len() / 3;
        if n < 2
            || hips.len() != 3 * n
            || !rotations.len().is_multiple_of(4 * n)
            || !feet.len().is_multiple_of(3 * n)
        {
            return Err(JsError::new(
                "motion-match: clip arrays disagree on the frame count",
            ));
        }
        if contacts.len() != feet.len() / 3 {
            return Err(JsError::new("motion-match: one contact per foot per frame"));
        }
        let clip = Clip {
            frames: n,
            looped,
            root: root
                .as_chunks::<3>()
                .0
                .iter()
                .map(|c| Root::new(c[0], c[1], c[2]))
                .collect(),
            rotations: rotations
                .as_chunks::<4>()
                .0
                .iter()
                .map(|c| Quat::new(c[0], c[1], c[2], c[3]))
                .collect(),
            hips: hips
                .as_chunks::<3>()
                .0
                .iter()
                .map(|c| Vec3::new(c[0], c[1], c[2]))
                .collect(),
            feet: feet
                .as_chunks::<3>()
                .0
                .iter()
                .map(|c| Vec3::new(c[0], c[1], c[2]))
                .collect(),
            contacts: contacts.iter().map(|&c| c != 0).collect(),
        };
        if let Some(first) = self.clips.first()
            && (first.bones() != clip.bones() || first.feet_count() != clip.feet_count())
        {
            return Err(JsError::new(
                "motion-match: every clip needs the same bones and feet",
            ));
        }
        self.clips.push(clip);
        Ok(self.clips.len() - 1)
    }
    /// Adds a synthetic gait clip (two feet, three bones).
    #[wasm_bindgen(js_name = addSynth)]
    pub fn add_synth(
        &mut self,
        speed: f64,
        speed_end: f64,
        turn_rate: f64,
        strides: usize,
        looped: bool,
    ) -> usize {
        self.clips.push(synth_clip(
            SynthGait {
                speed,
                speed_end,
                turn_rate,
                strides,
                looped,
                half_track: 0.1,
            },
            self.fps,
        ));
        self.clips.len() - 1
    }
    #[wasm_bindgen(getter)]
    pub fn count(&self) -> usize {
        self.clips.len()
    }
    /// Frames of each clip.
    pub fn frames(&self) -> Vec<u32> {
        self.clips.iter().map(|c| c.frames as u32).collect()
    }
    /// Clip data back out: `root`, then `hips`, then `feet`, then
    /// contacts, as one array (for inspection and tests).
    #[wasm_bindgen(js_name = clipData)]
    pub fn clip_data(&self, i: usize) -> Vec<f64> {
        let c = &self.clips[i];
        let mut o = Vec::new();
        for r in &c.root {
            o.extend_from_slice(&[r.x, r.z, r.yaw]);
        }
        for p in &c.hips {
            o.extend_from_slice(&[p.x, p.y, p.z]);
        }
        for p in &c.feet {
            o.extend_from_slice(&[p.x, p.y, p.z]);
        }
        o.extend(c.contacts.iter().map(|&b| b as u8 as f64));
        o
    }
}

/// `config`: traj times (count then values), then foot pos, foot vel, hip
/// vel, traj pos, traj dir weights, ignore window, small box, large box;
/// an empty array keeps the defaults.
fn config_from(a: &[f64]) -> Config {
    let mut c = Config::default();
    if a.is_empty() {
        return c;
    }
    let n = a[0] as usize;
    c.traj_times = a[1..1 + n].to_vec();
    let r = &a[1 + n..];
    if r.len() >= 8 {
        c.w_foot_pos = r[0];
        c.w_foot_vel = r[1];
        c.w_hip_vel = r[2];
        c.w_traj_pos = r[3];
        c.w_traj_dir = r[4];
        c.ignore_window = r[5] as usize;
        c.box_small = r[6] as usize;
        c.box_large = r[7] as usize;
    }
    c
}

#[wasm_bindgen(js_name = Matcher)]
pub struct MatcherJs {
    m: Matcher,
}

#[wasm_bindgen(js_class = Matcher)]
impl MatcherJs {
    /// `params`: search interval, halflife, minimum improvement,
    /// trajectory halflife; `start` is `clip frame x z yaw`.
    #[wasm_bindgen(constructor)]
    pub fn new(
        set: &ClipSetJs,
        config: &[f64],
        params: &[f64],
        start: &[f64],
    ) -> Result<MatcherJs, JsError> {
        if set.clips.is_empty() {
            return Err(JsError::new("motion-match: no clips"));
        }
        let db = Database::build(set.fps, set.clips.clone(), config_from(config));
        let mut p = MatcherParams::default();
        if params.len() >= 4 {
            p.search_interval = params[0];
            p.halflife = params[1];
            p.min_improvement = params[2];
            p.trajectory_halflife = params[3];
        }
        let s = |i: usize| start.get(i).copied().unwrap_or(0.0);
        let clip = (s(0) as usize).min(set.clips.len() - 1);
        let frame = (s(1) as usize).min(set.clips[clip].frames - 1);
        Ok(MatcherJs {
            m: Matcher::new(db, p, clip, frame, Root::new(s(2), s(3), s(4))),
        })
    }
    pub fn trajectory(&self, speed: f64, turn_rate: f64) -> Vec<f64> {
        self.m.trajectory(speed, turn_rate)
    }
    /// One frame; returns `x z yaw vx vz turnRate clip frame jumped cost
    /// phase duty strideFrequency transitions` then contacts.
    pub fn update(&mut self, dt: f64, traj: &[f64]) -> Vec<f64> {
        let j = self.m.update(dt, traj);
        let m = &self.m;
        let mut o = alloc::vec![
            m.root.x,
            m.root.z,
            m.root.yaw,
            m.velocity.0,
            m.velocity.1,
            m.turn_rate,
            m.clip as f64,
            m.frame,
            j as u8 as f64,
            m.last_hit.cost,
            m.motor.phase,
            m.motor.duty,
            m.motor.stride_frequency,
            m.transitions as f64,
        ];
        o.extend(m.contacts.iter().map(|&c| c as u8 as f64));
        o
    }
    #[wasm_bindgen(js_name = forceSearch)]
    pub fn force_search(&mut self) {
        self.m.force_search();
    }
    /// `x y z w` per bone, then hips `x y z`, then feet `x y z` each, in
    /// the root frame.
    pub fn pose(&self) -> Vec<f64> {
        let p = &self.m.pose;
        let mut o = Vec::with_capacity(4 * p.rotations.len() + 3 + 3 * p.feet.len());
        for q in &p.rotations {
            o.extend_from_slice(&[q.x, q.y, q.z, q.w]);
        }
        o.extend_from_slice(&[p.hips.x, p.hips.y, p.hips.z]);
        for f in &p.feet {
            o.extend_from_slice(&[f.x, f.y, f.z]);
        }
        o
    }
    #[wasm_bindgen(getter)]
    pub fn bones(&self) -> usize {
        self.m.db.bones
    }
    #[wasm_bindgen(getter)]
    pub fn feet(&self) -> usize {
        self.m.db.feet
    }
    #[wasm_bindgen(getter)]
    pub fn dims(&self) -> usize {
        self.m.db.dims
    }
    #[wasm_bindgen(getter)]
    pub fn frames(&self) -> usize {
        self.m.db.frames()
    }
    /// The normalized feature row of a global frame.
    #[wasm_bindgen(js_name = featureRow)]
    pub fn feature_row(&self, i: usize) -> Vec<f64> {
        self.m.db.row(i).to_vec()
    }
    /// Searches a normalized query; returns `index cost`. `brute` walks
    /// every frame, otherwise the bounding boxes skip runs.
    pub fn search(&self, query: &[f64], brute: bool) -> Vec<f64> {
        let h = if brute {
            self.m.db.search_brute(query, None, Hit::NONE)
        } else {
            self.m.db.search(query, None, Hit::NONE)
        };
        alloc::vec![h.index as f64, h.cost]
    }
}
