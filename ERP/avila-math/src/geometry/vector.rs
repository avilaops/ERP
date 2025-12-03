/// Vector types for 2D, 3D, and 4D mathematics
///
/// Provides fundamental vector operations for graphics, physics, and scientific computing.
use std::ops::{Add, Div, Mul, Neg, Sub};

/// 2D Vector
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vector2 {
    pub x: f64,
    pub y: f64,
}

/// 3D Vector
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vector3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// 4D Vector (homogeneous coordinates)
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vector4 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
}

// ============================================================================
// Vector3 Implementation
// ============================================================================

impl Vector3 {
    /// Create a new Vector3
    #[inline]
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    /// Zero vector
    #[inline]
    pub const fn zero() -> Self {
        Self::new(0.0, 0.0, 0.0)
    }

    /// One vector (all components = 1)
    #[inline]
    pub const fn one() -> Self {
        Self::new(1.0, 1.0, 1.0)
    }

    /// Unit vectors
    #[inline]
    pub const fn unit_x() -> Self {
        Self::new(1.0, 0.0, 0.0)
    }
    #[inline]
    pub const fn unit_y() -> Self {
        Self::new(0.0, 1.0, 0.0)
    }
    #[inline]
    pub const fn unit_z() -> Self {
        Self::new(0.0, 0.0, 1.0)
    }

    /// Common direction vectors
    #[inline]
    pub const fn up() -> Self {
        Self::unit_y()
    }
    #[inline]
    pub const fn down() -> Self {
        Self::new(0.0, -1.0, 0.0)
    }
    #[inline]
    pub const fn left() -> Self {
        Self::new(-1.0, 0.0, 0.0)
    }
    #[inline]
    pub const fn right() -> Self {
        Self::unit_x()
    }
    #[inline]
    pub const fn forward() -> Self {
        Self::new(0.0, 0.0, -1.0)
    }
    #[inline]
    pub const fn back() -> Self {
        Self::unit_z()
    }

    /// Dot product
    #[inline]
    pub fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    /// Cross product
    #[inline]
    pub fn cross(self, other: Self) -> Self {
        Self {
            x: self.y * other.z - self.z * other.y,
            y: self.z * other.x - self.x * other.z,
            z: self.x * other.y - self.y * other.x,
        }
    }

    /// Magnitude (length) of the vector
    #[inline]
    pub fn length(self) -> f64 {
        self.dot(self).sqrt()
    }

    /// Squared magnitude (avoids sqrt)
    #[inline]
    pub fn length_squared(self) -> f64 {
        self.dot(self)
    }

    /// Normalize the vector (return unit vector)
    #[inline]
    pub fn normalize(self) -> Self {
        let len = self.length();
        if len > 0.0 {
            self / len
        } else {
            Self::zero()
        }
    }

    /// Distance between two points
    #[inline]
    pub fn distance(self, other: Self) -> f64 {
        (self - other).length()
    }

    /// Squared distance (avoids sqrt)
    #[inline]
    pub fn distance_squared(self, other: Self) -> f64 {
        (self - other).length_squared()
    }

    /// Linear interpolation
    #[inline]
    pub fn lerp(self, other: Self, t: f64) -> Self {
        self * (1.0 - t) + other * t
    }

    /// Reflect vector across normal
    #[inline]
    pub fn reflect(self, normal: Self) -> Self {
        self - normal * (2.0 * self.dot(normal))
    }

    /// Project vector onto another
    #[inline]
    pub fn project_onto(self, onto: Self) -> Self {
        onto * (self.dot(onto) / onto.dot(onto))
    }

    /// Component-wise minimum
    #[inline]
    pub fn min(self, other: Self) -> Self {
        Self {
            x: self.x.min(other.x),
            y: self.y.min(other.y),
            z: self.z.min(other.z),
        }
    }

    /// Component-wise maximum
    #[inline]
    pub fn max(self, other: Self) -> Self {
        Self {
            x: self.x.max(other.x),
            y: self.y.max(other.y),
            z: self.z.max(other.z),
        }
    }

    /// Convert to Vector4 with w=0 (direction)
    #[inline]
    pub fn to_vector4_dir(self) -> Vector4 {
        Vector4::new(self.x, self.y, self.z, 0.0)
    }

