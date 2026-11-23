//! The mapper on bone name sets from real exporters. Each set is written as
//! `name < parent` lines; expectations name the source bone for a VRM bone.
//! Sets: Mixamo (prefixed), Ready Player Me style (Mixamo names without the
//! prefix), Quaternius UAL (Unreal mannequin names), Unreal 5 manny, VRoid
//! VRM export, Meshy humanoid (inferred), CMU BVH, 3ds Max Biped, Rigify
//! deform bones, SMPL, Xsens, Character Creator, MMD, and a Meshy dog rig.

use organic::{Mulberry32, Rng};
use rig::bones::{HumanBone, REQUIRED};
use rig::chain::limb_chains;
use rig::{RigNode, map_rig};

fn parse_set(text: &str) -> Vec<RigNode> {
    let lines: Vec<(&str, Option<&str>)> = text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(|l| match l.split_once(" < ") {
            Some((n, p)) => (n.trim(), Some(p.trim())),
            None => (l, None),
        })
        .collect();
    lines
        .iter()
        .map(|(n, p)| RigNode {
            name: (*n).into(),
            parent: p.and_then(|p| lines.iter().position(|(m, _)| *m == p)),
        })
        .collect()
}

/// Mixamo style arm and hand chain for one side, with a name prefix.
fn mixamo_arm(pre: &str, side: &str, parent: &str) -> String {
    let mut s = format!(
        "{pre}{side}Shoulder < {parent}\n{pre}{side}Arm < {pre}{side}Shoulder\n{pre}{side}ForeArm < {pre}{side}Arm\n{pre}{side}Hand < {pre}{side}ForeArm\n"
    );
    for f in ["Thumb", "Index", "Middle", "Ring", "Pinky"] {
        let mut p = format!("{pre}{side}Hand");
        for k in 1..=4 {
            let n = format!("{pre}{side}Hand{f}{k}");
            s += &format!("{n} < {p}\n");
            p = n;
        }
    }
    s
}

fn mixamo(pre: &str) -> String {
    let mut s = format!(
        "{pre}Hips\n{pre}Spine < {pre}Hips\n{pre}Spine1 < {pre}Spine\n{pre}Spine2 < {pre}Spine1\n{pre}Neck < {pre}Spine2\n{pre}Head < {pre}Neck\n{pre}HeadTop_End < {pre}Head\n{pre}LeftEye < {pre}Head\n{pre}RightEye < {pre}Head\n"
    );
    for side in ["Left", "Right"] {
        s += &mixamo_arm(pre, side, &format!("{pre}Spine2"));
        s += &format!(
            "{pre}{side}UpLeg < {pre}Hips\n{pre}{side}Leg < {pre}{side}UpLeg\n{pre}{side}Foot < {pre}{side}Leg\n{pre}{side}ToeBase < {pre}{side}Foot\n{pre}{side}Toe_End < {pre}{side}ToeBase\n"
        );
    }
    s
}

fn unreal(spines: usize, twist: bool) -> String {
    let mut s = String::from("root\npelvis < root\n");
    let mut p = "pelvis".to_string();
    for k in 1..=spines {
        let n = format!("spine_{k:02}");
        s += &format!("{n} < {p}\n");
        p = n;
    }
    let top = p.clone();
    s += &format!("neck_01 < {top}\nneck_02 < neck_01\nHead < neck_02\n");
    for side in ["l", "r"] {
        s += &format!(
            "clavicle_{side} < {top}\nupperarm_{side} < clavicle_{side}\nlowerarm_{side} < upperarm_{side}\nhand_{side} < lowerarm_{side}\n"
        );
        if twist {
            s += &format!(
                "upperarm_twist_01_{side} < upperarm_{side}\nlowerarm_twist_01_{side} < lowerarm_{side}\nindex_metacarpal_{side} < hand_{side}\n"
            );
        }
        for f in ["thumb", "index", "middle", "ring", "pinky"] {
            let mut p = format!("hand_{side}");
            for k in 1..=3 {
                let n = format!("{f}_{k:02}_{side}");
                s += &format!("{n} < {p}\n");
                p = n;
            }
        }
        s += &format!(
            "thigh_{side} < pelvis\ncalf_{side} < thigh_{side}\nfoot_{side} < calf_{side}\nball_{side} < foot_{side}\n"
        );
        if twist {
            s += &format!("thigh_twist_01_{side} < thigh_{side}\nik_foot_{side} < root\n");
        }
    }
    s
}

