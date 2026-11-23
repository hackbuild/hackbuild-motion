//! Retargeting, readers, floor and analysis on synthetic rigs whose answer
//! is known.

use organic::{Mulberry32, Quat, Rng, Vec3};
use retarget::analyze::analyze;
use retarget::bvh::parse_bvh;
use retarget::floor::settle_on_floor;
use retarget::golden::sample_bvh;
use retarget::motion::HumanoidMotion;
use retarget::rest_frame::rest_from_first_frame;
use retarget::retarget::{Rig, normalized_world, reference_skeleton, retarget_limb};
use retarget::skeleton::{Clip, Skeleton};
use retarget::vmd::{MMD_UNIT, VmdFile};
use rig::bones::{ALL, HumanBone};
use rig::reference::reference_position;

fn rq(r: &mut Mulberry32, max: f64) -> Quat {
    let axis = Vec3::new(r.next_f64() - 0.5, r.next_f64() - 0.5, r.next_f64() - 0.5).normalize();
    Quat::from_axis_angle(axis, (r.next_f64() * 2.0 - 1.0) * max)
}

/// The reference humanoid with Mixamo names, turned to face -Z, in
/// centimeters, arms lowered into an A pose and every rest rotation scrambled
/// (world joint positions kept).
fn odd_rig(r: &mut Mulberry32) -> Skeleton {
    let base = reference_skeleton();
    let names: Vec<String> = ALL
        .iter()
        .map(|b| {
            let n = b.name();
            let side = if n.starts_with("left") {
                "Left"
            } else if n.starts_with("right") {
                "Right"
            } else {
                ""
            };
            let part = n.trim_start_matches("left").trim_start_matches("right");
            let mix = match part {
                "UpperLeg" => "UpLeg".into(),
                "LowerLeg" => "Leg".into(),
                "Toes" => "ToeBase".into(),
                "UpperArm" => "Arm".into(),
                "LowerArm" => "ForeArm".into(),
                "spine" => "Spine".into(),
                "chest" => "Spine1".into(),
                "upperChest" => "Spine2".into(),
                "hips" => "Hips".into(),
                "neck" => "Neck".into(),
                "head" => "Head".into(),
                "jaw" => "Jaw".into(),
                p if p.starts_with("Thumb")
                    || p.starts_with("Index")
                    || p.starts_with("Middle")
                    || p.starts_with("Ring")
                    || p.starts_with("Little") =>
                {
                    let f = &p[..p
                        .find(|c: char| c.is_uppercase() && p.find(c) != Some(0))
                        .unwrap_or(p.len())];
                    let seg = if p.ends_with("Metacarpal")
                        || p.ends_with("Proximal") && !p.starts_with("Thumb")
                    {
                        1
                    } else if p.ends_with("Intermediate")
                        || (p.starts_with("Thumb") && p.ends_with("Proximal"))
                    {
                        2
                    } else {
                        3
                    };
                    let f = if f == "Little" { "Pinky" } else { f };
                    format!("Hand{f}{seg}")
                }
                p => p.into(),
            };
            format!("mixamorig:{side}{mix}")
        })
        .collect();
    let (_, mut world) = base.rest_world();
    for (side, sign) in [
        (HumanBone::LeftUpperArm, -1.0),
        (HumanBone::RightUpperArm, 1.0),
    ] {
        let pivot = world[side.index()];
        let q = Quat::from_axis_angle(Vec3::Z, sign * 0.6);
        for b in ALL {
            let same = b.side() == side.side();
            let below =
                b.is_finger() || b.name().ends_with("LowerArm") || b.name().ends_with("Hand");
            if same && below {
                world[b.index()] = pivot + q.rotate(world[b.index()] - pivot);
            }
        }
    }
    let turn = Quat::from_axis_angle(Vec3::Y, std::f64::consts::PI);
    let world: Vec<Vec3> = world.iter().map(|p| turn.rotate(*p) * 100.0).collect();
    let rest_world_r: Vec<Quat> = (0..ALL.len()).map(|_| rq(r, 3.0)).collect();
    let mut rest_t = Vec::new();
    let mut rest_r = Vec::new();
    for i in 0..ALL.len() {
        match base.parents[i] {
            Some(p) => {
                rest_t.push(rest_world_r[p].inverse().rotate(world[i] - world[p]));
                rest_r.push(rest_world_r[p].inverse().mul(rest_world_r[i]));
            }
            None => {
                rest_t.push(world[i]);
                rest_r.push(rest_world_r[i]);
            }
        }
    }
    Skeleton {
        names,
        parents: base.parents.clone(),
        rest_t,
        rest_r,
    }
}

