//! MikuMikuDance VMD motions. Bone names are Shift-JIS bytes; the caller
//! decodes them (a browser `TextDecoder("shift_jis")` does) and passes them
//! back, so the crate carries no encoding table.
//!
//! Keys are resampled at MMD's 30 fps with each channel's bezier easing and
//! played on a standard MMD skeleton: arms rest in an A pose about 35
//! degrees down, center and groove carry the body's travel. MMD's left
//! handed space is mirrored on Z so the character faces +Z with its left on
//! +X. The retargeter then treats it as any A pose rig. Legs keyed only by
//! foot IK bones are not solved here.

use crate::skeleton::{Clip, Skeleton};
use alloc::string::String;
use alloc::vec::Vec;
use organic::{Quat, Vec3};
use rig::bones::HumanBone::{self, *};
use rig::reference::reference_position;

/// Meters per MMD unit.
pub const MMD_UNIT: f64 = 0.08;

#[derive(Clone, Debug, PartialEq)]
pub struct BoneKey {
    /// Index into `VmdFile::names`.
    pub name: usize,
    pub frame: u32,
    pub pos: Vec3,
    pub rot: Quat,
    /// Bezier control points `x1 y1 x2 y2` (0 to 1) for x, y, z and rotation.
    pub ease: [[f64; 4]; 4],
}

#[derive(Clone, Debug, PartialEq)]
pub struct MorphKey {
    pub name: usize,
    pub frame: u32,
    pub weight: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct VmdFile {
    /// Distinct raw names (Shift-JIS, trailing zeros cut), bones and morphs.
    pub names: Vec<Vec<u8>>,
    pub bones: Vec<BoneKey>,
    pub morphs: Vec<MorphKey>,
}

fn cstr(b: &[u8]) -> Vec<u8> {
    let end = b.iter().position(|x| *x == 0).unwrap_or(b.len());
    b[..end].to_vec()
}

impl VmdFile {
    pub fn parse(buf: &[u8]) -> Option<VmdFile> {
        if buf.len() < 54 || !buf.starts_with(b"Vocaloid Motion Data") {
            return None;
        }
        let new_format = buf[..30].windows(4).any(|w| w == b"0002");
        let mut o = 30 + if new_format { 20 } else { 10 };
        let u32_at = |o: usize| {
            buf.get(o..o + 4)
                .map(|s| u32::from_le_bytes(s.try_into().unwrap()))
        };
        let f32_at = |o: usize| f32::from_le_bytes(buf[o..o + 4].try_into().unwrap()) as f64;
        let mut names: Vec<Vec<u8>> = Vec::new();
        let mut intern = |raw: Vec<u8>| match names.iter().position(|n| *n == raw) {
            Some(i) => i,
            None => {
                names.push(raw);
                names.len() - 1
            }
        };
        let count = u32_at(o)? as usize;
        o += 4;
        let mut bones = Vec::with_capacity(count.min(1 << 20));
        for _ in 0..count {
            if o + 111 > buf.len() {
                break;
            }
            let name = intern(cstr(&buf[o..o + 15]));
            let ip = &buf[o + 47..o + 111];
            let mut ease = [[0.0; 4]; 4];
            for (c, e) in ease.iter_mut().enumerate() {
                *e = [
                    ip[c] as f64 / 127.0,
                    ip[c + 4] as f64 / 127.0,
                    ip[c + 8] as f64 / 127.0,
                    ip[c + 12] as f64 / 127.0,
                ];
            }
            bones.push(BoneKey {
                name,
                frame: u32_at(o + 15)?,
                pos: Vec3::new(f32_at(o + 19), f32_at(o + 23), f32_at(o + 27)),
                rot: Quat::new(
                    f32_at(o + 31),
                    f32_at(o + 35),
                    f32_at(o + 39),
                    f32_at(o + 43),
                ),
                ease,
            });
            o += 111;
        }
        let mut morphs = Vec::new();
        if let Some(mc) = u32_at(o) {
            o += 4;
            for _ in 0..mc {
                if o + 23 > buf.len() {
                    break;
                }
                let name = intern(cstr(&buf[o..o + 15]));
                morphs.push(MorphKey {
                    name,
                    frame: u32_at(o + 15)?,
                    weight: f32_at(o + 19),
                });
                o += 23;
            }
        }
        Some(VmdFile {
            names,
            bones,
            morphs,
        })
    }

    pub fn last_frame(&self) -> u32 {
        self.bones
            .iter()
            .map(|k| k.frame)
            .chain(self.morphs.iter().map(|k| k.frame))
            .max()
            .unwrap_or(0)
    }