fn vroid() -> String {
    let mut s = String::from(
        "Root\nJ_Bip_C_Hips < Root\nJ_Bip_C_Spine < J_Bip_C_Hips\nJ_Bip_C_Chest < J_Bip_C_Spine\nJ_Bip_C_UpperChest < J_Bip_C_Chest\nJ_Bip_C_Neck < J_Bip_C_UpperChest\nJ_Bip_C_Head < J_Bip_C_Neck\nJ_Adj_L_FaceEye < J_Bip_C_Head\nJ_Adj_R_FaceEye < J_Bip_C_Head\nJ_Sec_Hair1_01 < J_Bip_C_Head\n",
    );
    for side in ["L", "R"] {
        s += &format!(
            "J_Bip_{side}_Shoulder < J_Bip_C_UpperChest\nJ_Bip_{side}_UpperArm < J_Bip_{side}_Shoulder\nJ_Bip_{side}_LowerArm < J_Bip_{side}_UpperArm\nJ_Bip_{side}_Hand < J_Bip_{side}_LowerArm\n"
        );
        for f in ["Thumb", "Index", "Middle", "Ring", "Little"] {
            let mut p = format!("J_Bip_{side}_Hand");
            for k in 1..=3 {
                let n = format!("J_Bip_{side}_{f}{k}");
                s += &format!("{n} < {p}\n");
                p = n;
            }
        }
        s += &format!(
            "J_Bip_{side}_UpperLeg < J_Bip_C_Hips\nJ_Bip_{side}_LowerLeg < J_Bip_{side}_UpperLeg\nJ_Bip_{side}_Foot < J_Bip_{side}_LowerLeg\nJ_Bip_{side}_ToeBase < J_Bip_{side}_Foot\n"
        );
    }
    s
}

const MESHY: &str = "Armature
Hips < Armature
Spine02 < Hips
Spine01 < Spine02
Spine < Spine01
neck < Spine
Head < neck
head_end < Head
headfront < Head
LeftShoulder < Spine
LeftArm < LeftShoulder
LeftForeArm < LeftArm
LeftHand < LeftForeArm
RightShoulder < Spine
RightArm < RightShoulder
RightForeArm < RightArm
RightHand < RightForeArm
LeftUpLeg < Hips
LeftLeg < LeftUpLeg
LeftFoot < LeftLeg
LeftToeBase < LeftFoot
RightUpLeg < Hips
RightLeg < RightUpLeg
RightFoot < RightLeg
RightToeBase < RightFoot";

const CMU: &str = "Hips
LHipJoint < Hips
LeftUpLeg < LHipJoint
LeftLeg < LeftUpLeg
LeftFoot < LeftLeg
LeftToeBase < LeftFoot
RHipJoint < Hips
RightUpLeg < RHipJoint
RightLeg < RightUpLeg
RightFoot < RightLeg
RightToeBase < RightFoot
LowerBack < Hips
Spine < LowerBack
Spine1 < Spine
Neck < Spine1
Neck1 < Neck
Head < Neck1
LeftShoulder < Spine1
LeftArm < LeftShoulder
LeftForeArm < LeftArm
LeftHand < LeftForeArm
LeftFingerBase < LeftHand
LThumb < LeftHand
RightShoulder < Spine1
RightArm < RightShoulder
RightForeArm < RightArm
RightHand < RightForeArm
RightFingerBase < RightHand
RThumb < RightHand";

