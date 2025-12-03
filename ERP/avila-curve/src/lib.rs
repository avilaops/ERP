//! # avila-curve - Elliptic Curves
//!
//! Elliptic curve operations for cryptography.
//!
//! ## Supported Curves
//! - secp256k1 (Bitcoin, Ethereum)
//! - Ed25519 (modern signatures)
//! - P-256 (NIST standard)

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

/// Affine point on an elliptic curve
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AffinePoint {
    /// X coordinate
    pub x: [u64; 4],
    /// Y coordinate
    pub y: [u64; 4],
    /// Infinity flag
    pub infinity: bool,
}

impl AffinePoint {
    /// Point at infinity
    pub const INFINITY: Self = Self {
        x: [0; 4],
        y: [0; 4],
        infinity: true,
    };

    /// Creates new point
    pub const fn new(x: [u64; 4], y: [u64; 4]) -> Self {
        Self {
            x,
            y,
            infinity: false,
        }
    }

    /// Checks if point is infinity
    pub const fn is_infinity(&self) -> bool {
        self.infinity
    }
}

impl Default for AffinePoint {
    fn default() -> Self {
        Self::INFINITY
    }
}

/// Projective point (X, Y, Z) where x = X/Z, y = Y/Z
#[derive(Clone, Copy, Debug)]
pub struct ProjectivePoint {
    /// X coordinate
    pub x: [u64; 4],
    /// Y coordinate
    pub y: [u64; 4],
    /// Z coordinate
    pub z: [u64; 4],
}

impl ProjectivePoint {
    /// Point at infinity
    pub const INFINITY: Self = Self {
        x: [0; 4],
        y: [1; 4],
        z: [0; 4],
    };

    /// Creates new point
    pub const fn new(x: [u64; 4], y: [u64; 4], z: [u64; 4]) -> Self {
        Self { x, y, z }
    }

    /// Checks if Z == 0 (point at infinity)
    pub fn is_infinity(&self) -> bool {
        self.z.iter().all(|&limb| limb == 0)
    }
}

impl Default for ProjectivePoint {
    fn default() -> Self {
        Self::INFINITY
    }
}

/// secp256k1 curve parameters
pub mod secp256k1 {
    use super::*;

    /// Prime field modulus (2^256 - 2^32 - 977)
    pub const P: [u64; 4] = [
        0xFFFFFFFFFFFFFFFF,
        0xFFFFFFFFFFFFFFFE,
        0xBAAEDCE6AF48A03B,
        0xBFD25E8CD0364141,
    ];

    /// Curve order (number of points)
    pub const N: [u64; 4] = [
        0xBFD25E8CD0364141,
        0xBAAEDCE6AF48A03B,
        0xFFFFFFFFFFFFFFFE,
        0xFFFFFFFFFFFFFFFF,
    ];

    /// Generator point X coordinate
    pub const GX: [u64; 4] = [
        0x59F2815B16F81798,
        0x029BFCDB2DCE28D9,
        0x55A06295CE870B07,
        0x79BE667EF9DCBBAC,
    ];

    /// Generator point Y coordinate
    pub const GY: [u64; 4] = [
        0x9C47D08FFB10D4B8,
        0xFD17B448A6855419,
        0x5DA4FBFC0E1108A8,
        0x483ADA7726A3C465,
    ];

    /// Curve parameter a (secp256k1: a = 0)
    pub const A: [u64; 4] = [0, 0, 0, 0];

    /// Curve parameter b (secp256k1: b = 7)
    pub const B: [u64; 4] = [7, 0, 0, 0];
}

/// Ed25519 curve parameters (Twisted Edwards curve)
pub mod ed25519 {
    use super::*;

    /// Prime field modulus (2^255 - 19)
    pub const P: [u64; 4] = [
        0xFFFFFFFFFFFFFFED,
        0xFFFFFFFFFFFFFFFF,
        0xFFFFFFFFFFFFFFFF,
        0x7FFFFFFFFFFFFFFF,
    ];

    /// Curve order
    pub const L: [u64; 4] = [
        0x5812631A5CF5D3ED,
        0x14DEF9DEA2F79CD6,
        0x0000000000000000,
        0x1000000000000000,
    ];

    /// Parameter d = -121665/121666 mod p
    pub const D: [u64; 4] = [
        0x75EB4DCA135978A3,
        0x00700A4D4141D8AB,
        0x8CC740797779E898,
        0x52036CEE2B6FFE73,
    ];
}

/// P-256 (NIST) curve parameters
pub mod p256 {
    use super::*;

    /// Prime field modulus
    pub const P: [u64; 4] = [
        0xFFFFFFFFFFFFFFFF,
        0x00000000FFFFFFFF,
        0x0000000000000000,
        0xFFFFFFFF00000001,
    ];

    /// Curve parameter a = p - 3
    pub const A: [u64; 4] = [
        0xFFFFFFFFFFFFFFFC,
        0x00000000FFFFFFFF,
        0x0000000000000000,
        0xFFFFFFFF00000001,
    ];

    /// Curve parameter b
    pub const B: [u64; 4] = [
        0x3BCE3C3E27D2604B,
        0x651D06B0CC53B0F6,
        0xB3EBBD55769886BC,
        0x5AC635D8AA3A93E7,
    ];
}

/// Prelude
pub mod prelude {
    pub use crate::{AffinePoint, ProjectivePoint};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_affine_infinity() {
        let inf = AffinePoint::INFINITY;
        assert!(inf.is_infinity());
    }

    #[test]
    fn test_affine_point() {
        let p = AffinePoint::new([1, 0, 0, 0], [2, 0, 0, 0]);
        assert!(!p.is_infinity());
        assert_eq!(p.x[0], 1);
        assert_eq!(p.y[0], 2);
    }

    #[test]
    fn test_projective_infinity() {
        let inf = ProjectivePoint::INFINITY;
        assert!(inf.is_infinity());
    }

    #[test]
    fn test_projective_point() {
        let p = ProjectivePoint::new([1, 0, 0, 0], [2, 0, 0, 0], [1, 0, 0, 0]);
        assert!(!p.is_infinity());
    }

    #[test]
    fn test_secp256k1_constants() {
        // Just verify they exist and are non-zero
        assert_ne!(secp256k1::GX[0], 0);
        assert_ne!(secp256k1::GY[0], 0);
        assert_eq!(secp256k1::A[0], 0);
        assert_eq!(secp256k1::B[0], 7);
    }
}
