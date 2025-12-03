//! 256-bit signed integer type (two's complement)

use crate::u256::U256;
use core::cmp::Ordering;
use core::ops::{Add, Sub, Mul, Div, Rem, Neg, BitAnd, BitOr, BitXor, Not, Shl, Shr};

/// 256-bit signed integer (two's complement)
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct I256(pub U256);

impl I256 {
    /// Zero value
    pub const ZERO: Self = Self(U256::ZERO);

    /// One value
    pub const ONE: Self = Self(U256::ONE);

    /// Negative one
    pub const NEG_ONE: Self = Self(U256::MAX);

    /// Minimum value
    pub const MIN: Self = Self(U256([0, 0, 0, 1u64 << 63]));

    /// Maximum value
    pub const MAX: Self = Self(U256([u64::MAX, u64::MAX, u64::MAX, (1u64 << 63) - 1]));

    /// Check if negative
    #[inline]
    pub const fn is_negative(&self) -> bool {
        (self.0).0[3] & (1u64 << 63) != 0
    }

    /// Check if positive
    #[inline]
    pub const fn is_positive(&self) -> bool {
        !self.is_negative() && !self.is_zero()
    }

    /// Check if zero
    #[inline]
    pub const fn is_zero(&self) -> bool {
        self.0.is_zero()
    }

    /// Absolute value
    pub fn abs(&self) -> Self {
        if self.is_negative() {
            -*self
        } else {
            *self
        }
    }

    /// Create from i64
    pub fn from_i64(value: i64) -> Self {
        if value >= 0 {
            Self(U256::from_u64(value as u64))
        } else {
            // Two's complement for negative numbers
            let abs = value.unsigned_abs();
            let mut result = U256::from_u64(abs);
            result = !result;
            result = result + U256::ONE;
            Self(result)
        }
    }

    /// Create from U256 (interpret as signed)
    pub const fn from_u256(value: U256) -> Self {
        Self(value)
    }

    /// To i64 with overflow check
    pub fn to_i64(&self) -> Option<i64> {
        if self.is_negative() {
            let abs = self.abs();
            if abs.0 .0[1] == 0 && abs.0 .0[2] == 0 && abs.0 .0[3] == 0 {
                let val = abs.0 .0[0];
                if val <= i64::MAX as u64 + 1 {
                    return Some(-(val as i64));
                }
            }
            None
        } else {
            if self.0 .0[1] == 0 && self.0 .0[2] == 0 && self.0 .0[3] == 0 {
                let val = self.0 .0[0];
                if val <= i64::MAX as u64 {
                    return Some(val as i64);
                }
            }
            None
        }
    }
}

// Arithmetic operations
impl Add for I256 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        Self(self.0 + rhs.0)
    }
}

impl Sub for I256 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self {
        Self(self.0 - rhs.0)
    }
}

impl Mul for I256 {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self {
        let result = self.0 * rhs.0;
        Self(result)
    }
}

impl Div for I256 {
    type Output = Self;

    fn div(self, rhs: Self) -> Self {
        let neg_result = self.is_negative() ^ rhs.is_negative();
        let lhs_abs = self.abs().0;
        let rhs_abs = rhs.abs().0;
        let quotient = lhs_abs / rhs_abs;

        if neg_result {
            Self(!quotient + U256::ONE)
        } else {
            Self(quotient)
        }
    }
}

impl Rem for I256 {
    type Output = Self;

    fn rem(self, rhs: Self) -> Self {
        let lhs_neg = self.is_negative();
        let lhs_abs = self.abs().0;
        let rhs_abs = rhs.abs().0;
        let remainder = lhs_abs % rhs_abs;

        if lhs_neg {
            Self(!remainder + U256::ONE)
        } else {
            Self(remainder)
        }
    }
}

impl Neg for I256 {
    type Output = Self;

    fn neg(self) -> Self {
        Self(!self.0 + U256::ONE)
    }
}

impl BitAnd for I256 {
    type Output = Self;

    fn bitand(self, rhs: Self) -> Self {
        Self(self.0 & rhs.0)
    }
}

impl BitOr for I256 {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self {
        Self(self.0 | rhs.0)
    }
}

impl BitXor for I256 {
    type Output = Self;

    fn bitxor(self, rhs: Self) -> Self {
        Self(self.0 ^ rhs.0)
    }
}

impl Not for I256 {
    type Output = Self;

    fn not(self) -> Self {
        Self(!self.0)
    }
}

impl Shl<u32> for I256 {
    type Output = Self;

