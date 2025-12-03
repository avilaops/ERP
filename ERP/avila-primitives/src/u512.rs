//! 512-bit unsigned integer type

use core::ops::{Add, Sub, Mul, Div, Rem, BitAnd, BitOr, BitXor, Not, Shl, Shr};
use core::cmp::Ordering;
use avila_nucleus::bits::{add512, sub512, mul512x512, div512, shl512, shr512, leading_zeros512, eq512, lt512, gt512};

/// 512-bit unsigned integer (8 x u64)
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct U512(pub [u64; 8]);

impl U512 {
    /// Zero value
    pub const ZERO: Self = Self([0; 8]);

    /// One value
    pub const ONE: Self = Self([1, 0, 0, 0, 0, 0, 0, 0]);

    /// Maximum value
    pub const MAX: Self = Self([u64::MAX; 8]);

    /// Create from u64
    #[inline]
    pub const fn from_u64(value: u64) -> Self {
        Self([value, 0, 0, 0, 0, 0, 0, 0])
    }

    /// Convert to u64 (lossy)
    #[inline]
    pub const fn to_u64(&self) -> u64 {
        self.0[0]
    }

    /// Count leading zeros
    #[inline]
    pub fn leading_zeros(&self) -> u32 {
        leading_zeros512(&self.0)
    }

    /// Check if zero
    #[inline]
    pub const fn is_zero(&self) -> bool {
        self.0[0] == 0 && self.0[1] == 0 && self.0[2] == 0 && self.0[3] == 0
            && self.0[4] == 0 && self.0[5] == 0 && self.0[6] == 0 && self.0[7] == 0
    }

    /// Constant-time equality
    #[inline]
    pub fn ct_eq(&self, other: &Self) -> bool {
        eq512(&self.0, &other.0)
    }

    /// Create from little-endian bytes
    pub fn from_le_bytes(bytes: &[u8]) -> Self {
        let mut result = [0u64; 8];
        for (i, chunk) in bytes.chunks(8).enumerate().take(8) {
            let mut buf = [0u8; 8];
            buf[..chunk.len()].copy_from_slice(chunk);
            result[i] = u64::from_le_bytes(buf);
        }
        Self(result)
    }

    /// Convert to little-endian bytes
    pub fn to_le_bytes(&self) -> [u8; 64] {
        let mut result = [0u8; 64];
        for (i, &word) in self.0.iter().enumerate() {
            result[i * 8..(i + 1) * 8].copy_from_slice(&word.to_le_bytes());
        }
        result
    }

    /// Count trailing zeros
    pub fn trailing_zeros(&self) -> u32 {
        for (i, &word) in self.0.iter().enumerate() {
            if word != 0 {
                return (i as u32) * 64 + word.trailing_zeros();
            }
        }
        512
    }
}

impl Add for U512 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        let (result, _carry) = add512(&self.0, &rhs.0);
        Self(result)
    }
}

impl Sub for U512 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        let (result, _borrow) = sub512(&self.0, &rhs.0);
        Self(result)
    }
}

impl Mul for U512 {
    type Output = Self;
    fn mul(self, rhs: Self) -> Self {
        let result = mul512x512(&self.0, &rhs.0);
        Self([result[0], result[1], result[2], result[3], result[4], result[5], result[6], result[7]])
    }
}

impl Div for U512 {
    type Output = Self;
    fn div(self, rhs: Self) -> Self {
        let (quotient, _) = div512(&self.0, &rhs.0);
        Self(quotient)
    }
}

impl Rem for U512 {
    type Output = Self;
    fn rem(self, rhs: Self) -> Self {
        let (_, remainder) = div512(&self.0, &rhs.0);
        Self(remainder)
    }
}

impl BitAnd for U512 {
    type Output = Self;
    fn bitand(self, rhs: Self) -> Self {
        Self([
            self.0[0] & rhs.0[0], self.0[1] & rhs.0[1],
            self.0[2] & rhs.0[2], self.0[3] & rhs.0[3],
            self.0[4] & rhs.0[4], self.0[5] & rhs.0[5],
            self.0[6] & rhs.0[6], self.0[7] & rhs.0[7],
        ])
    }
}

