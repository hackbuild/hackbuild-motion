//! Splits a bone name into a side, body part words, a trailing number and a
//! helper flag. `mixamorig:LeftHandIndex1`, `J_Bip_L_Index1`,
//! `Bip01 L Finger1`, `index_01_l`, `f_index.01.L` and `CC_Base_L_Index1`
//! all come out as side left, words `index` (after the hand and f prefixes
//! are dropped by the mapper) and number 1.

use crate::bones::Side;
use alloc::string::String;
use alloc::vec::Vec;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Parsed {
    pub side: Option<Side>,
    /// Body part words, lowercase, numbers removed.
    pub words: Vec<String>,
    /// The last number in the name, if any.
    pub number: Option<u32>,
    /// Twist, roll, end, IK, pole and similar helper bones.
    pub helper: bool,
}

impl Parsed {
    /// The words glued together: `upper arm` becomes `upperarm`.
    pub fn core(&self) -> String {
        self.words.concat()
    }
}

/// Exporter and rig prefixes dropped from the front of a name.
const NOISE: &[&str] = &[
    "mixamorig",
    "j",
    "bip",
    "def",
    "org",
    "mch",
    "cc",
    "base",
    "armature",
    "rig",
    "skeleton",
    "valvebiped",
    "valve",
    "biped",
    "bone",
    "bones",
    "adj",
    "jnt",
    "joint",
    "sk",
    "b",
    "c",
    "character",
    "char",
    "model",
    "ue",
    "sm",
    "smpl",
];

/// Words that mark a helper bone, anywhere in the name.
const HELPER: &[&str] = &[
    "end",
    "nub",
    "tip",
    "twist",
    "roll",
    "ik",
    "pole",
    "ctrl",
    "control",
    "target",
    "helper",
    "socket",
    "null",
    "dummy",
    "ref",
    "offset",
    "prop",
    "weapon",
    "attach",
    "corrective",
    "adjust",
    "share",
    "top",
    "site",
    "goal",
    "lookat",
];

pub fn split(raw: &str) -> Vec<String> {
    let name = match raw.rfind([':', '|']) {
        Some(i) => &raw[i + 1..],
        None => raw,
    };
    let chars: Vec<char> = name.chars().collect();
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    for i in 0..chars.len() {
        let c = chars[i];
        if !c.is_ascii_alphanumeric() {
            if !cur.is_empty() {
                out.push(core::mem::take(&mut cur));
            }
            continue;
        }
        if let Some(p) = (!cur.is_empty()).then(|| chars[i - 1]) {
            let next = chars.get(i + 1).copied();
            let boundary = (p.is_ascii_lowercase() && c.is_ascii_uppercase())
                || (p.is_ascii_uppercase()
                    && c.is_ascii_uppercase()
                    && next.is_some_and(|n| n.is_ascii_lowercase()))
                || (p.is_ascii_digit() != c.is_ascii_digit());
            if boundary {
                out.push(core::mem::take(&mut cur));
            }
        }
        cur.push(c.to_ascii_lowercase());
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

fn is_digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

pub fn parse(raw: &str) -> Parsed {
    let mut toks = split(raw);
    // vertebra names (Xsens L5, L3, T12, T8; C7 for the neck) are spine bones, not sides
    if toks.len() == 2 && is_digits(&toks[1]) && matches!(toks[0].as_str(), "l" | "t" | "c") {
        let word = if toks[0] == "c" { "neck" } else { "spine" };
        return Parsed {
            side: None,
            words: alloc::vec![word.into()],
            number: toks[1].parse().ok(),
            helper: false,
        };
    }
    // exporter prefixes, and the number glued to some of them (Bip01, mixamorig1)
    while toks.len() > 1 && NOISE.contains(&toks[0].as_str()) {
        toks.remove(0);
        if toks.len() > 1 && is_digits(&toks[0]) {
            toks.remove(0);
        }
    }
    // a lone C marks a center bone (J_Bip_C_Hips), anywhere
    if toks.len() > 1 {
        toks.retain(|t| t != "c");
    }
    let mut side = None;
    if let Some(i) = toks
        .iter()
        .position(|t| matches!(t.as_str(), "left" | "l" | "lft" | "lf"))
    {
        side = Some(Side::Left);
        toks.remove(i);
    } else if let Some(i) = toks
        .iter()
        .position(|t| matches!(t.as_str(), "right" | "r" | "rgt" | "rt"))
    {
        side = Some(Side::Right);
        toks.remove(i);
    } else {
        for t in toks.iter_mut() {
            if let Some(rest) = t.strip_prefix("left").filter(|r| !r.is_empty()) {
                side = Some(Side::Left);
                *t = rest.into();
                break;
            }
            if let Some(rest) = t.strip_prefix("right").filter(|r| !r.is_empty()) {
                side = Some(Side::Right);
                *t = rest.into();
                break;
            }
        }
    }
    let helper = toks.iter().any(|t| HELPER.contains(&t.as_str()));
    let number = toks
        .iter()
        .rev()
        .find(|t| is_digits(t))
        .and_then(|t| t.parse::<u32>().ok());
    let words = toks.into_iter().filter(|t| !is_digits(t)).collect();
    Parsed {
        side,
        words,
        number,
        helper,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &str) -> (Option<Side>, String, Option<u32>, bool) {
        let r = parse(s);
        (r.side, r.core(), r.number, r.helper)
    }

    #[test]
    fn splits_common_dialects() {
        assert_eq!(
            p("mixamorig:LeftHandIndex1"),
            (Some(Side::Left), "handindex".into(), Some(1), false)
        );
        assert_eq!(
            p("J_Bip_L_UpperArm"),
            (Some(Side::Left), "upperarm".into(), None, false)
        );
        assert_eq!(p("J_Bip_C_Hips"), (None, "hips".into(), None, false));
        assert_eq!(
            p("Bip01 R Forearm"),
            (Some(Side::Right), "forearm".into(), None, false)
        );
        assert_eq!(
            p("upperarm_l"),
            (Some(Side::Left), "upperarm".into(), None, false)
        );
        assert_eq!(
            p("DEF-thigh.L"),
            (Some(Side::Left), "thigh".into(), None, false)
        );
        assert_eq!(
            p("upper_armL"),
            (Some(Side::Left), "upperarm".into(), None, false)
        );
        assert_eq!(
            p("LHipJoint"),
            (Some(Side::Left), "hipjoint".into(), None, false)
        );
        assert_eq!(p("spine_03"), (None, "spine".into(), Some(3), false));
        assert_eq!(
            p("mixamorig:HeadTop_End"),
            (None, "headtopend".into(), None, true)
        );
        assert_eq!(
            p("upperarm_twist_01_l"),
            (Some(Side::Left), "upperarmtwist".into(), Some(1), true)
        );
        assert_eq!(
            p("CC_Base_L_Upperarm"),
            (Some(Side::Left), "upperarm".into(), None, false)
        );
        assert_eq!(
            p("ValveBiped.Bip01_L_UpperArm"),
            (Some(Side::Left), "upperarm".into(), None, false)
        );
        assert_eq!(p("Armature|Hips"), (None, "hips".into(), None, false));
    }
}
