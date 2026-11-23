//! The feature database and its search.
//!
//! Feature layout per frame, all in the frame's root space:
//! `[foot positions 3F][foot velocities 3F][hip velocity 3]`
//! `[trajectory positions 2T][trajectory directions 2T]`.
//! Each group is normalized by the mean of its per dimension standard
//! deviations, then multiplied by its weight, so a group's weight sets its
//! share of the cost whatever its units.

use crate::clip::Clip;
use alloc::vec::Vec;
use organic::Vec3;

#[derive(Clone, Debug)]
pub struct Config {
    /// Future trajectory sample times, seconds.
    pub traj_times: Vec<f64>,
    pub w_foot_pos: f64,
    pub w_foot_vel: f64,
    pub w_hip_vel: f64,
    pub w_traj_pos: f64,
    pub w_traj_dir: f64,
    /// Frames of the current clip around the current frame that a search
    /// skips, so the matcher does not jump a few frames within one clip.
    pub ignore_window: usize,
    /// Bounding box sizes in frames; `large` is a multiple of `small`.
    pub box_small: usize,
    pub box_large: usize,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            traj_times: alloc::vec![1.0 / 3.0, 2.0 / 3.0, 1.0],
            w_foot_pos: 0.75,
            w_foot_vel: 1.0,
            w_hip_vel: 1.0,
            w_traj_pos: 1.0,
            w_traj_dir: 1.5,
            ignore_window: 6,
            box_small: 16,
            box_large: 64,
        }
    }
}

/// A search result: global frame index and its cost.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Hit {
    pub index: usize,
    pub cost: f64,
}

impl Hit {
    pub const NONE: Hit = Hit {
        index: usize::MAX,
        cost: f64::INFINITY,
    };
}

/// Frames of one clip near a frame that a search skips.
#[derive(Clone, Copy, Debug)]
pub struct Exclude {
    pub clip: usize,
    pub frame: usize,
    pub window: usize,
}

#[derive(Clone, Debug)]
pub struct Database {
    pub fps: f64,
    pub bones: usize,
    pub feet: usize,
    pub config: Config,
    pub clips: Vec<Clip>,
    /// First global frame index of each clip.
    pub starts: Vec<usize>,
    pub traj_frames: Vec<i64>,
    pub dims: usize,
    /// Normalized features, `dims` per frame.
    pub features: Vec<f64>,
    pub mean: Vec<f64>,
    /// Per dimension divisor (group scale over weight).
    pub scale: Vec<f64>,
    pub searchable: Vec<bool>,
    small_min: Vec<f64>,
    small_max: Vec<f64>,
    large_min: Vec<f64>,
    large_max: Vec<f64>,
}

impl Database {
    pub fn frames(&self) -> usize {
        self.searchable.len()
    }

    /// Global index to `(clip, frame)`.
    pub fn locate(&self, index: usize) -> (usize, usize) {
        let c = match self.starts.binary_search(&index) {
            Ok(c) => c,
            Err(c) => c - 1,
        };
        (c, index - self.starts[c])
    }

    pub fn row(&self, index: usize) -> &[f64] {
        &self.features[index * self.dims..(index + 1) * self.dims]
    }

    /// Offset of the trajectory part in a feature row.
    pub fn traj_offset(&self) -> usize {
        6 * self.feet + 3
    }

    pub fn build(fps: f64, clips: Vec<Clip>, config: Config) -> Database {
        let bones = clips.first().map_or(0, |c| c.bones());
        let feet = clips.first().map_or(0, |c| c.feet_count());
        let traj_frames: Vec<i64> = config
            .traj_times
            .iter()
            .map(|t| libm::round(t * fps).max(1.0) as i64)
            .collect();
        let nt = traj_frames.len();
        let dims = 6 * feet + 3 + 4 * nt;
        let max_future = traj_frames.iter().copied().max().unwrap_or(0);
        let mut raw = Vec::new();
        let mut searchable = Vec::new();
        let mut starts = Vec::new();
        let mut row = alloc::vec![0.0; dims];
        for clip in &clips {
            starts.push(searchable.len());
            let n = clip.frames as i64;
            for i in 0..n {
                features_of(clip, i, fps, &traj_frames, &mut row);
                raw.extend_from_slice(&row);
                searchable.push(clip.looped || i + max_future < n);
            }
        }
        let total = searchable.len();
        // groups: (start, len, weight)
        let groups = [
            (0, 3 * feet, config.w_foot_pos),
            (3 * feet, 3 * feet, config.w_foot_vel),
            (6 * feet, 3, config.w_hip_vel),
            (6 * feet + 3, 2 * nt, config.w_traj_pos),
            (6 * feet + 3 + 2 * nt, 2 * nt, config.w_traj_dir),
        ];
        let mut mean = alloc::vec![0.0; dims];
        let mut scale = alloc::vec![1.0; dims];
        if total > 0 {
            for i in 0..total {
                for d in 0..dims {
                    mean[d] += raw[i * dims + d];
                }
            }
            for m in mean.iter_mut() {
                *m /= total as f64;
            }
            for &(start, len, weight) in &groups {
                if len == 0 {
                    continue;
                }
                let mut sd_sum = 0.0;
                for d in start..start + len {
                    let mut v = 0.0;
                    for i in 0..total {
                        let x = raw[i * dims + d] - mean[d];
                        v += x * x;
                    }
                    sd_sum += libm::sqrt(v / total as f64);
                }
                let s = (sd_sum / len as f64).max(1e-6) / weight.max(1e-9);
                for d in start..start + len {
                    scale[d] = s;
                }
            }
        }
        let mut features = raw;
        for i in 0..total {
            for d in 0..dims {
                let x = &mut features[i * dims + d];
                *x = (*x - mean[d]) / scale[d];
            }
        }
        let mut db = Database {
            fps,
            bones,
            feet,
            config,
            clips,
            starts,
            traj_frames,
            dims,
            features,
            mean,
            scale,
            searchable,
            small_min: Vec::new(),
            small_max: Vec::new(),
            large_min: Vec::new(),
            large_max: Vec::new(),
        };
        db.build_boxes();
        db
    }