impl BitOr for U512 {
    type Output = Self;
    fn bitor(self, rhs: Self) -> Self {
        Self([
            self.0[0] | rhs.0[0], self.0[1] | rhs.0[1],
            self.0[2] | rhs.0[2], self.0[3] | rhs.0[3],
            self.0[4] | rhs.0[4], self.0[5] | rhs.0[5],
            self.0[6] | rhs.0[6], self.0[7] | rhs.0[7],
        ])
    }
}

impl BitXor for U512 {
    type Output = Self;
    fn bitxor(self, rhs: Self) -> Self {
        Self([
            self.0[0] ^ rhs.0[0], self.0[1] ^ rhs.0[1],
            self.0[2] ^ rhs.0[2], self.0[3] ^ rhs.0[3],
            self.0[4] ^ rhs.0[4], self.0[5] ^ rhs.0[5],
            self.0[6] ^ rhs.0[6], self.0[7] ^ rhs.0[7],
        ])
    }
}

impl Not for U512 {
    type Output = Self;
    fn not(self) -> Self {
        Self([
            !self.0[0], !self.0[1], !self.0[2], !self.0[3],
            !self.0[4], !self.0[5], !self.0[6], !self.0[7],
        ])
    }
}

impl Shl<u32> for U512 {
    type Output = Self;
    fn shl(self, rhs: u32) -> Self {
        let result = shl512(&self.0, rhs);
        Self(result)
    }
}

impl Shr<u32> for U512 {
    type Output = Self;
    fn shr(self, rhs: u32) -> Self {
        let result = shr512(&self.0, rhs);
        Self(result)
    }
}

impl PartialOrd for U512 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for U512 {
    fn cmp(&self, other: &Self) -> Ordering {
        if lt512(&self.0, &other.0) {
            Ordering::Less
        } else if gt512(&self.0, &other.0) {
            Ordering::Greater
        } else {
            Ordering::Equal
        }
    }
}

impl core::fmt::Debug for U512 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "U512(0x")?;
        for &word in self.0.iter().rev() {
            write!(f, "{:016x}", word)?;
        }
        write!(f, ")")
    }
}

impl core::fmt::Display for U512 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "0x")?;
        for &word in self.0.iter().rev() {
            write!(f, "{:016x}", word)?;
        }
        Ok(())
    }
}

impl crate::traits::BigUint for U512 {
    #[inline]
    fn from_u64(value: u64) -> Self {
        Self::from_u64(value)
    }

    #[inline]
    fn to_u64(&self) -> u64 {
        Self::to_u64(self)
    }

    #[inline]
    fn from_le_bytes(bytes: &[u8]) -> Self {
        Self::from_le_bytes(bytes)
    }

    #[inline]
    fn to_le_bytes(&self) -> &[u8] {
        unsafe { core::slice::from_raw_parts(self as *const U512 as *const u8, 64) }
    }

    #[inline]
    fn bits(&self) -> u32 {
        512
    }

    #[inline]
    fn leading_zeros(&self) -> u32 {
        Self::leading_zeros(self)
    }

    #[inline]
    fn trailing_zeros(&self) -> u32 {
        Self::trailing_zeros(self)
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
    fn test_basic_ops() {
        let a = U512::from_u64(100);
        let b = U512::from_u64(50);

        assert_eq!((a + b).to_u64(), 150);
        assert_eq!((a - b).to_u64(), 50);
        assert_eq!((a * b).to_u64(), 5000);
        assert_eq!((a / b).to_u64(), 2);
        assert_eq!((a % b).to_u64(), 0);
    }

    #[test]
    fn test_comparison() {
        let a = U512::from_u64(100);
        let b = U512::from_u64(50);

        assert!(a > b);
        assert!(b < a);
        assert_eq!(a, a);
    }
}