const BIPED: &str = "Bip01
Bip01 Pelvis < Bip01
Bip01 Spine < Bip01 Pelvis
Bip01 Spine1 < Bip01 Spine
Bip01 Spine2 < Bip01 Spine1
Bip01 Neck < Bip01 Spine2
Bip01 Head < Bip01 Neck
Bip01 HeadNub < Bip01 Head
Bip01 L Clavicle < Bip01 Neck
Bip01 L UpperArm < Bip01 L Clavicle
Bip01 L Forearm < Bip01 L UpperArm
Bip01 L ForeTwist < Bip01 L Forearm
Bip01 L Hand < Bip01 L Forearm
Bip01 L Finger0 < Bip01 L Hand
Bip01 L Finger01 < Bip01 L Finger0
Bip01 R Clavicle < Bip01 Neck
Bip01 R UpperArm < Bip01 R Clavicle
Bip01 R Forearm < Bip01 R UpperArm
Bip01 R Hand < Bip01 R Forearm
Bip01 L Thigh < Bip01 Pelvis
Bip01 L Calf < Bip01 L Thigh
Bip01 L Foot < Bip01 L Calf
Bip01 L Toe0 < Bip01 L Foot
Bip01 R Thigh < Bip01 Pelvis
Bip01 R Calf < Bip01 R Thigh
Bip01 R Foot < Bip01 R Calf
Bip01 R Toe0 < Bip01 R Foot";

const RIGIFY: &str = "DEF-spine
DEF-spine.001 < DEF-spine
DEF-spine.002 < DEF-spine.001
DEF-spine.003 < DEF-spine.002
DEF-spine.004 < DEF-spine.003
DEF-spine.005 < DEF-spine.004
DEF-spine.006 < DEF-spine.005
DEF-shoulder.L < DEF-spine.003
DEF-upper_arm.L < DEF-shoulder.L
DEF-upper_arm.L.001 < DEF-upper_arm.L
DEF-forearm.L < DEF-upper_arm.L.001
DEF-forearm.L.001 < DEF-forearm.L
DEF-hand.L < DEF-forearm.L.001
DEF-f_index.01.L < DEF-hand.L
DEF-f_index.02.L < DEF-f_index.01.L
DEF-f_index.03.L < DEF-f_index.02.L
DEF-thumb.01.L < DEF-hand.L
DEF-shoulder.R < DEF-spine.003
DEF-upper_arm.R < DEF-shoulder.R
DEF-forearm.R < DEF-upper_arm.R
DEF-hand.R < DEF-forearm.R
DEF-thigh.L < DEF-spine
DEF-thigh.L.001 < DEF-thigh.L
DEF-shin.L < DEF-thigh.L.001
DEF-foot.L < DEF-shin.L
DEF-toe.L < DEF-foot.L
DEF-thigh.R < DEF-spine
DEF-shin.R < DEF-thigh.R
DEF-foot.R < DEF-shin.R
DEF-toe.R < DEF-foot.R";

const SMPL: &str = "Pelvis
L_Hip < Pelvis
R_Hip < Pelvis
Spine1 < Pelvis
L_Knee < L_Hip
R_Knee < R_Hip
Spine2 < Spine1
L_Ankle < L_Knee
R_Ankle < R_Knee
Spine3 < Spine2
L_Foot < L_Ankle
R_Foot < R_Ankle
Neck < Spine3
L_Collar < Spine3
R_Collar < Spine3
Head < Neck
L_Shoulder < L_Collar
R_Shoulder < R_Collar
L_Elbow < L_Shoulder
R_Elbow < R_Shoulder
L_Wrist < L_Elbow
R_Wrist < R_Elbow
L_Hand < L_Wrist
R_Hand < R_Wrist";

const XSENS: &str = "Pelvis
L5 < Pelvis
L3 < L5
T12 < L3
T8 < T12
Neck < T8
Head < Neck
RightShoulder < T8
RightUpperArm < RightShoulder
RightForeArm < RightUpperArm
RightHand < RightForeArm
LeftShoulder < T8
LeftUpperArm < LeftShoulder
LeftForeArm < LeftUpperArm
LeftHand < LeftForeArm
RightUpperLeg < Pelvis
RightLowerLeg < RightUpperLeg
RightFoot < RightLowerLeg
RightToe < RightFoot
LeftUpperLeg < Pelvis
LeftLowerLeg < LeftUpperLeg
LeftFoot < LeftLowerLeg
LeftToe < LeftFoot";