    fn build_boxes(&mut self) {
        let (sm, lg) = (self.config.box_small.max(1), self.config.box_large.max(1));
        let lg = lg.div_ceil(sm) * sm;
        self.config.box_large = lg;
        let (a, b) = boxes(&self.features, self.dims, sm);
        self.small_min = a;
        self.small_max = b;
        let (a, b) = boxes(&self.features, self.dims, lg);
        self.large_min = a;
        self.large_max = b;
    }

    /// Normalizes a raw trajectory (`x z` per time, then `dx dz` per time,
    /// in the root's frame) into the trajectory part of `query`.
    pub fn write_trajectory(&self, traj: &[f64], query: &mut [f64]) {
        let o = self.traj_offset();
        let n = 4 * self.traj_frames.len();
        for d in 0..n.min(traj.len()) {
            query[o + d] = (traj[d] - self.mean[o + d]) / self.scale[o + d];
        }
    }

    /// Normalizes a whole raw feature row.
    pub fn normalize(&self, raw: &[f64], out: &mut [f64]) {
        for d in 0..self.dims {
            out[d] = (raw[d] - self.mean[d]) / self.scale[d];
        }
    }

    fn allowed(&self, i: usize, ex: Option<Exclude>) -> bool {
        if !self.searchable[i] {
            return false;
        }
        if let Some(e) = ex {
            let s = self.starts[e.clip];
            let end = s + self.clips[e.clip].frames;
            if (s..end).contains(&i) && (i - s).abs_diff(e.frame) <= e.window {
                return false;
            }
        }
        true
    }

    /// Squared distance with an early exit once it reaches `best`.
    #[inline]
    fn cost(&self, i: usize, q: &[f64], best: f64) -> f64 {
        let r = self.row(i);
        let mut c = 0.0;
        for d in 0..self.dims {
            let x = q[d] - r[d];
            c += x * x;
            if c >= best {
                return c;
            }
        }
        c
    }

    /// Full squared distance of a frame to a query.
    pub fn cost_of(&self, i: usize, q: &[f64]) -> f64 {
        self.cost(i, q, f64::INFINITY)
    }

    /// Every allowed frame, in order; keeps the first of equal costs.
    pub fn search_brute(&self, q: &[f64], ex: Option<Exclude>, init: Hit) -> Hit {
        let mut best = init;
        for i in 0..self.frames() {
            if !self.allowed(i, ex) {
                continue;
            }
            let c = self.cost(i, q, best.cost);
            if c < best.cost {
                best = Hit { index: i, cost: c };
            }
        }
        best
    }

    /// The same result as [`search_brute`](Self::search_brute), skipping
    /// runs of frames whose bounding box is already farther than the best.
    pub fn search(&self, q: &[f64], ex: Option<Exclude>, init: Hit) -> Hit {
        let n = self.frames();
        let (sm, lg) = (self.config.box_small.max(1), self.config.box_large);
        let mut best = init;
        let mut i = 0;
        while i < n {
            let lg_i = i / lg;
            let lg_end = ((lg_i + 1) * lg).min(n);
            if box_cost(
                &self.large_min,
                &self.large_max,
                lg_i,
                self.dims,
                q,
                best.cost,
            ) >= best.cost
            {
                i = lg_end;
                continue;
            }
            while i < lg_end {
                let sm_i = i / sm;
                let sm_end = ((sm_i + 1) * sm).min(n);
                if box_cost(
                    &self.small_min,
                    &self.small_max,
                    sm_i,
                    self.dims,
                    q,
                    best.cost,
                ) >= best.cost
                {
                    i = sm_end;
                    continue;
                }
                while i < sm_end {
                    if self.allowed(i, ex) {
                        let c = self.cost(i, q, best.cost);
                        if c < best.cost {
                            best = Hit { index: i, cost: c };
                        }
                    }
                    i += 1;
                }
            }
        }
        best
    }
}

