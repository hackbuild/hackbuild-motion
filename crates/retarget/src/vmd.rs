//! MikuMikuDance VMD motions. Bone names are Shift-JIS bytes; the caller
//! decodes them (a browser `TextDecoder("shift_jis")` does) and passes them
//! back, so the crate carries no encoding table.
//!
//! Keys are resampled at MMD's 30 fps with each channel's bezier easing and
//! played on a standard MMD skeleton: arms rest in an A pose about 35
//! degrees down, center and groove carry the body's travel. MMD's left
//! handed space is mirrored on Z so the character faces +Z with its left on
//! +X. The retargeter then treats it as any A pose rig. Legs keyed only by
//! foot IK bones are solved with two bone IK: the knee bends toward the
//! body's facing and the foot keeps the IK bone's world rotation.

use crate::skeleton::{Clip, Skeleton};
use alloc::string::String;
use alloc::vec::Vec;
use organic::{Quat, Vec3};
use rig::bones::HumanBone::{self, *};
use rig::reference::reference_position;

/// The frames `to_clip` writes at most: 20 minutes at 30 fps.
pub const MAX_FRAMES: usize = 36_000;

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
    /// Bone keys with linear easing from already decoded names, for poses
    /// read from text (VPD). `to_clip` takes the same `names`.
    pub fn from_keys(keys: Vec<(usize, u32, Vec3, Quat)>, name_count: usize) -> VmdFile {
        VmdFile {
            names: alloc::vec![Vec::new(); name_count],
            bones: keys
                .into_iter()
                .map(|(name, frame, pos, rot)| BoneKey {
                    name,
                    frame,
                    pos,
                    rot,
                    ease: [[0.0, 0.0, 1.0, 1.0]; 4],
                })
                .collect(),
            morphs: Vec::new(),
        }
    }

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
        // keys past MAX_FRAMES are dropped: a forged key frame would otherwise
        // allocate a frame per index up to it (u32::MAX wraps to 0 on wasm32)
        let frames = (self.last_frame() as u64 + 1).min(MAX_FRAMES as u64) as usize;
        let n = skel.len();
        let mut rotations = alloc::vec![alloc::vec![Quat::IDENTITY; n]; frames];
        let mut translations = alloc::vec![skel.rest_t.clone(); frames];
        let mut moves = alloc::vec![false; n];
        let mirror_q = |q: Quat| Quat::new(-q.x, -q.y, q.z, q.w).normalize();
        let mirror_p = |p: Vec3| Vec3::new(p.x, p.y, -p.z);
        let track = |name: &str| -> Vec<&BoneKey> {
            let mut keys: Vec<&BoneKey> = self
                .bones
                .iter()
                .filter(|k| names.get(k.name).map(|s| s.as_str()) == Some(name))
                .collect();
            keys.sort_by_key(|k| k.frame);
            keys
        };
        for j in 0..n {
            let keys = track(&skel.names[j]);
            if keys.is_empty() {
                continue;
            }
            if keys.iter().any(|k| k.pos.length() > 1e-9) {
                moves[j] = true;
            }
            for (f, (pos, rot)) in sample_keys(&keys, frames).into_iter().enumerate() {
                rotations[f][j] = mirror_q(rot);
                translations[f][j] = skel.rest_t[j] + mirror_p(pos);
            }
        }
        for side in ["左", "右"] {
            let ik = track(&alloc::format!("{side}足ＩＫ"));
            let joint = |x: &str| {
                skel.names
                    .iter()
                    .position(|s| *s == alloc::format!("{side}{x}"))
            };
            let (Some(thigh), Some(knee), Some(ankle)) =
                (joint("足"), joint("ひざ"), joint("足首"))
            else {
                continue;
            };
            // a leg keyed by rotation plays as keyed; IK only drives legs it alone moves
            let bent = |j: usize| {
                track(&skel.names[j])
                    .iter()
                    .any(|k| libm::fabs(k.rot.w) < 0.9999)
            };
            if ik.is_empty() || bent(thigh) || bent(knee) {
                continue;
            }
            let ankle_rest = skel.rest_world().1[ankle];
            for (f, (pos, rot)) in sample_keys(&ik, frames).into_iter().enumerate() {
                let target = ankle_rest + mirror_p(pos);
                solve_leg(
                    &skel,
                    &mut rotations[f],
                    &translations[f],
                    [thigh, knee, ankle],
                    target,
                    mirror_q(rot),
                );
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

/// Position and rotation at every frame from keys sorted by frame, eased
/// between keys with the later key's bezier curves, held past the ends.
fn sample_keys(keys: &[&BoneKey], frames: usize) -> Vec<(Vec3, Quat)> {
    let mut out = Vec::with_capacity(frames);
    let mut k = 0;
    for f in 0..frames {
        while k + 1 < keys.len() && keys[k + 1].frame as usize <= f {
            k += 1;
        }
        let a = keys[k];
        out.push(match keys.get(k + 1) {
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
        });
    }
    out
}

/// Two bone leg IK on one frame. `leg` is thigh, knee and ankle. The knee
/// turns about its own X (MMD knees hinge on the lateral axis) until the
/// hip to ankle distance equals the hip to target distance, clamped to what
/// the leg can reach; the thigh then aims the ankle at the target with the
/// knee toward the hips' facing; the ankle takes `foot` as its world
/// rotation. Rest rotations of the leg are identity, as on [`mmd_skeleton`].
pub fn solve_leg(
    skel: &Skeleton,
    rot: &mut [Quat],
    trans: &[Vec3],
    leg: [usize; 3],
    target: Vec3,
    foot: Quat,
) {
    let [thigh, knee, ankle] = leg;
    let Some(hips) = skel.parents[thigh] else {
        return;
    };
    let (wr, wp) = skel.forward(rot, trans);
    let hip = wp[thigh];
    let to = target - hip;
    if to.length() < 1e-9 {
        return;
    }
    let a = skel.rest_t[knee];
    let b = skel.rest_t[ankle];
    let (la, lb) = (a.length(), b.length());
    let d = to
        .length()
        .clamp(libm::fabs(la - lb) + 1e-6, la + lb - 1e-6);
    // |a + Rx(phi) b| = d, with a.Rx(phi)b = ax bx + c cos(phi) - s sin(phi)
    let c = a.y * b.y + a.z * b.z;
    let s = a.y * b.z - a.z * b.y;
    let rho = libm::sqrt(c * c + s * s);
    let k = if rho < 1e-12 {
        1.0
    } else {
        ((d * d - la * la - lb * lb - 2.0 * a.x * b.x) / (2.0 * rho)).clamp(-1.0, 1.0)
    };
    let phi = libm::acos(k) - libm::atan2(s, c);
    let knee_l = Quat::from_axis_angle(Vec3::X, phi);
    // thigh frame: the ankle along e1, the knee's side of that line along e2
    let v = a + knee_l.rotate(b);
    let e1 = v.normalize();
    let bulge = a - e1 * a.dot(e1);
    let e2 = if bulge.length() > 1e-9 {
        bulge.normalize()
    } else {
        (Vec3::Z - e1 * e1.dot(Vec3::Z)).normalize()
    };
    let local = Quat::from_basis(e1, e2, e1.cross(e2));
    let f1 = to.normalize();
    let fwd = wr[hips].rotate(Vec3::Z);
    let mut f2 = fwd - f1 * fwd.dot(f1);
    if f2.length() < 1e-9 {
        // a leg aimed straight ahead bends its knee upward
        f2 = wr[hips].rotate(Vec3::Y);
        f2 = f2 - f1 * f2.dot(f1);
    }
    let f2 = f2.normalize();
    let world = Quat::from_basis(f1, f2, f1.cross(f2)).mul(local.inverse());
    rot[thigh] = wr[hips].inverse().mul(world).normalize();
    rot[knee] = knee_l.normalize();
    rot[ankle] = world.mul(knee_l).inverse().mul(foot).normalize();
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
    fn leg_file(center: Vec3, ik: Vec3) -> (Vec<String>, VmdFile) {
        let names: Vec<String> = ["センター", "左足ＩＫ", "右足ＩＫ"]
            .iter()
            .map(|s| String::from(*s))
            .collect();
        let keys = alloc::vec![
            (0, 0, center, Quat::IDENTITY),
            (1, 0, ik, Quat::IDENTITY),
            (2, 0, Vec3::ZERO, Quat::IDENTITY)
        ];
        (names, VmdFile::from_keys(keys, 3))
    }

    fn joint(s: &Skeleton, name: &str) -> usize {
        s.names.iter().position(|n| n == name).unwrap()
    }

    #[test]
    fn foot_ik_reaches_with_knee_forward() {
        let hips = reference_position(Hips).y / MMD_UNIT;
        // body down 0.15 hip heights, left foot 0.1 hip heights forward (MMD -Z)
        let (names, f) = leg_file(
            Vec3::new(0.0, -0.15 * hips, 0.0),
            Vec3::new(0.0, 0.0, -0.1 * hips),
        );
        let (skel, clip) = f.to_clip(&names);
        let (_, wp) = skel.pose(&clip, 0);
        let (_, rest) = skel.rest_world();
        let ankle = joint(&skel, "左足首");
        let target = rest[ankle] + Vec3::new(0.0, 0.0, 0.1 * hips);
        let miss = (wp[ankle] - target).length() * MMD_UNIT;
        assert!(miss < 1e-3, "{miss} m");
        let (hip, knee) = (wp[joint(&skel, "左足")], wp[joint(&skel, "左ひざ")]);
        let mid = (hip + wp[ankle]) * 0.5;
        assert!(knee.z > mid.z, "knee behind the leg line");
        // the right foot target sits at rest while the body is lower, so it bends too
        let r = joint(&skel, "右足首");
        assert!((wp[r] - rest[r]).length() * MMD_UNIT < 1e-3);
    }

    #[test]
    fn foot_ik_out_of_reach_clamps() {
        let hips = reference_position(Hips).y / MMD_UNIT;
        let (names, f) = leg_file(Vec3::ZERO, Vec3::new(0.0, -2.0 * hips, 0.0));
        let (skel, clip) = f.to_clip(&names);
        let (_, wp) = skel.pose(&clip, 0);
        assert!(
            wp.iter()
                .all(|p| p.x.is_finite() && p.y.is_finite() && p.z.is_finite())
        );
        let (hip, ankle) = (wp[joint(&skel, "左足")], wp[joint(&skel, "左足首")]);
        let len = skel.rest_t[joint(&skel, "左ひざ")].length()
            + skel.rest_t[joint(&skel, "左足首")].length();
        assert!(((ankle - hip).length() - len).abs() < 1e-3 && ankle.y < hip.y);
    }

    #[test]
    fn leg_keyed_by_rotation_ignores_ik() {
        let names: Vec<String> = ["左足", "左足ＩＫ"]
            .iter()
            .map(|s| String::from(*s))
            .collect();
        let bend = Quat::from_axis_angle(Vec3::X, 0.5);
        let f = VmdFile::from_keys(
            alloc::vec![
                (0, 0, Vec3::ZERO, bend),
                (1, 0, Vec3::new(0.0, 5.0, 0.0), Quat::IDENTITY)
            ],
            2,
        );
        let (skel, clip) = f.to_clip(&names);
        let k = joint(&skel, "左ひざ");
        assert_eq!(clip.rotations[0][k], Quat::IDENTITY);
    }
}