const CC: &str = "CC_Base_BoneRoot
CC_Base_Hip < CC_Base_BoneRoot
CC_Base_Pelvis < CC_Base_Hip
CC_Base_L_Thigh < CC_Base_Pelvis
CC_Base_L_Calf < CC_Base_L_Thigh
CC_Base_L_Foot < CC_Base_L_Calf
CC_Base_L_ToeBase < CC_Base_L_Foot
CC_Base_R_Thigh < CC_Base_Pelvis
CC_Base_R_Calf < CC_Base_R_Thigh
CC_Base_R_Foot < CC_Base_R_Calf
CC_Base_Waist < CC_Base_Hip
CC_Base_Spine01 < CC_Base_Waist
CC_Base_Spine02 < CC_Base_Spine01
CC_Base_NeckTwist01 < CC_Base_Spine02
CC_Base_NeckTwist02 < CC_Base_NeckTwist01
CC_Base_Head < CC_Base_NeckTwist02
CC_Base_L_Clavicle < CC_Base_Spine02
CC_Base_L_Upperarm < CC_Base_L_Clavicle
CC_Base_L_Forearm < CC_Base_L_Upperarm
CC_Base_L_Hand < CC_Base_L_Forearm
CC_Base_R_Clavicle < CC_Base_Spine02
CC_Base_R_Upperarm < CC_Base_R_Clavicle
CC_Base_R_Forearm < CC_Base_R_Upperarm
CC_Base_R_Hand < CC_Base_R_Forearm";

const MMD: &str = "センター
グルーブ < センター
下半身 < グルーブ
上半身 < グルーブ
上半身2 < 上半身
首 < 上半身2
頭 < 首
左目 < 頭
右目 < 頭
左肩 < 上半身2
左腕 < 左肩
左ひじ < 左腕
左手首 < 左ひじ
左親指０ < 左手首
左親指１ < 左親指０
左親指２ < 左親指１
左人指１ < 左手首
左人指２ < 左人指１
左人指３ < 左人指２
右肩 < 上半身2
右腕 < 右肩
右ひじ < 右腕
右手首 < 右ひじ
左足 < 下半身
左ひざ < 左足
左足首 < 左ひざ
左つま先 < 左足首
右足 < 下半身
右ひざ < 右足
右足首 < 右ひざ
左足D < 下半身
右足D < 下半身";

/// A Meshy quadruped dog rig, bone names as an earlier dog simulator required them.
const DOG: &str = "root
hips < root
spine2 < hips
spine_03 < spine2
chest < spine_03
neck1 < chest
head < neck1
ear.L_01 < head
ear.R_01 < head
clavicle.L < chest
frontUpr.L < clavicle.L
frontLeg.L_03 < frontUpr.L
frontHorselink.L < frontLeg.L_03
frontToe.L < frontHorselink.L
clavicle.R < chest
frontUpr.R < clavicle.R
frontLeg.R_03 < frontUpr.R
frontHorselink.R < frontLeg.R_03
frontToe.R < frontHorselink.R
rearUpr.L < hips
rearLwr.L < rearUpr.L
rearHorselink.L < rearLwr.L
rearFoot.L < rearHorselink.L
rearToe.L < rearFoot.L
rearUpr.R < hips
rearLwr.R < rearUpr.R
rearHorselink.R < rearLwr.R
rearFoot.R < rearHorselink.R
rearToe.R < rearFoot.R
tail1 < hips
tail3 < tail1
tail_03 < tail3";

fn check(label: &str, text: &str, expect: &[(HumanBone, &str)], full: bool) {
    let nodes = parse_set(text);
    let m = map_rig(&nodes);
    if full {
        assert!(
            m.missing_required.is_empty(),
            "{label}: missing {:?}",
            m.missing_required
        );
    }
    for (b, want) in expect {
        let got = m.node(*b).map(|i| nodes[i].name.as_str());
        assert_eq!(got, Some(*want), "{label}: {}", b.name());
    }
    // a bone is never claimed twice
    let mut seen = std::collections::HashSet::new();
    for b in m.bones.iter().flatten() {
        assert!(seen.insert(*b), "{label}: {} twice", b.name());
    }
}

use HumanBone::*;

