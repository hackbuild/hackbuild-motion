//! Small f64 vector and quaternion types. Conventions match three.js:
//! right handed, `a.mul(b)` applies `b` first, quaternions are `x y z w`.

use core::ops::{Add, AddAssign, Mul, Neg, Sub};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub const ZERO: Vec3 = Vec3 {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };
    pub const X: Vec3 = Vec3 {
        x: 1.0,
        y: 0.0,
        z: 0.0,
    };
    pub const Y: Vec3 = Vec3 {
        x: 0.0,
        y: 1.0,
        z: 0.0,
    };
    pub const Z: Vec3 = Vec3 {
        x: 0.0,
        y: 0.0,
        z: 1.0,
    };

    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Vec3 { x, y, z }
    }
    pub fn from_slice(s: &[f64]) -> Self {
        Vec3::new(s[0], s[1], s[2])
    }
    pub fn write(self, out: &mut [f64]) {
        out[0] = self.x;
        out[1] = self.y;
        out[2] = self.z;
    }
    pub fn dot(self, o: Vec3) -> f64 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }
    pub fn cross(self, o: Vec3) -> Vec3 {
        Vec3::new(
            self.y * o.z - self.z * o.y,
            self.z * o.x - self.x * o.z,
            self.x * o.y - self.y * o.x,
        )
    }
    pub fn length_sq(self) -> f64 {
        self.dot(self)
    }
    pub fn length(self) -> f64 {
        libm::sqrt(self.length_sq())
    }
    pub fn distance(self, o: Vec3) -> f64 {
        (self - o).length()
    }
    /// Unit vector, or zero for a zero length input.
    pub fn normalize(self) -> Vec3 {
        let l = self.length();
        if l > 1e-300 {
            self * (1.0 / l)
        } else {
            Vec3::ZERO
        }
    }
    pub fn lerp(self, o: Vec3, t: f64) -> Vec3 {
        self + (o - self) * t
    }
    /// The part of `self` perpendicular to the unit vector `n`.
    pub fn reject(self, n: Vec3) -> Vec3 {
        self - n * self.dot(n)
    }
}