fn random_motion(r: &mut Mulberry32, frames: usize) -> HumanoidMotion {
    let mut m = HumanoidMotion::empty((0..frames).map(|f| f as f64 / 30.0).collect());
    for b in ALL {
        if *b == HumanBone::Jaw || *b == HumanBone::LeftEye || *b == HumanBone::RightEye {
            continue;
        }
        m.rotations[b.index()] = Some((0..frames).map(|_| rq(r, 0.8)).collect());
    }
    m.hips = Some(
        (0..frames)
            .map(|f| Vec3::new(f as f64 * 0.01, 0.02 * r.next_f64(), 0.0))
            .collect(),
    );
    m
}

#[test]
fn scrambled_a_pose_rig_round_trips_the_motion() {
    let mut r = Mulberry32::new(11);
    let rig = Rig::new(odd_rig(&mut r), None).expect("maps");
    assert!((rig.unit - 0.01).abs() < 1e-12);
    for _ in 0..5 {
        let m = random_motion(&mut r, 12);
        let back = rig.to_humanoid(&rig.bind(&m));
        let mut worst: f64 = 0.0;
        for f in 0..m.frames() {
            let a = normalized_world(&m, f);
            let b = normalized_world(&back, f);
            for bone in ALL {
                if m.has(*bone) && rig.map.node(*bone).is_some() {
                    worst = worst.max(a[bone.index()].angle_to(b[bone.index()]));
                }
            }
            let (ha, hb) = (m.hips.as_ref().unwrap()[f], back.hips.as_ref().unwrap()[f]);
            assert!((ha - hb).length() < 1e-9);
        }
        assert!(worst < 1e-6, "worst {worst}");
    }
}

#[test]
fn a_pose_rig_shows_reference_bone_directions() {
    // bind a motion onto the odd rig: every mapped bone must point where the
    // reference body's bone points under the same motion, after the facing fix
    let mut r = Mulberry32::new(12);
    let rig = Rig::new(odd_rig(&mut r), None).unwrap();
    let m = random_motion(&mut r, 6);
    let clip = rig.bind(&m);
    for f in 0..m.frames() {
        let (_, wp) = rig.skeleton.pose(&clip, f);
        let (rp, _) = retarget::analyze::reference_pose(&m, f);
        for (a, b) in [
            (HumanBone::LeftUpperArm, HumanBone::LeftLowerArm),
            (HumanBone::RightLowerLeg, HumanBone::RightFoot),
            (HumanBone::Spine, HumanBone::Chest),
        ] {
            let d = (rig
                .fix
                .rotate(wp[rig.map.node(b).unwrap()] - wp[rig.map.node(a).unwrap()]))
            .normalize();
            let e = (rp[b.index()] - rp[a.index()]).normalize();
            assert!((d - e).length() < 1e-9, "{} frame {f}", a.name());
        }
    }
}

#[test]
fn hips_travel_scales_with_hip_height() {
    let mut r = Mulberry32::new(13);
    let small = {
        let mut s = reference_skeleton();
        for t in s.rest_t.iter_mut() {
            *t = *t * 0.5;
        }
        s
    };
    let big = Rig::new(reference_skeleton(), None).unwrap();
    let small = Rig::new(small, None).unwrap();
    let m = random_motion(&mut r, 4);
    let a = big.bind(&m);
    let b = small.bind(&m);
    let hip = big.map.node(HumanBone::Hips).unwrap();
    let da = a.translations[3][hip] - big.skeleton.rest_t[hip];
    let db = b.translations[3][hip] - small.skeleton.rest_t[hip];
    assert!((da * 0.5 - db).length() < 1e-9);
    let t = retarget_limb(
        Vec3::ZERO,
        Vec3::new(0.0, -0.8, 0.0),
        0.8,
        Vec3::new(1.0, 1.0, 0.0),
        0.4,
    );
    assert!((t - Vec3::new(1.0, 0.6, 0.0)).length() < 1e-12);
}

