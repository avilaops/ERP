//! # avila-bignum - Big Integer Arithmetic
//!
//! Arbitrary-precision integer arithmetic for cryptography.
//!
//! ## Types
//! - `U1024`: 1024-bit unsigned integer (128 bytes)
//! - `U2048`: 2048-bit unsigned integer (256 bytes) - RSA-2048
//! - `U4096`: 4096-bit unsigned integer (512 bytes) - RSA-4096
//! - `I4096`: 4096-bit signed integer

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

/// 1024-bit unsigned integer (16 × 64-bit limbs)
#[repr(align(64))]
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct U1024 {
    /// Limbs in little-endian order
    pub limbs: [u64; 16],
}

impl U1024 {
    /// Zero constant
    pub const ZERO: Self = Self { limbs: [0; 16] };

    /// One constant
    pub const ONE: Self = Self {
        limbs: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    };

    /// Number of bits
    pub const BITS: u32 = 1024;

    /// Number of limbs
    pub const LIMBS: usize = 16;

    /// Creates from u64
    #[inline]
    pub const fn from_u64(val: u64) -> Self {
        let mut limbs = [0u64; 16];
        limbs[0] = val;
        Self { limbs }
    }

    /// Checks if zero
    pub fn is_zero(&self) -> bool {
        self.limbs.iter().all(|&x| x == 0)
    }

    /// Addition with carry
    pub fn add_assign(&mut self, other: &Self) -> bool {
        let mut carry = 0u64;
        for i in 0..16 {
            let (sum, c1) = self.limbs[i].overflowing_add(other.limbs[i]);
            let (sum, c2) = sum.overflowing_add(carry);
            self.limbs[i] = sum;
            carry = (c1 as u64) + (c2 as u64);
        }
        carry != 0
    }
}

impl Default for U1024 {
    fn default() -> Self {
        Self::ZERO
    }
}

/// 2048-bit unsigned integer (32 × 64-bit limbs) - RSA-2048
#[repr(align(128))]
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct U2048 {
    /// Limbs in little-endian order
    pub limbs: [u64; 32],
}

impl U2048 {
    /// Zero constant
    pub const ZERO: Self = Self { limbs: [0; 32] };

    /// One constant
    pub const ONE: Self = {
        let mut limbs = [0u64; 32];
        limbs[0] = 1;
        Self { limbs }
    };

    /// Number of bits
    pub const BITS: u32 = 2048;

    /// Number of limbs
    pub const LIMBS: usize = 32;

    /// Creates from u64
    #[inline]
    pub const fn from_u64(val: u64) -> Self {
        let mut limbs = [0u64; 32];
        limbs[0] = val;
        Self { limbs }
    }

    /// Checks if zero
    pub fn is_zero(&self) -> bool {
        self.limbs.iter().all(|&x| x == 0)
    }
}

impl Default for U2048 {
    fn default() -> Self {
        Self::ZERO
    }
}

/// 4096-bit unsigned integer (64 × 64-bit limbs) - RSA-4096
#[repr(align(256))]
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct U4096 {
    /// Limbs in little-endian order
    pub limbs: [u64; 64],
}

impl U4096 {
    /// Zero constant
    pub const ZERO: Self = Self { limbs: [0; 64] };

    /// One constant
    pub const ONE: Self = {
        let mut limbs = [0u64; 64];
        limbs[0] = 1;
        Self { limbs }
    };

    /// Number of bits
    pub const BITS: u32 = 4096;

    /// Number of limbs
    pub const LIMBS: usize = 64;

    /// Creates from u64
    #[inline]
    pub const fn from_u64(val: u64) -> Self {
        let mut limbs = [0u64; 64];
        limbs[0] = val;
        Self { limbs }
    }

    /// Checks if zero
    pub fn is_zero(&self) -> bool {
        self.limbs.iter().all(|&x| x == 0)
    }
}

impl Default for U4096 {
    fn default() -> Self {
        Self::ZERO
    }
}

/// 4096-bit signed integer
#[repr(align(256))]
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct I4096 {
    /// Magnitude (absolute value)
    pub mag: U4096,
    /// Sign bit (false = positive, true = negative)
    pub neg: bool,
}

impl I4096 {
    /// Zero constant
    pub const ZERO: Self = Self {
        mag: U4096::ZERO,
        neg: false,
    };

    /// One constant
    pub const ONE: Self = Self {
        mag: U4096::ONE,
        neg: false,
    };

    /// Creates from i64
    pub const fn from_i64(val: i64) -> Self {
        let neg = val < 0;
        let mag = U4096::from_u64(val.unsigned_abs());
        Self { mag, neg }
    }

    /// Checks if zero
    pub fn is_zero(&self) -> bool {
        self.mag.is_zero()
    }

    /// Checks if negative
    pub const fn is_negative(&self) -> bool {
        self.neg
    }
}

impl Default for I4096 {
    fn default() -> Self {
        Self::ZERO
    }
}

/// Prelude
pub mod prelude {
    pub use crate::{U1024, U2048, U4096, I4096};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_u1024_zero() {
        let z = U1024::ZERO;
        assert!(z.is_zero());
    }

    #[test]
    fn test_u1024_one() {
        let o = U1024::ONE;
        assert!(!o.is_zero());
        assert_eq!(o.limbs[0], 1);
    }

    #[test]
    fn test_u1024_from_u64() {
        let n = U1024::from_u64(42);
        assert_eq!(n.limbs[0], 42);
    }

    #[test]
    fn test_u1024_add() {
        let mut a = U1024::from_u64(10);
        let b = U1024::from_u64(32);
        let overflow = a.add_assign(&b);
        assert!(!overflow);
        assert_eq!(a.limbs[0], 42);
    }

    #[test]
    fn test_u2048_constants() {
        assert!(U2048::ZERO.is_zero());
        assert!(!U2048::ONE.is_zero());
    }

    #[test]
    fn test_u4096_constants() {
        assert!(U4096::ZERO.is_zero());
        assert!(!U4096::ONE.is_zero());
    }

    #[test]
    fn test_i4096_signed() {
        let pos = I4096::from_i64(42);
        assert!(!pos.is_negative());

        let neg = I4096::from_i64(-42);
        assert!(neg.is_negative());

        let zero = I4096::ZERO;
        assert!(zero.is_zero());
    }
}