#[test]
fn mixamo_prefixed() {
    let text = mixamo("mixamorig:");
    check(
        "mixamo",
        &text,
        &[
            (Spine, "mixamorig:Spine"),
            (UpperChest, "mixamorig:Spine2"),
            (LeftUpperArm, "mixamorig:LeftArm"),
            (LeftToes, "mixamorig:LeftToeBase"),
            (LeftThumbMetacarpal, "mixamorig:LeftHandThumb1"),
            (LeftIndexDistal, "mixamorig:LeftHandIndex3"),
            (RightLittleProximal, "mixamorig:RightHandPinky1"),
            (LeftEye, "mixamorig:LeftEye"),
        ],
        true,
    );
    let m = map_rig(&parse_set(&text));
    assert_eq!(m.dialect.name(), "mixamo");
    // Index4 is the fingertip leaf; it maps to nothing
    let nodes = parse_set(&text);
    let tip = nodes
        .iter()
        .position(|n| n.name == "mixamorig:LeftHandIndex4")
        .unwrap();
    assert_eq!(m.bones[tip], None);
}

#[test]
fn ready_player_me_style() {
    let text = format!(
        "Armature\n{}",
        mixamo("").replacen("Hips\n", "Hips < Armature\n", 1)
    );
    check(
        "rpm",
        &text,
        &[
            (Hips, "Hips"),
            (Chest, "Spine1"),
            (RightLowerArm, "RightForeArm"),
        ],
        true,
    );
    assert_eq!(map_rig(&parse_set(&text)).dialect.name(), "mixamo-like");
}

#[test]
fn ual_and_unreal() {
    check(
        "ual",
        &unreal(3, false),
        &[
            (Hips, "pelvis"),
            (Spine, "spine_01"),
            (UpperChest, "spine_03"),
            (Neck, "neck_01"),
            (LeftToes, "ball_l"),
            (LeftThumbMetacarpal, "thumb_01_l"),
            (RightRingDistal, "ring_03_r"),
        ],
        true,
    );
    let ue5 = unreal(5, true);
    check(
        "ue5",
        &ue5,
        &[
            (Chest, "spine_02"),
            (UpperChest, "spine_05"),
            (LeftUpperArm, "upperarm_l"),
            (LeftLowerLeg, "calf_l"),
        ],
        true,
    );
    let nodes = parse_set(&ue5);
    let m = map_rig(&nodes);
    assert!(
        m.helpers
            .iter()
            .any(|&i| nodes[i].name == "upperarm_twist_01_l")
    );
    assert!(m.helpers.iter().any(|&i| nodes[i].name == "ik_foot_l"));
    assert_eq!(m.dialect.name(), "unreal");
}

#[test]
fn vroid_vrm() {
    check(
        "vroid",
        &vroid(),
        &[
            (Hips, "J_Bip_C_Hips"),
            (UpperChest, "J_Bip_C_UpperChest"),
            (LeftEye, "J_Adj_L_FaceEye"),
            (LeftLittleDistal, "J_Bip_L_Little3"),
            (RightThumbProximal, "J_Bip_R_Thumb2"),
        ],
        true,
    );
}

#[test]
fn meshy_humanoid() {
    check(
        "meshy",
        MESHY,
        &[
            (Spine, "Spine02"),
            (UpperChest, "Spine"),
            (Neck, "neck"),
            (Head, "Head"),
        ],
        true,
    );
}

#[test]
fn cmu_bvh() {
    check(
        "cmu",
        CMU,
        &[
            (LeftUpperLeg, "LeftUpLeg"),
            (Spine, "LowerBack"),
            (UpperChest, "Spine1"),
            (Neck, "Neck"),
        ],
        true,
    );
}

#[test]
fn max_biped() {
    check(
        "biped",
        BIPED,
        &[
            (Hips, "Bip01 Pelvis"),
            (LeftShoulder, "Bip01 L Clavicle"),
            (LeftLowerLeg, "Bip01 L Calf"),
            (LeftToes, "Bip01 L Toe0"),
        ],
        true,
    );
}

#[test]
fn rigify_deform() {
    check(
        "rigify",
        RIGIFY,
        &[
            (Hips, "DEF-spine"),
            (Head, "DEF-spine.006"),
            (Neck, "DEF-spine.004"),
            (LeftUpperArm, "DEF-upper_arm.L"),
            (LeftLowerLeg, "DEF-shin.L"),
            (LeftIndexProximal, "DEF-f_index.01.L"),
        ],
        true,
    );
}

