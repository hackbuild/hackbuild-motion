//! Rest pose analysis: which way the rig faces, which units it uses, where
//! its floor is and whether its arms rest in an A pose, with the fixes that
//! bring it into the normalized space (+Z forward, left on +X, meters, feet
//! at y = 0, T pose).

use crate::bones::HumanBone::{self, *};
use organic::{Quat, Vec3};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Units {
    Meters,
    Centimeters,
    Millimeters,
    Unknown,
    Decimeters,
    Inches,
}

impl Units {
    pub fn code(self) -> f64 {
        match self {
            Units::Meters => 0.0,
            Units::Centimeters => 1.0,
            Units::Millimeters => 2.0,
            Units::Unknown => 3.0,
            Units::Decimeters => 4.0,
            Units::Inches => 5.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RestReport {
    /// Rotation that turns the rig to face +Z with +Y up and its left on +X.
    pub fix: Quat,
    /// Head joint height above the lowest foot joint, in source units.
    pub height: f64,
    pub units: Units,
    /// Source units to meters.
    pub scale: f64,
    /// Lowest foot or toe joint height after `fix` and `scale`, in meters.
    pub floor: f64,
    /// Hips height above the floor, meters.
    pub hips_height: f64,
    /// Upper arm angle below horizontal in degrees, left then right.
    pub arm_down: [f64; 2],
    /// World rotation (in the fixed frame) that lifts each upper arm into the T pose.
    pub arm_fix: [Quat; 2],
    /// Leg angle away from straight down in degrees, left then right.
    pub leg_splay: [f64; 2],
    /// World rotation (in the fixed frame) that straightens each upper leg.
    pub leg_fix: [Quat; 2],
    /// Both arms more than 20 degrees below horizontal.
    pub a_pose: bool,
}

impl RestReport {
    pub const FLAT_LEN: usize = 31;
    /// `[ok, fix xyzw, height, units, scale, floor, hips_height, arm_down l r,
    /// arm_fix l xyzw, arm_fix r xyzw, leg_splay l r, leg_fix l xyzw,
    /// leg_fix r xyzw, a_pose]`.
    pub fn to_flat(&self) -> [f64; 31] {
        let mut o = [0.0; 31];
        o[0] = 1.0;
        self.fix.write(&mut o[1..5]);
        o[5] = self.height;
        o[6] = self.units.code();
        o[7] = self.scale;
        o[8] = self.floor;
        o[9] = self.hips_height;
        o[10] = self.arm_down[0];
        o[11] = self.arm_down[1];
        self.arm_fix[0].write(&mut o[12..16]);
        self.arm_fix[1].write(&mut o[16..20]);
        o[20] = self.leg_splay[0];
        o[21] = self.leg_splay[1];
        self.leg_fix[0].write(&mut o[22..26]);
        self.leg_fix[1].write(&mut o[26..30]);
        o[30] = if self.a_pose { 1.0 } else { 0.0 };
        o
    }
}

/// Analyses rest world positions indexed by `HumanBone::index`. Needs the
/// hips, the head and both upper arms (or shoulders).
pub fn analyze_rest(pos: &[Option<Vec3>]) -> Option<RestReport> {
    let get = |b: HumanBone| pos.get(b.index()).copied().flatten();
    let hips = get(Hips)?;
    let head = get(Head).or(get(Neck))?;
    let la = get(LeftUpperArm).or(get(LeftShoulder))?;
    let ra = get(RightUpperArm).or(get(RightShoulder))?;
    let up = (head - hips).normalize();
    let side = (la - ra).reject(up).normalize();
    if up.length() < 0.5 || side.length() < 0.5 {
        return None;
    }
    let fwd = side.cross(up).normalize();
    let fix = Quat::from_basis(side, up, fwd).inverse();
    let tf = |v: Vec3| fix.rotate(v);
    let foot_low = [LeftToes, RightToes, LeftFoot, RightFoot]
        .iter()
        .filter_map(|b| get(*b))
        .map(|v| tf(v).y)
        .fold(f64::INFINITY, f64::min);
    let low = if foot_low.is_finite() {
        foot_low
    } else {
        tf(hips).y - (tf(head).y - tf(hips).y) * 1.55
    };
    let height = tf(head).y - low;
    // head height is about 0.87 of stature; inches win over centimeters
    // only where centimeters read under a 1 m adult and inches 1 to 2.3 m
    let (units, scale) = if (0.3..3.0).contains(&height) {
        (Units::Meters, 1.0)
    } else if (3.0..30.0).contains(&height) {
        (Units::Decimeters, 0.1)
    } else if (1.0..2.3).contains(&(height * 0.0254 / 0.87)) && height * 0.01 / 0.87 < 1.0 {
        (Units::Inches, 0.0254)
    } else if (30.0..300.0).contains(&height) {
        (Units::Centimeters, 0.01)
    } else if (300.0..3000.0).contains(&height) {
        (Units::Millimeters, 0.001)
    } else {
        (Units::Unknown, 1.0)
    };
    let floor = low * scale;
    let hips_height = (tf(hips).y - low) * scale;
    let mut arm_down = [0.0; 2];
    let mut arm_fix = [Quat::IDENTITY; 2];
    for (k, (ua, la_b, target)) in [
        (LeftUpperArm, LeftLowerArm, Vec3::X),
        (RightUpperArm, RightLowerArm, -Vec3::X),
    ]
    .into_iter()
    .enumerate()
    {
        if let (Some(a), Some(b)) = (get(ua), get(la_b)) {
            let d = (tf(b) - tf(a)).normalize();
            arm_down[k] = libm::asin((-d.y).clamp(-1.0, 1.0)).to_degrees();
            arm_fix[k] = Quat::from_unit_vectors(d, target);
        }
    }
    let mut leg_splay = [0.0; 2];
    let mut leg_fix = [Quat::IDENTITY; 2];
    for (k, (ul, ll)) in [(LeftUpperLeg, LeftLowerLeg), (RightUpperLeg, RightLowerLeg)]
        .into_iter()
        .enumerate()
    {
        if let (Some(a), Some(b)) = (get(ul), get(ll)) {
            let d = (tf(b) - tf(a)).normalize();
            leg_splay[k] = libm::acos((-d.y).clamp(-1.0, 1.0)).to_degrees();
            leg_fix[k] = Quat::from_unit_vectors(d, -Vec3::Y);
        }
    }
    Some(RestReport {
        fix,
        height,
        units,
        scale,
        floor,
        hips_height,
        arm_down,
        arm_fix,
        leg_splay,
        leg_fix,
        a_pose: arm_down[0] > 20.0 && arm_down[1] > 20.0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reference::reference_rest;

    #[test]
    fn reference_is_already_normal() {
        let r = reference_rest();
        let pos: alloc::vec::Vec<Option<Vec3>> = r.iter().map(|v| Some(*v)).collect();
        let rep = analyze_rest(&pos).unwrap();
        assert!(rep.fix.angle_to(Quat::IDENTITY) < 1e-9);
        assert_eq!(rep.units, Units::Meters);
        assert!(rep.arm_down[0].abs() < 1e-6 && !rep.a_pose);
        assert!((rep.floor - 0.02).abs() < 1e-9);
    }

    #[test]
    fn turned_scaled_a_pose_is_found() {
        let turn = Quat::from_axis_angle(Vec3::Y, 2.0);
        let r = reference_rest();
        let mut pos: alloc::vec::Vec<Option<Vec3>> = r.iter().map(|v| Some(*v)).collect();
        // lower the left and right arms by 40 degrees about the shoulder
        for (side, sign) in [(LeftUpperArm, -1.0), (RightUpperArm, 1.0)] {
            let pivot = r[side.index()];
            let q = Quat::from_axis_angle(Vec3::Z, sign * 40f64.to_radians());
            for b in crate::bones::ALL {
                let below = matches!(b.side(), Some(s) if Some(s) == side.side())
                    && (b.index() >= LeftThumbMetacarpal.index()
                        || matches!(b.name(), n if n.ends_with("LowerArm") || n.ends_with("Hand")));
                if below {
                    let v = r[b.index()];
                    pos[b.index()] = Some(pivot + q.rotate(v - pivot));
                }
            }
        }
        let pos: alloc::vec::Vec<Option<Vec3>> = pos
            .into_iter()
            .map(|v| v.map(|v| turn.rotate(v) * 100.0))
            .collect();
        let rep = analyze_rest(&pos).unwrap();
        assert!(rep.fix.mul(turn).angle_to(Quat::IDENTITY) < 1e-9);
        assert_eq!(rep.units, Units::Centimeters);
        assert!((rep.arm_down[0] - 40.0).abs() < 1e-6 && (rep.arm_down[1] - 40.0).abs() < 1e-6);
        assert!(rep.a_pose);
        let lifted = rep.arm_fix[0].rotate(
            rep.fix
                .rotate(pos[LeftLowerArm.index()].unwrap() - pos[LeftUpperArm.index()].unwrap())
                .normalize(),
        );
        assert!((lifted.x - 1.0).abs() < 1e-9);
    }

    #[test]
    fn decimeters_and_inches_are_read() {
        let r = reference_rest();
        for (k, want) in [
            (10.0, Units::Decimeters),
            (1.0 / 0.0254, Units::Inches),
            (100.0, Units::Centimeters),
        ] {
            let pos: alloc::vec::Vec<Option<Vec3>> = r.iter().map(|v| Some(*v * k)).collect();
            let rep = analyze_rest(&pos).unwrap();
            assert_eq!(rep.units, want, "scale {k}");
            assert!(
                (rep.hips_height
                    - analyze_rest(&r.iter().map(|v| Some(*v)).collect::<alloc::vec::Vec<_>>())
                        .unwrap()
                        .hips_height)
                    .abs()
                    < 1e-9
            );
        }
    }
}