    /// Convert to Vector4 with w=1 (point)
    #[inline]
    pub fn to_vector4_point(self) -> Vector4 {
        Vector4::new(self.x, self.y, self.z, 1.0)
    }
}

// Operator implementations for Vector3
impl Add for Vector3 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self::new(self.x + rhs.x, self.y + rhs.y, self.z + rhs.z)
    }
}

impl Sub for Vector3 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Self::new(self.x - rhs.x, self.y - rhs.y, self.z - rhs.z)
    }
}

impl Mul<f64> for Vector3 {
    type Output = Self;
    fn mul(self, rhs: f64) -> Self {
        Self::new(self.x * rhs, self.y * rhs, self.z * rhs)
    }
}

impl Div<f64> for Vector3 {
    type Output = Self;
    fn div(self, rhs: f64) -> Self {
        Self::new(self.x / rhs, self.y / rhs, self.z / rhs)
    }
}

impl Neg for Vector3 {
    type Output = Self;
    fn neg(self) -> Self {
        Self::new(-self.x, -self.y, -self.z)
    }
}

// ============================================================================
// Vector4 Implementation
// ============================================================================

impl Vector4 {
    /// Create a new Vector4
    #[inline]
    pub const fn new(x: f64, y: f64, z: f64, w: f64) -> Self {
        Self { x, y, z, w }
    }

    /// Zero vector
    #[inline]
    pub const fn zero() -> Self {
        Self::new(0.0, 0.0, 0.0, 0.0)
    }

    /// Convert to Vector3 (discard w)
    #[inline]
    pub fn to_vector3(self) -> Vector3 {
        Vector3::new(self.x, self.y, self.z)
    }

    /// Dot product
    #[inline]
    pub fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z + self.w * other.w
    }

    /// Magnitude
    #[inline]
    pub fn length(self) -> f64 {
        self.dot(self).sqrt()
    }

    /// Normalize
    #[inline]
    pub fn normalize(self) -> Self {
        let len = self.length();
        if len > 0.0 {
            self / len
        } else {
            Self::zero()
        }
    }
}

// Operator implementations for Vector4
impl Add for Vector4 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self::new(
            self.x + rhs.x,
            self.y + rhs.y,
            self.z + rhs.z,
            self.w + rhs.w,
        )
    }
}

impl Sub for Vector4 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Self::new(
            self.x - rhs.x,
            self.y - rhs.y,
            self.z - rhs.z,
            self.w - rhs.w,
        )
    }
}

impl Mul<f64> for Vector4 {
    type Output = Self;
    fn mul(self, rhs: f64) -> Self {
        Self::new(self.x * rhs, self.y * rhs, self.z * rhs, self.w * rhs)
    }
}

impl Div<f64> for Vector4 {
    type Output = Self;
    fn div(self, rhs: f64) -> Self {
        Self::new(self.x / rhs, self.y / rhs, self.z / rhs, self.w / rhs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vector3_basic() {
        let v = Vector3::new(1.0, 2.0, 3.0);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, 3.0);
    }

    #[test]
    fn test_vector3_arithmetic() {
        let v1 = Vector3::new(1.0, 2.0, 3.0);
        let v2 = Vector3::new(4.0, 5.0, 6.0);
        let sum = v1 + v2;
        assert_eq!(sum, Vector3::new(5.0, 7.0, 9.0));
    }

    #[test]
    fn test_vector3_dot() {
        let v1 = Vector3::new(1.0, 2.0, 3.0);
        let v2 = Vector3::new(4.0, 5.0, 6.0);
        assert_eq!(v1.dot(v2), 32.0);
    }

    #[test]
    fn test_vector3_cross() {
        let v1 = Vector3::unit_x();
        let v2 = Vector3::unit_y();
        let cross = v1.cross(v2);
        assert!((cross.x - 0.0).abs() < 1e-10);
        assert!((cross.y - 0.0).abs() < 1e-10);
        assert!((cross.z - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_vector3_normalize() {
        let v = Vector3::new(3.0, 4.0, 0.0);
        let normalized = v.normalize();
        assert!((normalized.length() - 1.0).abs() < 1e-10);
    }
}