    /// The bone keys as a 30 fps clip on [`mmd_skeleton`]. `names` are the
    /// decoded forms of `self.names`.
    pub fn to_clip(&self, names: &[String]) -> (Skeleton, Clip) {
        let skel = mmd_skeleton();
        let frames = self.last_frame() as usize + 1;
        let n = skel.len();
        let mut rotations = alloc::vec![alloc::vec![Quat::IDENTITY; n]; frames];
        let mut translations = alloc::vec![skel.rest_t.clone(); frames];
        let mut moves = alloc::vec![false; n];
        for j in 0..n {
            let mut keys: Vec<&BoneKey> = self
                .bones
                .iter()
                .filter(|k| names.get(k.name).map(|s| s.as_str()) == Some(skel.names[j].as_str()))
                .collect();
            if keys.is_empty() {
                continue;
            }
            keys.sort_by_key(|k| k.frame);
            let mirror_q = |q: Quat| Quat::new(-q.x, -q.y, q.z, q.w).normalize();
            let mirror_p = |p: Vec3| Vec3::new(p.x, p.y, -p.z);
            if keys.iter().any(|k| k.pos.length() > 1e-9) {
                moves[j] = true;
            }
            let mut k = 0;
            for f in 0..frames {
                while k + 1 < keys.len() && keys[k + 1].frame as usize <= f {
                    k += 1;
                }
                let a = keys[k];
                let (pos, rot) = match keys.get(k + 1) {
                    Some(b) if f > a.frame as usize => {
                        let x = (f as f64 - a.frame as f64) / (b.frame as f64 - a.frame as f64);
                        let e = |c: usize| bezier_ease(x, b.ease[c]);
                        let p = Vec3::new(
                            a.pos.x + (b.pos.x - a.pos.x) * e(0),
                            a.pos.y + (b.pos.y - a.pos.y) * e(1),
                            a.pos.z + (b.pos.z - a.pos.z) * e(2),
                        );
                        (p, a.rot.slerp(b.rot, e(3)))
                    }
                    _ => (a.pos, a.rot),
                };
                rotations[f][j] = mirror_q(rot);
                translations[f][j] = skel.rest_t[j] + mirror_p(pos);
            }
        }
        let times = (0..frames).map(|f| f as f64 / 30.0).collect();
        (
            skel,
            Clip {
                times,
                rotations,
                translations,
                moves,
            },
        )
    }
}

/// Cubic bezier easing from (0, 0) to (1, 1): y at a given x, by bisection.
pub fn bezier_ease(x: f64, c: [f64; 4]) -> f64 {
    let [x1, y1, x2, y2] = c;
    if x1 == y1 && x2 == y2 {
        return x;
    }
    let bez = |t: f64, p1: f64, p2: f64| {
        3.0 * (1.0 - t) * (1.0 - t) * t * p1 + 3.0 * (1.0 - t) * t * t * p2 + t * t * t
    };
    let (mut lo, mut hi) = (0.0, 1.0);
    let mut t = x;
    for _ in 0..24 {
        let bx = bez(t, x1, x2);
        if libm::fabs(bx - x) < 1e-7 {
            break;
        }
        if bx < x {
            lo = t;
        } else {
            hi = t;
        }
        t = (lo + hi) / 2.0;
    }
    bez(t, y1, y2)
}

/// Standard MMD humanoid joints, in MMD units, already mirrored into the
/// right handed space (facing +Z, left on +X). Arms rest 35 degrees down.
pub fn mmd_skeleton() -> Skeleton {
    let a_pose = 35f64.to_radians();
    let s = 1.0 / MMD_UNIT;
    let mut names: Vec<String> = Vec::new();
    let mut parents: Vec<Option<usize>> = Vec::new();
    let mut world: Vec<Vec3> = Vec::new();
    let add = |name: &str,
               parent: Option<&str>,
               p: Vec3,
               names: &mut Vec<String>,
               parents: &mut Vec<Option<usize>>,
               world: &mut Vec<Vec3>| {
        parents.push(parent.and_then(|q| names.iter().position(|n| n == q)));
        names.push(name.into());
        world.push(p);
    };
    let rp = |b: HumanBone| reference_position(b) * s;
    let hips = rp(Hips);
    add(
        "センター",
        None,
        Vec3::new(0.0, hips.y * 0.68, 0.0),
        &mut names,
        &mut parents,
        &mut world,
    );
    add(
        "グルーブ",
        Some("センター"),
        Vec3::new(0.0, hips.y * 0.7, 0.0),
        &mut names,
        &mut parents,
        &mut world,
    );
    add(
        "下半身",
        Some("グルーブ"),
        hips,
        &mut names,
        &mut parents,
        &mut world,
    );
    add(
        "上半身",
        Some("グルーブ"),
        rp(Spine),
        &mut names,
        &mut parents,
        &mut world,
    );
    add(
        "上半身2",
        Some("上半身"),
        rp(Chest),
        &mut names,
        &mut parents,
        &mut world,
    );
    add(
        "首",
        Some("上半身2"),
        rp(Neck),
        &mut names,
        &mut parents,
        &mut world,
    );
    add(
        "頭",
        Some("首"),
        rp(Head),
        &mut names,
        &mut parents,
        &mut world,
    );
    add(
        "左目",
        Some("頭"),
        rp(LeftEye),
        &mut names,
        &mut parents,
        &mut world,
    );
    add(
        "右目",
        Some("頭"),
        rp(RightEye),
        &mut names,
        &mut parents,
        &mut world,
    );
    for (side, sign) in [("左", 1.0), ("右", -1.0)] {
        let pick = |b: HumanBone| if sign > 0.0 { b } else { b.mirror() };
        let n = |x: &str| alloc::format!("{side}{x}");
        let shoulder = rp(pick(LeftUpperArm));
        let down = Quat::from_axis_angle(Vec3::Z, -sign * a_pose);
        let arm = |b: HumanBone| shoulder + down.rotate(rp(pick(b)) - shoulder);
        add(
            &n("足"),
            Some("下半身"),
            rp(pick(LeftUpperLeg)),
            &mut names,
            &mut parents,
            &mut world,
        );
        add(
            &n("ひざ"),
            Some(&n("足")),
            rp(pick(LeftLowerLeg)),
            &mut names,
            &mut parents,
            &mut world,
        );
        add(
            &n("足首"),
            Some(&n("ひざ")),
            rp(pick(LeftFoot)),
            &mut names,
            &mut parents,
            &mut world,
        );
        add(
            &n("つま先"),
            Some(&n("足首")),
            rp(pick(LeftToes)),
            &mut names,
            &mut parents,
            &mut world,
        );
        add(
            &n("肩"),
            Some("上半身2"),
            rp(pick(LeftShoulder)),
            &mut names,
            &mut parents,
            &mut world,
        );
        add(
            &n("腕"),
            Some(&n("肩")),
            shoulder,
            &mut names,
            &mut parents,
            &mut world,
        );
        add(
            &n("ひじ"),
            Some(&n("腕")),
            arm(LeftLowerArm),
            &mut names,
            &mut parents,
            &mut world,
        );
        add(
            &n("手首"),
            Some(&n("ひじ")),
            arm(LeftHand),
            &mut names,
            &mut parents,
            &mut world,
        );
        let fingers: [(&str, [HumanBone; 3], u32); 5] = [
            (
                "親指",
                [LeftThumbMetacarpal, LeftThumbProximal, LeftThumbDistal],
                0,
            ),
            (
                "人指",
                [LeftIndexProximal, LeftIndexIntermediate, LeftIndexDistal],
                1,
            ),
            (
                "中指",
                [LeftMiddleProximal, LeftMiddleIntermediate, LeftMiddleDistal],
                1,
            ),
            (
                "薬指",
                [LeftRingProximal, LeftRingIntermediate, LeftRingDistal],
                1,
            ),
            (
                "小指",
                [LeftLittleProximal, LeftLittleIntermediate, LeftLittleDistal],
                1,
            ),
        ];
        for (fname, segs, first) in fingers {
            let mut parent = n("手首");
            for (k, b) in segs.iter().enumerate() {
                let digit = char::from_u32('０' as u32 + first + k as u32).unwrap_or('0');
                let name = alloc::format!("{side}{fname}{digit}");
                add(
                    &name,
                    Some(&parent),
                    arm(*b),
                    &mut names,
                    &mut parents,
                    &mut world,
                );
                parent = name;
            }
        }
    }
    let rest_t = (0..names.len()).map(|i| match parents[i] {
        Some(p) => world[i] - world[p],
        None => world[i],
    });
    let rest_t: Vec<Vec3> = rest_t.collect();
    let n = names.len();
    Skeleton {
        names,
        parents,
        rest_t,
        rest_r: alloc::vec![Quat::IDENTITY; n],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ease_ends_and_linear() {
        assert!((bezier_ease(0.3, [0.2, 0.2, 0.8, 0.8]) - 0.3).abs() < 1e-12);
        let c = [0.5, 0.0, 0.5, 1.0];
        assert!(bezier_ease(0.0, c).abs() < 1e-6 && (bezier_ease(1.0, c) - 1.0).abs() < 1e-6);
        assert!(bezier_ease(0.2, c) < 0.2);
    }

    #[test]
    fn skeleton_maps_as_mmd() {
        let s = mmd_skeleton();
        let m = rig::map_rig(&s.nodes());
        assert!(m.missing_required.is_empty(), "{:?}", m.missing_required);
        assert_eq!(m.dialect, rig::Dialect::Mmd);
    }
}
