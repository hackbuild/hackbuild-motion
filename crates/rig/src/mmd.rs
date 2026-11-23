//! MikuMikuDance bone names (Japanese, as decoded from Shift-JIS). The leg
//! bones ending in D are the deform copies most PMX models skin to; motions
//! key the plain ones, so the mapper reports the D bones separately.

use crate::bones::HumanBone;
use HumanBone::*;

/// Humanoid bone for an MMD name, and whether it is a D deform bone.
pub fn mmd_bone(name: &str) -> Option<(HumanBone, bool)> {
    let direct = match name {
        "下半身" => Some(Hips),
        "上半身" => Some(Spine),
        "上半身2" | "上半身２" => Some(Chest),
        "上半身3" | "上半身３" => Some(UpperChest),
        "首" => Some(Neck),
        "頭" => Some(Head),
        "左目" => Some(LeftEye),
        "右目" => Some(RightEye),
        "あご" | "顎" => Some(Jaw),
        _ => None,
    };
    if let Some(b) = direct {
        return Some((b, false));
    }
    let mut chars = name.chars();
    let left = match chars.next()? {
        '左' => true,
        '右' => false,
        _ => return None,
    };
    let rest = chars.as_str();
    let pick = |l: HumanBone| if left { l } else { l.mirror() };
    let limb = match rest {
        "肩" => Some((LeftShoulder, false)),
        "腕" => Some((LeftUpperArm, false)),
        "ひじ" | "肘" => Some((LeftLowerArm, false)),
        "手首" => Some((LeftHand, false)),
        "足" => Some((LeftUpperLeg, false)),
        "ひざ" | "膝" => Some((LeftLowerLeg, false)),
        "足首" => Some((LeftFoot, false)),
        "つま先" => Some((LeftToes, false)),
        "足D" | "足Ｄ" => Some((LeftUpperLeg, true)),
        "ひざD" | "ひざＤ" | "膝D" => Some((LeftLowerLeg, true)),
        "足首D" | "足首Ｄ" => Some((LeftFoot, true)),
        "足先EX" | "足先ＥＸ" => Some((LeftToes, true)),
        _ => None,
    };
    if let Some((b, d)) = limb {
        return Some((pick(b), d));
    }
    // fingers: a two character finger name, then one digit, ASCII or full width
    let mut fc = rest.chars();
    let finger: alloc::string::String = fc.by_ref().take(2).collect();
    let digit = match fc.next()? {
        c @ '0'..='9' => c as u32 - '0' as u32,
        c @ '０'..='９' => c as u32 - '０' as u32,
        _ => return None,
    };
    if fc.next().is_some() {
        return None;
    }
    let segs: [Option<HumanBone>; 4] = match finger.as_str() {
        "親指" => [
            Some(LeftThumbMetacarpal),
            Some(LeftThumbProximal),
            Some(LeftThumbDistal),
            None,
        ],
        "人指" => [
            None,
            Some(LeftIndexProximal),
            Some(LeftIndexIntermediate),
            Some(LeftIndexDistal),
        ],
        "中指" => [
            None,
            Some(LeftMiddleProximal),
            Some(LeftMiddleIntermediate),
            Some(LeftMiddleDistal),
        ],
        "薬指" => [
            None,
            Some(LeftRingProximal),
            Some(LeftRingIntermediate),
            Some(LeftRingDistal),
        ],
        "小指" => [
            None,
            Some(LeftLittleProximal),
            Some(LeftLittleIntermediate),
            Some(LeftLittleDistal),
        ],
        _ => return None,
    };
    segs.get(digit as usize)
        .copied()
        .flatten()
        .map(|b| (pick(b), false))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert_eq!(mmd_bone("右ひじ"), Some((RightLowerArm, false)));
        assert_eq!(mmd_bone("左足D"), Some((LeftUpperLeg, true)));
        assert_eq!(mmd_bone("左人指１"), Some((LeftIndexProximal, false)));
        assert_eq!(mmd_bone("右親指0"), Some((RightThumbMetacarpal, false)));
        assert_eq!(mmd_bone("センター"), None);
    }
}