#[test]
fn bvh_retargets_and_walks() {
    let text = sample_bvh(3, 60);
    let (skel, clip) = parse_bvh(&text).unwrap();
    let rig = Rig::new(skel, None).unwrap();
    assert!((rig.unit - 0.01).abs() < 1e-12);
    let mut m = rig.to_humanoid(&clip);
    m.start_at_origin();
    assert!(m.hips.as_ref().unwrap()[0].x.abs() < 1e-12);
    // 60 frames at 4 cm forward each is 2.4 m of travel
    assert!(analyze(&m).tags.contains(&"walk"));
}

#[test]
fn t_pose_first_frame_becomes_rest() {
    // rest with legs splayed 25 degrees, first frame turns them straight
    let mut s = reference_skeleton();
    let splay = 25f64.to_radians();
    let li = HumanBone::LeftUpperLeg.index();
    let ri = HumanBone::RightUpperLeg.index();
    s.rest_r[li] = Quat::from_axis_angle(Vec3::Z, splay);
    s.rest_r[ri] = Quat::from_axis_angle(Vec3::Z, -splay);
    let n = s.len();
    let mut rot = vec![s.rest_r.clone(); 3];
    rot[0][li] = Quat::IDENTITY;
    rot[0][ri] = Quat::IDENTITY;
    let clip = Clip {
        times: vec![0.0, 1.0 / 30.0, 2.0 / 30.0],
        rotations: rot,
        translations: vec![s.rest_t.clone(); 3],
        moves: vec![false; n],
    };
    let (s2, c2) = rest_from_first_frame(&s, &clip).expect("first frame is the better T pose");
    assert_eq!(s2.rest_r[li], Quat::IDENTITY);
    assert_eq!(c2.frames(), 2);
    assert!(rest_from_first_frame(&s2, &c2).is_none());
}

#[test]
fn floor_settles_small_offsets_only() {
    let mut m = HumanoidMotion::empty(vec![0.0, 0.5, 1.0]);
    let h = reference_position(HumanBone::Hips).y;
    m.hips = Some(vec![Vec3::new(0.0, 0.04 / h, 0.0); 3]);
    let shift = settle_on_floor(&mut m);
    assert!((shift - 0.04).abs() < 1e-9, "{shift}");
    assert!(m.hips.as_ref().unwrap()[0].y.abs() < 1e-9);
    let mut air = HumanoidMotion::empty(vec![0.0, 1.0]);
    air.hips = Some(vec![Vec3::new(0.0, 0.5, 0.0); 2]);
    assert_eq!(settle_on_floor(&mut air), 0.0);
}

#[test]
fn analysis_tags_known_motions() {
    let frames = 60;
    let times: Vec<f64> = (0..frames).map(|f| f as f64 / 30.0).collect();
    let mut wave = HumanoidMotion::empty(times.clone());
    // right arm raised above the head, forearm swinging side to side
    wave.rotations[HumanBone::RightUpperArm.index()] =
        Some(vec![Quat::from_axis_angle(Vec3::Z, -1.9); frames]);
    wave.rotations[HumanBone::RightLowerArm.index()] = Some(
        (0..frames)
            .map(|f| Quat::from_axis_angle(Vec3::Z, 0.5 * (f as f64 * 0.6).sin()))
            .collect(),
    );
    wave.hips = Some(vec![Vec3::ZERO; frames]);
    assert!(
        analyze(&wave).tags.contains(&"wave"),
        "{:?}",
        analyze(&wave).tags
    );
    let mut squat = HumanoidMotion::empty(times.clone());
    squat.hips = Some(
        (0..frames)
            .map(|f| {
                Vec3::new(
                    0.0,
                    -0.4 * (f as f64 / 59.0 * std::f64::consts::PI).sin(),
                    0.0,
                )
            })
            .collect(),
    );
    assert!(analyze(&squat).tags.contains(&"squat"));
    let mut spin = HumanoidMotion::empty(times.clone());
    spin.rotations[HumanBone::Hips.index()] = Some(
        (0..frames)
            .map(|f| Quat::from_axis_angle(Vec3::Y, f as f64 / 59.0 * 7.0))
            .collect(),
    );
    spin.hips = Some(vec![Vec3::ZERO; frames]);
    assert!(analyze(&spin).tags.contains(&"spin"));
    let mut nod = HumanoidMotion::empty(times.clone());
    nod.rotations[HumanBone::Head.index()] = Some(
        (0..frames)
            .map(|f| Quat::from_axis_angle(Vec3::X, 0.3 * (f as f64 * 0.5).sin()))
            .collect(),
    );
    nod.hips = Some(vec![Vec3::ZERO; frames]);
    let t = analyze(&nod).tags;
    assert!(t.contains(&"nod") && !t.contains(&"shake head"), "{t:?}");
    let still = HumanoidMotion {
        hips: Some(vec![Vec3::ZERO; frames]),
        ..HumanoidMotion::empty(times)
    };
    assert!(analyze(&still).tags.contains(&"pose"));
}

