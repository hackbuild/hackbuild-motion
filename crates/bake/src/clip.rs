//! Clip bake: local bone rotations and a root track in, a compact pack out.
//! Rotations are stored as int16 quaternion components (value / 32767),
//! sign aligned frame to frame so a reader can interpolate without
//! hemisphere checks; the root position is int16 with a per clip scale.
//! The bake reports the largest joint angle error after quantisation, a
//! loop seam check, and foot contacts found by forward kinematics, so the
//! runtime does not guess plants from ankle height.

use crate::glb::{BakeError, err};
use serde::{Deserialize, Serialize};

pub type Quat = [f32; 4];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Skeleton {
    /// Role names, parents before children.
    pub roles: Vec<String>,
    /// Parent index per role, -1 for the root.
    pub parents: Vec<i32>,
    /// Rest local translation per role in meters.
    pub rest: Vec<[f32; 3]>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceClip {
    pub name: String,
    #[serde(default, rename = "loop")]
    pub looped: bool,
    /// Local rotations, frame major then role, `x y z w`.
    pub q: Vec<f32>,
    /// Root local translation per frame, `x y z`. Empty for the rest offset.
    #[serde(default)]
    pub p: Vec<f32>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContactRule {
    /// Roles to test, at most 8 (one bit each).
    pub feet: Vec<String>,
    /// A foot is down below this height in meters.
    pub height: f32,
    /// and slower than this horizontal speed in m/s.
    pub speed: f32,
    /// Shorter runs of contact or flight are merged into their neighbours.
    pub min_frames: usize,
}

impl Default for ContactRule {
    fn default() -> Self {
        ContactRule {
            feet: vec!["leftFoot".into(), "rightFoot".into()],
            height: 0.12,
            speed: 0.45,
            min_frames: 2,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BakeInput {
    pub fps: f32,
    pub skeleton: Skeleton,
    pub clips: Vec<SourceClip>,
    #[serde(default)]
    pub contacts: Option<ContactRule>,
    /// Seam limit in degrees for loop clips (default 2).
    #[serde(default)]
    pub seam_limit_deg: Option<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PackedClip {
    pub name: String,
    /// Time of the last frame, (n - 1) / fps.
    pub dur: f32,
    pub n: u32,
    pub looped: bool,
    /// Meters per int16 step of `p`.
    pub pos_scale: f32,
    pub q: Vec<i16>,
    pub p: Vec<i16>,
    /// One byte per frame, bit k set while foot k is down.
    pub contacts: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ClipPack {
    pub fps: f32,
    pub roles: Vec<String>,
    pub parents: Vec<i32>,
    pub feet: Vec<String>,
    pub clips: Vec<PackedClip>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClipReport {
    pub name: String,
    pub frames: u32,
    /// Largest angle between a source rotation and its decoded int16 copy.
    pub max_angle_error_deg: f32,
    pub worst_role: String,
    pub worst_frame: u32,
    pub max_position_error_m: f32,
    /// Loop clips only: rotation change from the last frame to the first.
    pub seam_angle_deg: Option<f32>,
    /// Loop clips only: the largest rotation change between neighbouring frames.
    pub largest_step_deg: Option<f32>,
    pub seam_ok: Option<bool>,
    /// Frames with each foot down, in `feet` order.
    pub contact_frames: Vec<u32>,
}

pub fn qmul(a: Quat, b: Quat) -> Quat {
    [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
}

pub fn qrot(q: Quat, v: [f32; 3]) -> [f32; 3] {
    let [x, y, z, w] = q;
    let tx = 2.0 * (y * v[2] - z * v[1]);
    let ty = 2.0 * (z * v[0] - x * v[2]);
    let tz = 2.0 * (x * v[1] - y * v[0]);
    [
        v[0] + w * tx + (y * tz - z * ty),
        v[1] + w * ty + (z * tx - x * tz),
        v[2] + w * tz + (x * ty - y * tx),
    ]
}

fn normalize(q: Quat) -> Quat {
    let l = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]).sqrt();
    if l < 1e-12 {
        [0.0, 0.0, 0.0, 1.0]
    } else {
        [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
    }
}

fn dot(a: Quat, b: Quat) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
}

/// Angle in degrees between two rotations.
/// Through atan2 of the relative rotation in f64, which stays exact near
/// zero where an acos of the dot product loses about 0.05 degrees in f32.
pub fn angle_deg(a: Quat, b: Quat) -> f32 {
    let (a, b) = (normalize(a), normalize(b));
    let r = qmul([-a[0], -a[1], -a[2], a[3]], b).map(f64::from);
    let v = (r[0] * r[0] + r[1] * r[1] + r[2] * r[2]).sqrt();
    (2.0 * v.atan2(r[3].abs())).to_degrees() as f32
}

fn quant(c: f32) -> i16 {
    (c * 32767.0).round().clamp(-32767.0, 32767.0) as i16
}

pub fn dequant(q: &[i16]) -> Quat {
    normalize([
        q[0] as f32 / 32767.0,
        q[1] as f32 / 32767.0,
        q[2] as f32 / 32767.0,
        q[3] as f32 / 32767.0,
    ])
}

/// World positions of every role for one frame.
fn forward(sk: &Skeleton, rot: &[f32], root: [f32; 3]) -> Vec<[f32; 3]> {
    let r = sk.roles.len();
    let mut wq = vec![[0.0, 0.0, 0.0, 1.0]; r];
    let mut wp = vec![[0.0; 3]; r];
    for i in 0..r {
        let lq = normalize([rot[i * 4], rot[i * 4 + 1], rot[i * 4 + 2], rot[i * 4 + 3]]);
        let par = sk.parents[i];
        if par < 0 {
            wq[i] = lq;
            wp[i] = root;
        } else {
            let p = par as usize;
            wq[i] = qmul(wq[p], lq);
            let o = qrot(wq[p], sk.rest[i]);
            wp[i] = [wp[p][0] + o[0], wp[p][1] + o[1], wp[p][2] + o[2]];
        }
    }
    wp
}

fn smooth_runs(bits: &mut [bool], min: usize) {
    if min <= 1 || bits.is_empty() {
        return;
    }
    let mut i = 0;
    while i < bits.len() {
        let mut j = i;
        while j < bits.len() && bits[j] == bits[i] {
            j += 1;
        }
        // an inner run shorter than min takes the value of its neighbours
        if j - i < min && i > 0 && j < bits.len() {
            let v = !bits[i];
            bits[i..j].iter_mut().for_each(|b| *b = v);
        }
        i = j;
    }
}

fn check(input: &BakeInput) -> Result<(), BakeError> {
    let sk = &input.skeleton;
    let r = sk.roles.len();
    if r == 0 || sk.parents.len() != r || sk.rest.len() != r {
        return err("clip bake: roles, parents and rest need one entry per role");
    }
    if r > u16::MAX as usize {
        return err("clip bake: too many roles");
    }
    for (i, &p) in sk.parents.iter().enumerate() {
        if p >= i as i32 {
            return err(format!(
                "clip bake: role {} lists a parent after itself",
                sk.roles[i]
            ));
        }
    }
    if input.fps.is_nan() || input.fps <= 0.0 {
        return err("clip bake: fps must be above 0");
    }
    for c in &input.clips {
        if c.q.is_empty() || !c.q.len().is_multiple_of(r * 4) {
            return err(format!(
                "clip bake: clip {} has {} rotation values, not a multiple of {}",
                c.name,
                c.q.len(),
                r * 4
            ));
        }
        let n = c.q.len() / (r * 4);
        if !c.p.is_empty() && c.p.len() != n * 3 {
            return err(format!(
                "clip bake: clip {} root track has {} values for {} frames",
                c.name,
                c.p.len(),
                n
            ));
        }
    }
    if let Some(rule) = &input.contacts {
        if rule.feet.len() > 8 {
            return err("clip bake: at most 8 contact roles");
        }
        if let Some(f) = rule.feet.iter().find(|f| !sk.roles.contains(f)) {
            return err(format!(
                "clip bake: contact role {f} is not in the skeleton"
            ));
        }
    }
    Ok(())
}

pub fn bake(input: &BakeInput) -> Result<(ClipPack, Vec<ClipReport>), BakeError> {
    check(input)?;
    let sk = &input.skeleton;
    let r = sk.roles.len();
    let rule = input.contacts.clone().unwrap_or(ContactRule {
        feet: Vec::new(),
        ..Default::default()
    });
    let feet: Vec<usize> = rule
        .feet
        .iter()
        .filter_map(|f| sk.roles.iter().position(|x| x == f))
        .collect();
    let seam_limit = input.seam_limit_deg.unwrap_or(2.0);
    let mut clips = Vec::new();
    let mut reports = Vec::new();
    for c in &input.clips {
        let n = c.q.len() / (r * 4);
        let root_rest = sk.rest[0];
        let root: Vec<[f32; 3]> = (0..n)
            .map(|f| {
                if c.p.is_empty() {
                    root_rest
                } else {
                    [c.p[f * 3], c.p[f * 3 + 1], c.p[f * 3 + 2]]
                }
            })
            .collect();

        // sign aligned source rotations
        let mut src: Vec<Quat> = Vec::with_capacity(n * r);
        for f in 0..n {
            for b in 0..r {
                let k = (f * r + b) * 4;
                let mut q = normalize([c.q[k], c.q[k + 1], c.q[k + 2], c.q[k + 3]]);
                let prev = if f == 0 {
                    [0.0, 0.0, 0.0, 1.0]
                } else {
                    src[(f - 1) * r + b]
                };
                if dot(q, prev) < 0.0 {
                    q = [-q[0], -q[1], -q[2], -q[3]];
                }
                src.push(q);
            }
        }
        let mut q16 = Vec::with_capacity(n * r * 4);
        let mut worst = (0.0f32, 0usize, 0usize);
        for (k, q) in src.iter().enumerate() {
            let e = [quant(q[0]), quant(q[1]), quant(q[2]), quant(q[3])];
            let a = angle_deg(*q, dequant(&e));
            if a > worst.0 {
                worst = (a, k % r, k / r);
            }
            q16.extend_from_slice(&e);
        }
        let reach = root
            .iter()
            .flat_map(|p| p.iter())
            .fold(0.0f32, |m, v| m.max(v.abs()));
        let pos_scale = (reach / 32767.0).max(1e-6);
        let mut p16 = Vec::with_capacity(n * 3);
        let mut pos_err = 0.0f32;
        for p in &root {
            for v in p {
                let s = (v / pos_scale).round().clamp(-32767.0, 32767.0) as i16;
                pos_err = pos_err.max((s as f32 * pos_scale - v).abs());
                p16.push(s);
            }
        }

        let (seam_angle, step, seam_ok) = if c.looped && n > 2 {
            let mut seam = 0.0f32;
            let mut largest = 0.0f32;
            for b in 0..r {
                seam = seam.max(angle_deg(src[(n - 1) * r + b], src[b]));
                for f in 1..n {
                    largest = largest.max(angle_deg(src[(f - 1) * r + b], src[f * r + b]));
                }
            }
            (
                Some(seam),
                Some(largest),
                Some(seam <= seam_limit.max(2.0 * largest)),
            )
        } else {
            (None, None, None)
        };

        let mut contacts = vec![0u8; n];
        let mut counts = vec![0u32; feet.len()];
        if !feet.is_empty() {
            let world: Vec<Vec<[f32; 3]>> = (0..n)
                .map(|f| forward(sk, &c.q[f * r * 4..(f + 1) * r * 4], root[f]))
                .collect();
            for (k, &fi) in feet.iter().enumerate() {
                let mut down: Vec<bool> = (0..n)
                    .map(|f| {
                        let p = world[f][fi];
                        let (a, b) = if f + 1 < n {
                            (f, f + 1)
                        } else {
                            (f.saturating_sub(1), f)
                        };
                        let (pa, pb) = (world[a][fi], world[b][fi]);
                        let speed =
                            ((pb[0] - pa[0]).powi(2) + (pb[2] - pa[2]).powi(2)).sqrt() * input.fps;
                        p[1] <= rule.height && (n < 2 || speed <= rule.speed)
                    })
                    .collect();
                smooth_runs(&mut down, rule.min_frames);
                for (f, d) in down.iter().enumerate() {
                    if *d {
                        contacts[f] |= 1 << k;
                        counts[k] += 1;
                    }
                }
            }
        }
        reports.push(ClipReport {
            name: c.name.clone(),
            frames: n as u32,
            max_angle_error_deg: worst.0,
            worst_role: sk.roles[worst.1].clone(),
            worst_frame: worst.2 as u32,
            max_position_error_m: pos_err,
            seam_angle_deg: seam_angle,
            largest_step_deg: step,
            seam_ok,
            contact_frames: counts,
        });
        clips.push(PackedClip {
            name: c.name.clone(),
            dur: (n.saturating_sub(1)) as f32 / input.fps,
            n: n as u32,
            looped: c.looped,
            pos_scale,
            q: q16,
            p: p16,
            contacts,
        });
    }
    let feet_names = feet.iter().map(|&i| sk.roles[i].clone()).collect();
    Ok((
        ClipPack {
            fps: input.fps,
            roles: sk.roles.clone(),
            parents: sk.parents.clone(),
            feet: feet_names,
            clips,
        },
        reports,
    ))
}

// Pack bytes, little endian:
//   "HBCP" u16 version(1) f32 fps u16 roles u8 feet u16 clips
//   roles: str, parents: i16 per role, feet: str
//   per clip: str name, f32 dur, u32 n, u8 loop, f32 posScale,
//             i16 q[n * roles * 4], i16 p[n * 3], u8 contacts[n]
//   str: u16 byte length then utf-8
const PACK_MAGIC: &[u8; 4] = b"HBCP";

fn put_str(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(&(s.len() as u16).to_le_bytes());
    out.extend_from_slice(s.as_bytes());
}

pub fn encode(pack: &ClipPack) -> Vec<u8> {
    let mut o = Vec::new();
    o.extend_from_slice(PACK_MAGIC);
    o.extend_from_slice(&1u16.to_le_bytes());
    o.extend_from_slice(&pack.fps.to_le_bytes());
    o.extend_from_slice(&(pack.roles.len() as u16).to_le_bytes());
    o.push(pack.feet.len() as u8);
    o.extend_from_slice(&(pack.clips.len() as u16).to_le_bytes());
    for r in &pack.roles {
        put_str(&mut o, r);
    }
    for p in &pack.parents {
        o.extend_from_slice(&(*p as i16).to_le_bytes());
    }
    for f in &pack.feet {
        put_str(&mut o, f);
    }
    for c in &pack.clips {
        put_str(&mut o, &c.name);
        o.extend_from_slice(&c.dur.to_le_bytes());
        o.extend_from_slice(&c.n.to_le_bytes());
        o.push(c.looped as u8);
        o.extend_from_slice(&c.pos_scale.to_le_bytes());
        c.q.iter()
            .for_each(|v| o.extend_from_slice(&v.to_le_bytes()));
        c.p.iter()
            .for_each(|v| o.extend_from_slice(&v.to_le_bytes()));
        o.extend_from_slice(&c.contacts);
    }
    o
}

struct Reader<'a> {
    b: &'a [u8],
    at: usize,
}

impl Reader<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], BakeError> {
        let s = self
            .b
            .get(self.at..self.at + n)
            .ok_or_else(|| BakeError("pack: ends early".into()))?;
        self.at += n;
        Ok(s)
    }
    fn u8(&mut self) -> Result<u8, BakeError> {
        Ok(self.take(1)?[0])
    }
    fn u16(&mut self) -> Result<u16, BakeError> {
        let s = self.take(2)?;
        Ok(u16::from_le_bytes([s[0], s[1]]))
    }
    fn i16s(&mut self, n: usize) -> Result<Vec<i16>, BakeError> {
        Ok(self
            .take(n * 2)?
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| i16::from_le_bytes(*c))
            .collect())
    }
    fn u32(&mut self) -> Result<u32, BakeError> {
        let s = self.take(4)?;
        Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn f32(&mut self) -> Result<f32, BakeError> {
        Ok(f32::from_bits(self.u32()?))
    }
    fn str(&mut self) -> Result<String, BakeError> {
        let n = self.u16()? as usize;
        String::from_utf8(self.take(n)?.to_vec())
            .map_err(|_| BakeError("pack: a name is not utf-8".into()))
    }
}

pub fn decode(bytes: &[u8]) -> Result<ClipPack, BakeError> {
    let mut r = Reader { b: bytes, at: 0 };
    if r.take(4)? != PACK_MAGIC {
        return err("pack: no HBCP magic");
    }
    if r.u16()? != 1 {
        return err("pack: unknown version");
    }
    let fps = r.f32()?;
    let nr = r.u16()? as usize;
    let nf = r.u8()? as usize;
    let nc = r.u16()? as usize;
    let roles = (0..nr).map(|_| r.str()).collect::<Result<Vec<_>, _>>()?;
    let parents = r.i16s(nr)?.into_iter().map(i32::from).collect();
    let feet = (0..nf).map(|_| r.str()).collect::<Result<Vec<_>, _>>()?;
    let mut clips = Vec::with_capacity(nc);
    for _ in 0..nc {
        let name = r.str()?;
        let dur = r.f32()?;
        let n = r.u32()?;
        let looped = r.u8()? != 0;
        let pos_scale = r.f32()?;
        let q = r.i16s(n as usize * nr * 4)?;
        let p = r.i16s(n as usize * 3)?;
        let contacts = r.take(n as usize)?.to_vec();
        clips.push(PackedClip {
            name,
            dur,
            n,
            looped,
            pos_scale,
            q,
            p,
            contacts,
        });
    }
    Ok(ClipPack {
        fps,
        roles,
        parents,
        feet,
        clips,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::golden::{synthetic_clips, walk_skeleton};

    #[test]
    fn quantisation_error_stays_under_a_hundredth_of_a_degree() {
        let (pack, reports) = bake(&synthetic_clips(7)).unwrap();
        for r in &reports {
            // int16 components give about 0.0035 degrees per step (computed)
            assert!(
                r.max_angle_error_deg < 0.01,
                "{} {}",
                r.name,
                r.max_angle_error_deg
            );
            assert!(r.max_position_error_m < 1e-4);
        }
        assert_eq!(pack.clips.len(), 3);
    }

    #[test]
    fn pack_round_trips() {
        let (pack, _) = bake(&synthetic_clips(3)).unwrap();
        let bytes = encode(&pack);
        assert_eq!(decode(&bytes).unwrap(), pack);
        assert!(decode(&bytes[..bytes.len() - 1]).is_err());
    }

    #[test]
    fn seam_check_flags_a_broken_loop() {
        let (_, reports) = bake(&synthetic_clips(5)).unwrap();
        let walk = reports.iter().find(|r| r.name == "walk").unwrap();
        let broken = reports.iter().find(|r| r.name == "broken_loop").unwrap();
        assert_eq!(walk.seam_ok, Some(true), "{walk:?}");
        assert_eq!(broken.seam_ok, Some(false), "{broken:?}");
        assert!(
            reports
                .iter()
                .find(|r| r.name == "wave")
                .unwrap()
                .seam_ok
                .is_none()
        );
    }

    #[test]
    fn contacts_alternate_in_the_walk() {
        let (pack, reports) = bake(&synthetic_clips(5)).unwrap();
        let walk = pack.clips.iter().find(|c| c.name == "walk").unwrap();
        let rep = reports.iter().find(|r| r.name == "walk").unwrap();
        assert_eq!(
            pack.feet,
            vec!["leftFoot".to_string(), "rightFoot".to_string()]
        );
        // each foot is down for part of the stride, not all of it
        for &k in &rep.contact_frames {
            assert!(k > 0 && k < walk.n, "{:?}", rep.contact_frames);
        }
        // both feet are never in the air together in a walk
        assert!(walk.contacts.iter().all(|&c| c != 0), "{:?}", walk.contacts);
    }

    #[test]
    fn bad_input_is_refused_with_a_reason() {
        let mut i = synthetic_clips(1);
        i.clips[0].q.pop();
        assert!(bake(&i).unwrap_err().0.contains("not a multiple"));
        let mut i = synthetic_clips(1);
        i.skeleton = walk_skeleton();
        i.skeleton.parents[1] = 4;
        assert!(bake(&i).is_err());
    }
}