#[test]
fn smpl_xsens_cc() {
    check(
        "smpl",
        SMPL,
        &[
            (LeftUpperArm, "L_Shoulder"),
            (LeftToes, "L_Foot"),
            (LeftHand, "L_Wrist"),
        ],
        true,
    );
    check(
        "xsens",
        XSENS,
        &[
            (Spine, "L5"),
            (LeftUpperArm, "LeftUpperArm"),
            (LeftToes, "LeftToe"),
        ],
        false,
    );
    check(
        "cc",
        CC,
        &[
            (Hips, "CC_Base_Hip"),
            (Spine, "CC_Base_Waist"),
            (LeftUpperArm, "CC_Base_L_Upperarm"),
        ],
        false,
    );
}

#[test]
fn mmd_names() {
    check(
        "mmd",
        MMD,
        &[
            (Hips, "下半身"),
            (Chest, "上半身2"),
            (LeftLowerArm, "左ひじ"),
            (LeftThumbMetacarpal, "左親指０"),
            (LeftIndexProximal, "左人指１"),
        ],
        true,
    );
    let m = map_rig(&parse_set(MMD));
    assert_eq!(m.dialect.name(), "mmd");
    assert_eq!(m.deform.len(), 2);
}

#[test]
fn dog_is_not_a_humanoid_but_has_four_legs() {
    let nodes = parse_set(DOG);
    let m = map_rig(&nodes);
    assert!(!m.missing_required.is_empty());
    let chains = limb_chains(&nodes, None);
    let get = |n: &str| {
        chains
            .iter()
            .find(|c| c.name == n)
            .unwrap_or_else(|| panic!("{n} missing"))
    };
    let names = |n: &str| {
        get(n)
            .bones
            .iter()
            .map(|&i| nodes[i].name.as_str())
            .collect::<Vec<_>>()
    };
    assert_eq!(
        names("LF"),
        [
            "frontUpr.L",
            "frontLeg.L_03",
            "frontHorselink.L",
            "frontToe.L"
        ]
    );
    assert_eq!(
        names("RH"),
        [
            "rearUpr.R",
            "rearLwr.R",
            "rearHorselink.R",
            "rearFoot.R",
            "rearToe.R"
        ]
    );
    assert_eq!(names("tail"), ["tail1", "tail3", "tail_03"]);
    assert_eq!(names("earL"), ["ear.L_01"]);
    assert_eq!(names("neck"), ["neck1"]);
    assert_eq!(names("spine"), ["hips", "spine2", "spine_03", "chest"]);
}

/// Property: node order, namespaces and FBX duplicate children do not change
/// which source name each bone maps to.
#[test]
fn mapping_is_stable_under_order_namespace_and_duplicates() {
    let sets = [
        mixamo(""),
        unreal(3, true),
        vroid(),
        MESHY.to_string(),
        CMU.to_string(),
        SMPL.to_string(),
    ];
    let mut rng = Mulberry32::new(77);
    for text in &sets {
        let nodes = parse_set(text);
        let base = map_rig(&nodes);
        let want: Vec<(HumanBone, String)> = REQUIRED
            .iter()
            .filter_map(|b| base.node(*b).map(|i| (*b, nodes[i].name.clone())))
            .collect();
        for _ in 0..20 {
            // shuffle
            let n = nodes.len();
            let mut perm: Vec<usize> = (0..n).collect();
            for i in (1..n).rev() {
                let j = (rng.next_f64() * (i + 1) as f64) as usize;
                perm.swap(i, j);
            }
            let ns = if rng.next_f64() < 0.5 {
                "Armature|"
            } else {
                "rig:"
            };
            let mut shuffled: Vec<RigNode> = perm
                .iter()
                .map(|&o| RigNode {
                    name: format!("{ns}{}", nodes[o].name),
                    parent: nodes[o]
                        .parent
                        .map(|p| perm.iter().position(|&x| x == p).unwrap()),
                })
                .collect();
            // an FBX style duplicate child of a random node
            let d = (rng.next_f64() * n as f64) as usize;
            shuffled.push(RigNode {
                name: shuffled[d].name.clone(),
                parent: Some(d),
            });
            let m = map_rig(&shuffled);
            for (b, name) in &want {
                let got = m.node(*b).map(|i| shuffled[i].name.clone());
                assert_eq!(got, Some(format!("{ns}{name}")), "{}", b.name());
            }
        }
    }
}
