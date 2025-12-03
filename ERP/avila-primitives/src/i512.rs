//! 512-bit signed integer type (two's complement)

use crate::u512::U512;
use core::cmp::Ordering;
use core::ops::{Add, Sub, Mul, Div, Rem, Neg, BitAnd, BitOr, BitXor, Not, Shl, Shr};

/// 512-bit signed integer (two's complement)
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct I512(pub U512);

impl I512 {
    /// Zero value
    pub const ZERO: Self = Self(U512::ZERO);

    /// One value
    pub const ONE: Self = Self(U512::ONE);

    /// Negative one
    pub const NEG_ONE: Self = Self(U512::MAX);

    /// Minimum value
    pub const MIN: Self = Self(U512([0, 0, 0, 0, 0, 0, 0, 1u64 << 63]));

    /// Maximum value
    pub const MAX: Self = Self(U512([u64::MAX, u64::MAX, u64::MAX, u64::MAX, u64::MAX, u64::MAX, u64::MAX, (1u64 << 63) - 1]));

    /// Check if negative
    #[inline]
    pub const fn is_negative(&self) -> bool {
        (self.0).0[7] & (1u64 << 63) != 0
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
            Self(U512::from_u64(value as u64))
        } else {
            let abs = value.unsigned_abs();
            let mut result = U512::from_u64(abs);
            result = !result;
            result = result + U512::ONE;
            Self(result)
        }
    }
}

impl Add for I512 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self(self.0 + rhs.0)
    }
}

impl Sub for I512 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Self(self.0 - rhs.0)
    }
}

impl Mul for I512 {
    type Output = Self;
    fn mul(self, rhs: Self) -> Self {
        Self(self.0 * rhs.0)
    }
}

impl Div for I512 {
    type Output = Self;
    fn div(self, rhs: Self) -> Self {
        let neg_result = self.is_negative() ^ rhs.is_negative();
        let lhs_abs = self.abs().0;
        let rhs_abs = rhs.abs().0;
        let quotient = lhs_abs / rhs_abs;
        if neg_result {
            Self(!quotient + U512::ONE)
        } else {
            Self(quotient)
        }
    }
}

impl Rem for I512 {
    type Output = Self;
    fn rem(self, rhs: Self) -> Self {
        let lhs_neg = self.is_negative();
        let lhs_abs = self.abs().0;
        let rhs_abs = rhs.abs().0;
        let remainder = lhs_abs % rhs_abs;
        if lhs_neg {
            Self(!remainder + U512::ONE)
        } else {
            Self(remainder)
        }
    }
}

impl Neg for I512 {
    type Output = Self;
    fn neg(self) -> Self {
        Self(!self.0 + U512::ONE)
    }
}

impl BitAnd for I512 {
    type Output = Self;
    fn bitand(self, rhs: Self) -> Self {
        Self(self.0 & rhs.0)
    }
}

impl BitOr for I512 {
    type Output = Self;
    fn bitor(self, rhs: Self) -> Self {
        Self(self.0 | rhs.0)
    }
}

impl BitXor for I512 {
    type Output = Self;
    fn bitxor(self, rhs: Self) -> Self {
        Self(self.0 ^ rhs.0)
    }
}

impl Not for I512 {
    type Output = Self;
    fn not(self) -> Self {
        Self(!self.0)
    }
}

impl Shl<u32> for I512 {
    type Output = Self;
    fn shl(self, rhs: u32) -> Self {
        Self(self.0 << rhs)
    }
}

impl Shr<u32> for I512 {
    type Output = Self;
    fn shr(self, rhs: u32) -> Self {
        if self.is_negative() && rhs > 0 && rhs < 512 {
            let shifted = self.0 >> rhs;
            let fill = U512::MAX << (512 - rhs);
            Self(shifted | fill)
        } else {
            Self(self.0 >> rhs)
        }
    }
}

impl PartialOrd for I512 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for I512 {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self.is_negative(), other.is_negative()) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            (true, true) => other.0.cmp(&self.0),
            (false, false) => self.0.cmp(&other.0),
        }
    }
}

impl core::fmt::Debug for I512 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        if self.is_negative() {
            write!(f, "I512(-{:?})", self.abs().0)
        } else {
            write!(f, "I512({:?})", self.0)
        }
    }
}

impl core::fmt::Display for I512 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        if self.is_negative() {
            write!(f, "-{}", self.abs().0)
        } else {
            write!(f, "{}", self.0)
        }
    }
}

impl I512 {
    /// Create from little-endian bytes (two's complement)
    pub fn from_le_bytes(bytes: &[u8]) -> Self {
        Self(U512::from_le_bytes(bytes))
    }

    /// Convert to little-endian bytes (two's complement)
    pub fn to_le_bytes(&self) -> [u8; 64] {
        self.0.to_le_bytes()
    }

    /// Constant-time equality
    #[inline]
    pub fn ct_eq(&self, other: &Self) -> bool {
        self.0.ct_eq(&other.0)
    }

    /// Convert to i64 (with truncation/clamping)
    pub fn to_i64(&self) -> i64 {
        if self.is_negative() {
            let abs = self.abs();
            if abs.0 <= U512::from_u64(i64::MAX as u64 + 1) {
                -(abs.0.to_u64() as i64)
            } else {
                i64::MIN
            }
        } else {
            if self.0 <= U512::from_u64(i64::MAX as u64) {
                self.0.to_u64() as i64
            } else {
                i64::MAX
            }
        }
    }
}

impl crate::traits::BigInt for I512 {
    #[inline]
    fn from_i64(value: i64) -> Self {
        Self::from_i64(value)
    }

    #[inline]
    fn to_i64(&self) -> i64 {
        Self::to_i64(self)
    }

    #[inline]
    fn from_le_bytes(bytes: &[u8]) -> Self {
        Self::from_le_bytes(bytes)
    }

    #[inline]
    fn to_le_bytes(&self) -> &[u8] {
        unsafe { core::slice::from_raw_parts(self as *const I512 as *const u8, 64) }
    }

    #[inline]
    fn bits(&self) -> u32 {
        512
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
    fn test_arithmetic() {
        let a = I512::from_i64(10);
        let b = I512::from_i64(5);
        let c = I512::from_i64(-5);

        assert_eq!((a + b).0 .0[0], 15);
        assert_eq!((a - b).0 .0[0], 5);
        assert_eq!((a + c).0 .0[0], 5);
    }

    #[test]
    fn test_comparison() {
        let a = I512::from_i64(10);
        let b = I512::from_i64(-10);
        assert!(a > b);
        assert!(b < a);
    }
}