    fn shl(self, rhs: u32) -> Self {
        Self(self.0 << rhs)
    }
}

impl Shr<u32> for I256 {
    type Output = Self;

    fn shr(self, rhs: u32) -> Self {
        // Arithmetic shift: preserve sign bit
        if self.is_negative() {
            let shifted = self.0 >> rhs;
            let fill = U256::MAX << (256 - rhs);
            Self(shifted | fill)
        } else {
            Self(self.0 >> rhs)
        }
    }
}

// Comparison
impl PartialOrd for I256 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for I256 {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self.is_negative(), other.is_negative()) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            (true, true) => other.0.cmp(&self.0), // Both negative, reverse order
            (false, false) => self.0.cmp(&other.0), // Both positive, normal order
        }
    }
}

// Display
impl core::fmt::Debug for I256 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        if self.is_negative() {
            write!(f, "I256(-{:?})", self.abs().0)
        } else {
            write!(f, "I256({:?})", self.0)
        }
    }
}

impl core::fmt::Display for I256 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        if let Some(val) = self.to_i64() {
            write!(f, "{}", val)
        } else if self.is_negative() {
            write!(f, "-{}", self.abs().0)
        } else {
            write!(f, "{}", self.0)
        }
    }
}

impl I256 {
    /// Create from little-endian bytes (two's complement)
    pub fn from_le_bytes(bytes: &[u8]) -> Self {
        Self(U256::from_le_bytes(bytes))
    }

    /// Convert to little-endian bytes (two's complement)
    pub fn to_le_bytes(&self) -> [u8; 32] {
        self.0.to_le_bytes()
    }

    /// Constant-time equality
    #[inline]
    pub fn ct_eq(&self, other: &Self) -> bool {
        self.0.ct_eq(&other.0)
    }
}

impl crate::traits::BigInt for I256 {
    #[inline]
    fn from_i64(value: i64) -> Self {
        Self::from_i64(value)
    }

    #[inline]
    fn to_i64(&self) -> i64 {
        Self::to_i64(self).unwrap_or(if self.is_negative() { i64::MIN } else { i64::MAX })
    }

    #[inline]
    fn from_le_bytes(bytes: &[u8]) -> Self {
        Self::from_le_bytes(bytes)
    }

    #[inline]
    fn to_le_bytes(&self) -> &[u8] {
        unsafe { core::slice::from_raw_parts(self as *const I256 as *const u8, 32) }
    }

    #[inline]
    fn bits(&self) -> u32 {
        256
    }

    #[inline]
    fn is_negative(&self) -> bool {
        Self::is_negative(self)
    }

    #[inline]
    fn abs(&self) -> Self {
        Self::abs(self)
    }

    #[inline]
    fn ct_eq(&self, other: &Self) -> bool {
        Self::ct_eq(self, other)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_i64() {
        let pos = I256::from_i64(42);
        assert_eq!(pos.to_i64(), Some(42));

        let neg = I256::from_i64(-42);
        assert_eq!(neg.to_i64(), Some(-42));

        let zero = I256::from_i64(0);
        assert_eq!(zero.to_i64(), Some(0));
    }

    #[test]
    fn test_arithmetic() {
        let a = I256::from_i64(10);
        let b = I256::from_i64(5);

        assert_eq!((a + b).to_i64(), Some(15));
        assert_eq!((a - b).to_i64(), Some(5));
        assert_eq!((a * b).to_i64(), Some(50));
        assert_eq!((a / b).to_i64(), Some(2));
    }

    #[test]
    fn test_negative_arithmetic() {
        let a = I256::from_i64(-10);
        let b = I256::from_i64(5);

        assert_eq!((a + b).to_i64(), Some(-5));
        assert_eq!((a - b).to_i64(), Some(-15));
        assert_eq!((a * b).to_i64(), Some(-50));
        assert_eq!((a / b).to_i64(), Some(-2));
    }

    #[test]
    fn test_abs_neg() {
        let pos = I256::from_i64(42);
        let neg = I256::from_i64(-42);

        assert_eq!(pos.abs().to_i64(), Some(42));
        assert_eq!(neg.abs().to_i64(), Some(42));
        assert_eq!((-pos).to_i64(), Some(-42));
        assert_eq!((-neg).to_i64(), Some(42));
    }

    #[test]
    fn test_comparison() {
        let a = I256::from_i64(10);
        let b = I256::from_i64(5);
        let c = I256::from_i64(-5);

        assert!(a > b);
        assert!(b > c);
        assert!(c < b);
        assert!(a > c);
    }
}