#[test]
fn pack_round_trip() {
    let mut r = Mulberry32::new(14);
    let m = random_motion(&mut r, 5);
    let b = m.pack();
    let u = HumanoidMotion::unpack(&b).unwrap();
    assert_eq!(u.frames(), 5);
    for bone in ALL {
        assert_eq!(m.has(*bone), u.has(*bone));
        if m.has(*bone) {
            assert!(m.rotation(*bone, 3).angle_to(u.rotation(*bone, 3)) < 1e-3);
        }
    }
    assert!(HumanoidMotion::unpack(&b[..10]).is_none());
}

type Key<'a> = (&'a [u8], u32, [f32; 3], [f32; 4]);

fn vmd_bytes(keys: &[Key]) -> Vec<u8> {
    let mut b = Vec::new();
    let mut header = b"Vocaloid Motion Data 0002".to_vec();
    header.resize(30, 0);
    b.extend_from_slice(&header);
    b.extend_from_slice(&[0u8; 20]);
    b.extend_from_slice(&(keys.len() as u32).to_le_bytes());
    for (name, frame, pos, rot) in keys {
        let mut n = name.to_vec();
        n.resize(15, 0);
        b.extend_from_slice(&n);
        b.extend_from_slice(&frame.to_le_bytes());
        for x in pos.iter().chain(rot.iter()) {
            b.extend_from_slice(&x.to_le_bytes());
        }
        let mut ip = vec![0u8; 64];
        for c in 0..4 {
            ip[c] = 20;
            ip[c + 4] = 20;
            ip[c + 8] = 107;
            ip[c + 12] = 107;
        }
        b.extend_from_slice(&ip);
    }
    b.extend_from_slice(&0u32.to_le_bytes());
    b
}

#[test]
fn vmd_a_pose_comes_out_as_arms_down() {
    // two keys on the left arm (name bytes stand in for the Shift-JIS; the
    // decoded names are passed alongside) and a center key that moves
    let bytes = vmd_bytes(&[
        (b"ARM", 0, [0.0; 3], [0.0, 0.0, 0.0, 1.0]),
        (b"ARM", 10, [0.0; 3], [0.0, 0.0, 0.0, 1.0]),
        (b"CTR", 10, [0.0, 0.0, 5.0], [0.0, 0.0, 0.0, 1.0]),
    ]);
    let vmd = VmdFile::parse(&bytes).unwrap();
    assert_eq!(vmd.bones.len(), 3);
    let names: Vec<String> = vmd
        .names
        .iter()
        .map(|n| {
            if n == b"ARM" {
                "左腕".to_string()
            } else {
                "センター".to_string()
            }
        })
        .collect();
    let (skel, clip) = vmd.to_clip(&names);
    assert_eq!(clip.frames(), 11);
    let rig = Rig::new(skel, Some(MMD_UNIT)).unwrap();
    let m = rig.to_humanoid(&clip);
    let n = normalized_world(&m, 0);
    let dir = n[HumanBone::LeftUpperArm.index()].rotate(Vec3::X);
    let down = (-dir.y).asin().to_degrees();
    assert!((down - 35.0).abs() < 1e-6, "{down}");
    // the center moved 5 units along MMD z, which is -z here: 0.4 m back
    let hips = m.hips.as_ref().unwrap()[10] * rig.hips_height;
    assert!((hips.z + 0.4).abs() < 1e-6, "{hips:?}");
}
