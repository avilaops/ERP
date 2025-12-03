//! 4096-bit signed integer type (two's complement)

use crate::u4096::U4096;
use core::cmp::Ordering;
use core::ops::{Add, Sub, Mul, Div, Rem, Neg, BitAnd, BitOr, BitXor, Not, Shl, Shr};

/// 4096-bit signed integer (two's complement)
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct I4096(pub U4096);

impl I4096 {
    /// Zero value
    pub const ZERO: Self = Self(U4096::ZERO);

    /// One value
    pub const ONE: Self = Self(U4096::ONE);

    /// Negative one
    pub const NEG_ONE: Self = Self(U4096::MAX);

    /// Check if negative
    #[inline]
    pub fn is_negative(&self) -> bool {
        (self.0).0[63] & (1u64 << 63) != 0
    }

    /// Check if positive
    #[inline]
    pub fn is_positive(&self) -> bool {
        !self.is_negative() && !self.is_zero()
    }

    /// Check if zero
    #[inline]
    pub fn is_zero(&self) -> bool {
        self.0.is_zero()
    }

    /// Absolute value
    pub fn abs(&self) -> Self {
        if self.is_negative() { -*self } else { *self }
    }

    /// Create from i64
    pub fn from_i64(value: i64) -> Self {
        if value >= 0 {
            Self(U4096::from_u64(value as u64))
        } else {
            Self(!U4096::from_u64(value.unsigned_abs()) + U4096::ONE)
        }
    }
}

impl Add for I4096 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self { Self(self.0 + rhs.0) }
}

impl Sub for I4096 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self { Self(self.0 - rhs.0) }
}

impl Mul for I4096 {
    type Output = Self;
    fn mul(self, rhs: Self) -> Self { Self(self.0 * rhs.0) }
}

impl Div for I4096 {
    type Output = Self;
    fn div(self, rhs: Self) -> Self {
        let neg = self.is_negative() ^ rhs.is_negative();
        let q = self.abs().0 / rhs.abs().0;
        if neg { Self(!q + U4096::ONE) } else { Self(q) }
    }
}

impl Rem for I4096 {
    type Output = Self;
    fn rem(self, rhs: Self) -> Self {
        let r = self.abs().0 % rhs.abs().0;
        if self.is_negative() { Self(!r + U4096::ONE) } else { Self(r) }
    }
}

impl Neg for I4096 {
    type Output = Self;
    fn neg(self) -> Self { Self(!self.0 + U4096::ONE) }
}

impl BitAnd for I4096 {
    type Output = Self;
    fn bitand(self, rhs: Self) -> Self { Self(self.0 & rhs.0) }
}

impl BitOr for I4096 {
    type Output = Self;
    fn bitor(self, rhs: Self) -> Self { Self(self.0 | rhs.0) }
}

impl BitXor for I4096 {
    type Output = Self;
    fn bitxor(self, rhs: Self) -> Self { Self(self.0 ^ rhs.0) }
}

impl Not for I4096 {
    type Output = Self;
    fn not(self) -> Self { Self(!self.0) }
}

impl Shl<u32> for I4096 {
    type Output = Self;
    fn shl(self, rhs: u32) -> Self { Self(self.0 << rhs) }
}

impl Shr<u32> for I4096 {
    type Output = Self;
    fn shr(self, rhs: u32) -> Self {
        if self.is_negative() && rhs > 0 && rhs < 4096 {
            let shifted = self.0 >> rhs;
            let fill = U4096::MAX << (4096 - rhs);
            Self(shifted | fill)
        } else {
            Self(self.0 >> rhs)
        }
    }
}

impl PartialOrd for I4096 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}

impl Ord for I4096 {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self.is_negative(), other.is_negative()) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            (true, true) => other.0.cmp(&self.0),
            (false, false) => self.0.cmp(&other.0),
        }
    }
}

impl core::fmt::Debug for I4096 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "I4096")
    }
}

impl core::fmt::Display for I4096 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "I4096({})", self.0 .0[0])
    }
}

impl I4096 {
    /// Create from little-endian bytes (two's complement)
    pub fn from_le_bytes(bytes: &[u8]) -> Self {
        Self(U4096::from_le_bytes(bytes))
    }

    /// Convert to little-endian bytes (two's complement)
    pub fn to_le_bytes(&self) -> [u8; 512] {
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
            i64::MIN
        } else if self.0 <= U4096::from_u64(i64::MAX as u64) {
            self.0.to_u64() as i64
        } else {
            i64::MAX
        }
    }
}

impl crate::traits::BigInt for I4096 {
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
        unsafe { core::slice::from_raw_parts(self as *const I4096 as *const u8, 512) }
    }

    #[inline]
    fn bits(&self) -> u32 {
        4096
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
    fn test_basic() {
        let a = I4096::from_i64(10);
        let b = I4096::from_i64(-10);
        assert!(a > b);
    }
}
