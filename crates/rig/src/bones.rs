//! The VRM 1.0 humanoid bone set, in an order where every parent comes
//! before its children.

macro_rules! bones {
    ($($v:ident = $s:literal),* $(,)?) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
        #[repr(u8)]
        pub enum HumanBone { $($v),* }
        pub const ALL: &[HumanBone] = &[$(HumanBone::$v),*];
        const NAMES: &[&str] = &[$($s),*];
    };
}

bones! {
    Hips = "hips", Spine = "spine", Chest = "chest", UpperChest = "upperChest", Neck = "neck", Head = "head",
    LeftEye = "leftEye", RightEye = "rightEye", Jaw = "jaw",
    LeftUpperLeg = "leftUpperLeg", LeftLowerLeg = "leftLowerLeg", LeftFoot = "leftFoot", LeftToes = "leftToes",
    RightUpperLeg = "rightUpperLeg", RightLowerLeg = "rightLowerLeg", RightFoot = "rightFoot", RightToes = "rightToes",
    LeftShoulder = "leftShoulder", LeftUpperArm = "leftUpperArm", LeftLowerArm = "leftLowerArm", LeftHand = "leftHand",
    RightShoulder = "rightShoulder", RightUpperArm = "rightUpperArm", RightLowerArm = "rightLowerArm", RightHand = "rightHand",
    LeftThumbMetacarpal = "leftThumbMetacarpal", LeftThumbProximal = "leftThumbProximal", LeftThumbDistal = "leftThumbDistal",
    LeftIndexProximal = "leftIndexProximal", LeftIndexIntermediate = "leftIndexIntermediate", LeftIndexDistal = "leftIndexDistal",
    LeftMiddleProximal = "leftMiddleProximal", LeftMiddleIntermediate = "leftMiddleIntermediate", LeftMiddleDistal = "leftMiddleDistal",
    LeftRingProximal = "leftRingProximal", LeftRingIntermediate = "leftRingIntermediate", LeftRingDistal = "leftRingDistal",
    LeftLittleProximal = "leftLittleProximal", LeftLittleIntermediate = "leftLittleIntermediate", LeftLittleDistal = "leftLittleDistal",
    RightThumbMetacarpal = "rightThumbMetacarpal", RightThumbProximal = "rightThumbProximal", RightThumbDistal = "rightThumbDistal",
    RightIndexProximal = "rightIndexProximal", RightIndexIntermediate = "rightIndexIntermediate", RightIndexDistal = "rightIndexDistal",
    RightMiddleProximal = "rightMiddleProximal", RightMiddleIntermediate = "rightMiddleIntermediate", RightMiddleDistal = "rightMiddleDistal",
    RightRingProximal = "rightRingProximal", RightRingIntermediate = "rightRingIntermediate", RightRingDistal = "rightRingDistal",
    RightLittleProximal = "rightLittleProximal", RightLittleIntermediate = "rightLittleIntermediate", RightLittleDistal = "rightLittleDistal",
}

/// The 15 bones VRM 1.0 requires.
pub const REQUIRED: &[HumanBone] = &[
    HumanBone::Hips,
    HumanBone::Spine,
    HumanBone::Head,
    HumanBone::LeftUpperLeg,
    HumanBone::LeftLowerLeg,
    HumanBone::LeftFoot,
    HumanBone::RightUpperLeg,
    HumanBone::RightLowerLeg,
    HumanBone::RightFoot,
    HumanBone::LeftUpperArm,
    HumanBone::LeftLowerArm,
    HumanBone::LeftHand,
    HumanBone::RightUpperArm,
    HumanBone::RightLowerArm,
    HumanBone::RightHand,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Left,
    Right,
}

impl HumanBone {
    pub fn index(self) -> usize {
        self as usize
    }
    pub fn from_index(i: usize) -> Option<HumanBone> {
        ALL.get(i).copied()
    }
    pub fn name(self) -> &'static str {
        NAMES[self as usize]
    }
    pub fn from_name(s: &str) -> Option<HumanBone> {
        NAMES.iter().position(|n| *n == s).map(|i| ALL[i])
    }
    pub fn is_required(self) -> bool {
        REQUIRED.contains(&self)
    }
    pub fn side(self) -> Option<Side> {
        let n = self.name();
        if n.starts_with("left") {
            Some(Side::Left)
        } else if n.starts_with("right") {
            Some(Side::Right)
        } else {
            None
        }
    }
    /// The same bone on the other side, or itself for a center bone.
    pub fn mirror(self) -> HumanBone {
        let n = self.name();
        let other = if let Some(rest) = n.strip_prefix("left") {
            ALL.iter()
                .find(|b| b.name().strip_prefix("right") == Some(rest))
        } else if let Some(rest) = n.strip_prefix("right") {
            ALL.iter()
                .find(|b| b.name().strip_prefix("left") == Some(rest))
        } else {
            None
        };
        other.copied().unwrap_or(self)
    }
    /// Parent in the VRM humanoid hierarchy, with optional bones skipped
    /// over by [`parent_present`](Self::parent_present).
    pub fn parent(self) -> Option<HumanBone> {
        use HumanBone::*;
        Some(match self {
            Hips => return None,
            Spine => Hips,
            Chest => Spine,
            UpperChest => Chest,
            Neck => UpperChest,
            Head => Neck,
            LeftEye | RightEye | Jaw => Head,
            LeftUpperLeg | RightUpperLeg => Hips,
            LeftLowerLeg => LeftUpperLeg,
            RightLowerLeg => RightUpperLeg,
            LeftFoot => LeftLowerLeg,
            RightFoot => RightLowerLeg,
            LeftToes => LeftFoot,
            RightToes => RightFoot,
            LeftShoulder | RightShoulder => UpperChest,
            LeftUpperArm => LeftShoulder,
            RightUpperArm => RightShoulder,
            LeftLowerArm => LeftUpperArm,
            RightLowerArm => RightUpperArm,
            LeftHand => LeftLowerArm,
            RightHand => RightLowerArm,
            b => {
                let n = b.name();
                let left = n.starts_with("left");
                let hand = if left { LeftHand } else { RightHand };
                if n.ends_with("Metacarpal") || n.ends_with("Proximal") {
                    hand
                } else {
                    // Intermediate and Distal hang under the previous segment
                    let i = b.index();
                    ALL[i - 1]
                }
            }
        })
    }
    /// The nearest ancestor that `present` reports as mapped.
    pub fn parent_present(self, present: impl Fn(HumanBone) -> bool) -> Option<HumanBone> {
        let mut p = self.parent();
        while let Some(b) = p {
            if present(b) {
                return Some(b);
            }
            p = b.parent();
        }
        None
    }
    pub fn is_finger(self) -> bool {
        self.index() >= HumanBone::LeftThumbMetacarpal.index()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fifty_five_bones_parents_first() {
        assert_eq!(ALL.len(), 55);
        for b in ALL {
            if let Some(p) = b.parent() {
                assert!(p.index() < b.index(), "{:?} before {:?}", p, b);
            }
            assert_eq!(HumanBone::from_name(b.name()), Some(*b));
            assert_eq!(b.mirror().mirror(), *b);
        }
        assert_eq!(
            HumanBone::LeftIndexDistal.parent(),
            Some(HumanBone::LeftIndexIntermediate)
        );
        assert_eq!(
            HumanBone::RightThumbMetacarpal.parent(),
            Some(HumanBone::RightHand)
        );
    }
}