impl Add for Vec3 {
    type Output = Vec3;
    fn add(self, o: Vec3) -> Vec3 {
        Vec3::new(self.x + o.x, self.y + o.y, self.z + o.z)
    }
}
impl AddAssign for Vec3 {
    fn add_assign(&mut self, o: Vec3) {
        *self = *self + o;
    }
}
impl Sub for Vec3 {
    type Output = Vec3;
    fn sub(self, o: Vec3) -> Vec3 {
        Vec3::new(self.x - o.x, self.y - o.y, self.z - o.z)
    }
}
impl Mul<f64> for Vec3 {
    type Output = Vec3;
    fn mul(self, s: f64) -> Vec3 {
        Vec3::new(self.x * s, self.y * s, self.z * s)
    }
}
impl Neg for Vec3 {
    type Output = Vec3;
    fn neg(self) -> Vec3 {
        Vec3::new(-self.x, -self.y, -self.z)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Quat {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
}

impl Default for Quat {
    fn default() -> Self {
        Quat::IDENTITY
    }
}

impl Quat {
    pub const IDENTITY: Quat = Quat {
        x: 0.0,
        y: 0.0,
        z: 0.0,
        w: 1.0,
    };

    pub const fn new(x: f64, y: f64, z: f64, w: f64) -> Self {
        Quat { x, y, z, w }
    }
    pub fn from_slice(s: &[f64]) -> Self {
        Quat::new(s[0], s[1], s[2], s[3])
    }
    pub fn write(self, out: &mut [f64]) {
        out[0] = self.x;
        out[1] = self.y;
        out[2] = self.z;
        out[3] = self.w;
    }
    pub fn from_axis_angle(axis: Vec3, angle: f64) -> Quat {
        let h = angle * 0.5;
        let s = libm::sin(h);
        Quat::new(axis.x * s, axis.y * s, axis.z * s, libm::cos(h))
    }
    /// Rotation by Euler angles in radians, applied in the given order of
    /// axes, for example `b"ZXY"` (the BVH reading of "Z X Y" channels):
    /// the result is `R(order[0]) * R(order[1]) * R(order[2])`.
    pub fn from_euler_order(angles: [f64; 3], order: &[u8; 3]) -> Quat {
        let mut q = Quat::IDENTITY;
        for (i, c) in order.iter().enumerate() {
            let axis = match c {
                b'X' | b'x' => Vec3::X,
                b'Y' | b'y' => Vec3::Y,
                _ => Vec3::Z,
            };
            q = q.mul(Quat::from_axis_angle(axis, angles[i]));
        }
        q
    }
    /// Shortest rotation that takes unit vector `a` onto unit vector `b`
    /// (the three.js `setFromUnitVectors` construction).
    pub fn from_unit_vectors(a: Vec3, b: Vec3) -> Quat {
        let mut r = a.dot(b) + 1.0;
        let q = if r < 1e-12 {
            r = 0.0;
            if libm::fabs(a.x) > libm::fabs(a.z) {
                Quat::new(-a.y, a.x, 0.0, r)
            } else {
                Quat::new(0.0, -a.z, a.y, r)
            }
        } else {
            let c = a.cross(b);
            Quat::new(c.x, c.y, c.z, r)
        };
        q.normalize()
    }
    /// Rotation whose columns are the given orthonormal basis vectors.
    pub fn from_basis(x: Vec3, y: Vec3, z: Vec3) -> Quat {
        let (m00, m01, m02) = (x.x, y.x, z.x);
        let (m10, m11, m12) = (x.y, y.y, z.y);
        let (m20, m21, m22) = (x.z, y.z, z.z);
        let tr = m00 + m11 + m22;
        let q = if tr > 0.0 {
            let s = 0.5 / libm::sqrt(tr + 1.0);
            Quat::new((m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s)
        } else if m00 > m11 && m00 > m22 {
            let s = 2.0 * libm::sqrt(1.0 + m00 - m11 - m22);
            Quat::new(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s)
        } else if m11 > m22 {
            let s = 2.0 * libm::sqrt(1.0 + m11 - m00 - m22);
            Quat::new((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s)
        } else {
            let s = 2.0 * libm::sqrt(1.0 + m22 - m00 - m11);
            Quat::new((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s)
        };
        q.normalize()
    }
    /// Hamilton product: `self.mul(b)` rotates by `b`, then by `self`.
    #[allow(clippy::should_implement_trait)]
    pub fn mul(self, b: Quat) -> Quat {
        let a = self;
        Quat::new(
            a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
            a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
            a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
            a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        )
    }
    pub fn conjugate(self) -> Quat {
        Quat::new(-self.x, -self.y, -self.z, self.w)
    }
    /// Inverse of a unit quaternion.
    pub fn inverse(self) -> Quat {
        self.conjugate()
    }
    pub fn dot(self, b: Quat) -> f64 {
        self.x * b.x + self.y * b.y + self.z * b.z + self.w * b.w
    }
    pub fn length(self) -> f64 {
        libm::sqrt(self.dot(self))
    }
    pub fn normalize(self) -> Quat {
        let l = self.length();
        if l < 1e-300 {
            Quat::IDENTITY
        } else {
            let s = 1.0 / l;
            Quat::new(self.x * s, self.y * s, self.z * s, self.w * s)
        }
    }
    /// The same rotation with `w >= 0`, the shorter way round.
    pub fn abs(self) -> Quat {
        if self.w < 0.0 {
            Quat::new(-self.x, -self.y, -self.z, -self.w)
        } else {
            self
        }
    }
    pub fn rotate(self, v: Vec3) -> Vec3 {
        let (qx, qy, qz, qw) = (self.x, self.y, self.z, self.w);
        let tx = 2.0 * (qy * v.z - qz * v.y);
        let ty = 2.0 * (qz * v.x - qx * v.z);
        let tz = 2.0 * (qx * v.y - qy * v.x);
        Vec3::new(
            v.x + qw * tx + qy * tz - qz * ty,
            v.y + qw * ty + qz * tx - qx * tz,
            v.z + qw * tz + qx * ty - qy * tx,
        )
    }
    /// Rotation as a scaled axis: unit axis times the angle in radians.
    pub fn to_scaled_axis(self) -> Vec3 {
        let q = self.abs();
        let s = libm::sqrt(q.x * q.x + q.y * q.y + q.z * q.z);
        if s < 1e-12 {
            return Vec3::new(q.x * 2.0, q.y * 2.0, q.z * 2.0);
        }
        let angle = 2.0 * libm::atan2(s, q.w);
        Vec3::new(q.x / s * angle, q.y / s * angle, q.z / s * angle)
    }
    pub fn from_scaled_axis(v: Vec3) -> Quat {
        let a = v.length();
        if a < 1e-12 {
            return Quat::new(v.x * 0.5, v.y * 0.5, v.z * 0.5, 1.0).normalize();
        }
        Quat::from_axis_angle(v * (1.0 / a), a)
    }
    /// Angle in radians between two rotations, in 0 to pi.
    pub fn angle_to(self, b: Quat) -> f64 {
        let d = libm::fabs(self.dot(b)).min(1.0);
        2.0 * libm::acos(d)
    }
    pub fn slerp(self, b: Quat, t: f64) -> Quat {
        let mut b = b;
        let mut cos = self.dot(b);
        if cos < 0.0 {
            b = Quat::new(-b.x, -b.y, -b.z, -b.w);
            cos = -cos;
        }
        if cos > 0.9995 {
            return Quat::new(
                self.x + (b.x - self.x) * t,
                self.y + (b.y - self.y) * t,
                self.z + (b.z - self.z) * t,
                self.w + (b.w - self.w) * t,
            )
            .normalize();
        }
        let theta = libm::acos(cos);
        let s = libm::sin(theta);
        let wa = libm::sin((1.0 - t) * theta) / s;
        let wb = libm::sin(t * theta) / s;
        Quat::new(
            self.x * wa + b.x * wb,
            self.y * wa + b.y * wb,
            self.z * wa + b.z * wb,
            self.w * wa + b.w * wb,
        )
    }
    /// Yaw about +Y of the rotated +Z axis, in radians.
    pub fn yaw(self) -> f64 {
        let f = self.rotate(Vec3::Z);
        libm::atan2(f.x, f.z)
    }
}

pub fn clamp(x: f64, lo: f64, hi: f64) -> f64 {
    if x < lo {
        lo
    } else if x > hi {
        hi
    } else {
        x
    }
}

pub fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Hermite smoothstep of `x` between `a` and `b`.
pub fn smoothstep(a: f64, b: f64, x: f64) -> f64 {
    let t = clamp((x - a) / (b - a), 0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Fractional part in 0 to 1.
pub fn frac(x: f64) -> f64 {
    x - libm::floor(x)
}

/// Angle wrapped into minus pi to pi.
pub fn wrap_angle(a: f64) -> f64 {
    let t = core::f64::consts::TAU;
    a - t * libm::floor((a + core::f64::consts::PI) / t)
}

/// Phase difference wrapped into minus one half to one half.
pub fn wrap_half(x: f64) -> f64 {
    x - libm::floor(x + 0.5)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotate_matches_axis_angle() {
        let q = Quat::from_axis_angle(Vec3::Y, core::f64::consts::FRAC_PI_2);
        let v = q.rotate(Vec3::Z);
        assert!((v.x - 1.0).abs() < 1e-12 && v.z.abs() < 1e-12);
    }

    #[test]
    fn scaled_axis_round_trip() {
        let q = Quat::from_axis_angle(Vec3::new(1.0, 2.0, 3.0).normalize(), 1.2);
        let back = Quat::from_scaled_axis(q.to_scaled_axis());
        assert!(q.angle_to(back) < 1e-9);
    }

    #[test]
    fn unit_vectors_opposite() {
        let q = Quat::from_unit_vectors(Vec3::X, -Vec3::X);
        let v = q.rotate(Vec3::X);
        assert!((v.x + 1.0).abs() < 1e-9);
    }

    #[test]
    fn basis_round_trip() {
        let q = Quat::from_axis_angle(Vec3::new(0.3, -1.0, 0.2).normalize(), 2.5);
        let b = Quat::from_basis(q.rotate(Vec3::X), q.rotate(Vec3::Y), q.rotate(Vec3::Z));
        assert!(q.angle_to(b) < 1e-9);
    }
}
