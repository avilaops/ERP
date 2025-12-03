//! 2048-bit signed integer type (two's complement)

use crate::u2048::U2048;
use core::cmp::Ordering;
use core::ops::{Add, Sub, Mul, Div, Rem, Neg, BitAnd, BitOr, BitXor, Not, Shl, Shr};

/// 2048-bit signed integer (two's complement)
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct I2048(pub U2048);

impl I2048 {
    /// Zero value
    pub const ZERO: Self = Self(U2048::ZERO);

    /// One value
    pub const ONE: Self = Self(U2048::ONE);

    /// Negative one
    pub const NEG_ONE: Self = Self(U2048::MAX);

    /// Check if negative
    #[inline]
    pub const fn is_negative(&self) -> bool {
        (self.0).0[31] & (1u64 << 63) != 0
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
        if self.is_negative() { -*self } else { *self }
    }

    /// Create from i64
    pub fn from_i64(value: i64) -> Self {
        if value >= 0 {
            Self(U2048::from_u64(value as u64))
        } else {
            Self(!U2048::from_u64(value.unsigned_abs()) + U2048::ONE)
        }
    }
}

impl Add for I2048 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self { Self(self.0 + rhs.0) }
}

impl Sub for I2048 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self { Self(self.0 - rhs.0) }
}

impl Mul for I2048 {
    type Output = Self;
    fn mul(self, rhs: Self) -> Self { Self(self.0 * rhs.0) }
}

impl Div for I2048 {
    type Output = Self;
    fn div(self, rhs: Self) -> Self {
        let neg = self.is_negative() ^ rhs.is_negative();
        let q = self.abs().0 / rhs.abs().0;
        if neg { Self(!q + U2048::ONE) } else { Self(q) }
    }
}

impl Rem for I2048 {
    type Output = Self;
    fn rem(self, rhs: Self) -> Self {
        let r = self.abs().0 % rhs.abs().0;
        if self.is_negative() { Self(!r + U2048::ONE) } else { Self(r) }
    }
}

impl Neg for I2048 {
    type Output = Self;
    fn neg(self) -> Self { Self(!self.0 + U2048::ONE) }
}

impl BitAnd for I2048 {
    type Output = Self;
    fn bitand(self, rhs: Self) -> Self { Self(self.0 & rhs.0) }
}

impl BitOr for I2048 {
    type Output = Self;
    fn bitor(self, rhs: Self) -> Self { Self(self.0 | rhs.0) }
}

impl BitXor for I2048 {
    type Output = Self;
    fn bitxor(self, rhs: Self) -> Self { Self(self.0 ^ rhs.0) }
}

impl Not for I2048 {
    type Output = Self;
    fn not(self) -> Self { Self(!self.0) }
}

impl Shl<u32> for I2048 {
    type Output = Self;
    fn shl(self, rhs: u32) -> Self { Self(self.0 << rhs) }
}

impl Shr<u32> for I2048 {
    type Output = Self;
    fn shr(self, rhs: u32) -> Self {
        if self.is_negative() && rhs > 0 && rhs < 2048 {
            let shifted = self.0 >> rhs;
            let fill = U2048::MAX << (2048 - rhs);
            Self(shifted | fill)
        } else {
            Self(self.0 >> rhs)
        }
    }
}

impl PartialOrd for I2048 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}

impl Ord for I2048 {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self.is_negative(), other.is_negative()) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            (true, true) => other.0.cmp(&self.0),
            (false, false) => self.0.cmp(&other.0),
        }
    }
}

impl core::fmt::Debug for I2048 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "I2048")
    }
}

impl core::fmt::Display for I2048 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "I2048({})", self.0 .0[0])
    }
}

impl I2048 {
    /// Create from little-endian bytes (two's complement)
    pub fn from_le_bytes(bytes: &[u8]) -> Self {
        Self(U2048::from_le_bytes(bytes))
    }

    /// Convert to little-endian bytes (two's complement)
    pub fn to_le_bytes(&self) -> [u8; 256] {
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
        } else if self.0 <= U2048::from_u64(i64::MAX as u64) {
            self.0.to_u64() as i64
        } else {
            i64::MAX
        }
    }
}

impl crate::traits::BigInt for I2048 {
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
        unsafe { core::slice::from_raw_parts(self as *const I2048 as *const u8, 256) }
    }

    #[inline]
    fn bits(&self) -> u32 {
        2048
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
        let a = I2048::from_i64(10);
        let b = I2048::from_i64(-10);
        assert!(a > b);
    }
}