fn boxes(f: &[f64], dims: usize, size: usize) -> (Vec<f64>, Vec<f64>) {
    let n = f.len().checked_div(dims).unwrap_or(0);
    let count = n.div_ceil(size);
    let mut lo = alloc::vec![f64::INFINITY; count * dims];
    let mut hi = alloc::vec![f64::NEG_INFINITY; count * dims];
    for i in 0..n {
        let b = i / size;
        for d in 0..dims {
            let x = f[i * dims + d];
            lo[b * dims + d] = lo[b * dims + d].min(x);
            hi[b * dims + d] = hi[b * dims + d].max(x);
        }
    }
    (lo, hi)
}

#[inline]
fn box_cost(lo: &[f64], hi: &[f64], b: usize, dims: usize, q: &[f64], best: f64) -> f64 {
    let mut c = 0.0;
    for d in 0..dims {
        let x = q[d] - q[d].clamp(lo[b * dims + d], hi[b * dims + d]);
        c += x * x;
        if c >= best {
            return c;
        }
    }
    c
}

/// Raw features of frame `i` of a clip.
pub fn features_of(clip: &Clip, i: i64, fps: f64, traj_frames: &[i64], out: &mut [f64]) {
    let nf = clip.feet_count();
    let n = clip.frames as i64;
    let r = clip.root_at(i);
    let iu = clip.wrap(i);
    for k in 0..nf {
        clip.feet[iu * nf + k].write(&mut out[3 * k..3 * k + 3]);
    }
    // velocity by forward difference in the world, read in frame i's root
    let (a, b) = if clip.looped || i + 1 < n {
        (i, i + 1)
    } else {
        ((i - 1).max(0), i)
    };
    let (ra, rb) = (clip.root_at(a), clip.root_at(b));
    let (ia, ib) = (clip.wrap(a), clip.wrap(b));
    let vel = |pa: Vec3, pb: Vec3| -> Vec3 {
        if a == b {
            return Vec3::ZERO;
        }
        r.dir_to_local((rb.point_to_world(pb) - ra.point_to_world(pa)) * fps)
    };
    for k in 0..nf {
        let v = vel(clip.feet[ia * nf + k], clip.feet[ib * nf + k]);
        v.write(&mut out[3 * nf + 3 * k..3 * nf + 3 * k + 3]);
    }
    vel(clip.hips[ia], clip.hips[ib]).write(&mut out[6 * nf..6 * nf + 3]);
    let o = 6 * nf + 3;
    let nt = traj_frames.len();
    for (t, &df) in traj_frames.iter().enumerate() {
        let l = r.relative(clip.root_at(i + df));
        out[o + 2 * t] = l.x;
        out[o + 2 * t + 1] = l.z;
        out[o + 2 * nt + 2 * t] = libm::sin(l.yaw);
        out[o + 2 * nt + 2 * t + 1] = libm::cos(l.yaw);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::synth::test_database;
    use organic::{Mulberry32, Rng};

    #[test]
    fn every_frame_finds_itself_at_zero_cost() {
        let db = test_database(30.0);
        for i in (0..db.frames()).filter(|&i| db.searchable[i]).step_by(7) {
            let q = db.row(i).to_vec();
            let h = db.search(&q, None, Hit::NONE);
            assert!(h.cost < 1e-20, "frame {i} cost {}", h.cost);
            assert!(h.index == i || db.row(h.index) == db.row(i));
        }
    }

    #[test]
    fn box_search_agrees_with_brute_force() {
        let db = test_database(30.0);
        let mut r = Mulberry32::new(7);
        let mut found_any = false;
        for k in 0..300 {
            let base = (r.next_f64() * db.frames() as f64) as usize % db.frames();
            let mut q = db.row(base).to_vec();
            for x in q.iter_mut() {
                *x += (r.next_f64() - 0.5) * if k % 2 == 0 { 0.5 } else { 4.0 };
            }
            let (c, f) = db.locate(base);
            let ex = Some(Exclude {
                clip: c,
                frame: f,
                window: 6,
            });
            let a = db.search_brute(&q, ex, Hit::NONE);
            let b = db.search(&q, ex, Hit::NONE);
            assert_eq!(a, b, "query {k}");
            found_any |= a.index != usize::MAX;
        }
        assert!(found_any);
    }

    #[test]
    fn excluded_window_is_never_returned() {
        let db = test_database(30.0);
        let i = db.starts[1] + 10;
        let q = db.row(i).to_vec();
        let ex = Some(Exclude {
            clip: 1,
            frame: 10,
            window: 6,
        });
        let h = db.search(&q, ex, Hit::NONE);
        let (c, f) = db.locate(h.index);
        assert!(c != 1 || f.abs_diff(10) > 6, "{c} {f}");
    }

    #[test]
    fn locate_inverts_starts() {
        let db = test_database(30.0);
        for (c, &s) in db.starts.iter().enumerate() {
            assert_eq!(db.locate(s), (c, 0));
            assert_eq!(
                db.locate(s + db.clips[c].frames - 1),
                (c, db.clips[c].frames - 1)
            );
        }
    }
}
