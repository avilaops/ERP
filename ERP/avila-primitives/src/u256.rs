//! 256-bit unsigned integer type

use core::ops::{Add, Sub, Mul, Div, Rem, BitAnd, BitOr, BitXor, Not, Shl, Shr};
use core::cmp::Ordering;
use avila_nucleus::bits::{add256, sub256, mul256x256, div256, shl256, shr256, leading_zeros256};

/// 256-bit unsigned integer
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct U256(pub [u64; 4]);

impl U256 {
    /// Zero value
    pub const ZERO: Self = Self([0; 4]);

    /// One value
    pub const ONE: Self = Self([1, 0, 0, 0]);

    /// Maximum value
    pub const MAX: Self = Self([u64::MAX; 4]);

    /// Create from u64
    #[inline]
    pub const fn from_u64(value: u64) -> Self {
        Self([value, 0, 0, 0])
    }

    /// Convert to u64 (lossy - only low 64 bits)
    #[inline]
    pub const fn to_u64(&self) -> u64 {
        self.0[0]
    }

    /// Create from little-endian bytes
    pub fn from_le_bytes(bytes: &[u8]) -> Self {
        let mut result = [0u64; 4];
        for (i, chunk) in bytes.chunks(8).enumerate().take(4) {
            let mut word = [0u8; 8];
            word[..chunk.len()].copy_from_slice(chunk);
            result[i] = u64::from_le_bytes(word);
        }
        Self(result)
    }

    /// Convert to little-endian bytes
    pub fn to_le_bytes(&self) -> [u8; 32] {
        let mut result = [0u8; 32];
        for (i, &word) in self.0.iter().enumerate() {
            result[i * 8..(i + 1) * 8].copy_from_slice(&word.to_le_bytes());
        }
        result
    }

    /// Count leading zeros
    #[inline]
    pub fn leading_zeros(&self) -> u32 {
        leading_zeros256(&self.0)
    }

    /// Check if zero
    #[inline]
    pub const fn is_zero(&self) -> bool {
        self.0[0] == 0 && self.0[1] == 0 && self.0[2] == 0 && self.0[3] == 0
    }

    /// Count trailing zeros
    pub fn trailing_zeros(&self) -> u32 {
        for (i, &word) in self.0.iter().enumerate() {
            if word != 0 {
                return word.trailing_zeros() + (i as u32 * 64);
            }
        }
        256
    }

    /// Constant-time equality
    #[inline]
    pub fn ct_eq(&self, other: &Self) -> bool {
        let diff = self.0[0] ^ other.0[0] |
                   self.0[1] ^ other.0[1] |
                   self.0[2] ^ other.0[2] |
                   self.0[3] ^ other.0[3];
        diff == 0
    }
}

impl Add for U256 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        let (result, _carry) = add256(&self.0, &rhs.0);
        Self(result)
    }
}

impl Sub for U256 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self {
        let (result, _borrow) = sub256(&self.0, &rhs.0);
        Self(result)
    }
}

impl Mul for U256 {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self {
        let result = mul256x256(&self.0, &rhs.0);
        Self([result[0], result[1], result[2], result[3]])
    }
}

impl Div for U256 {
    type Output = Self;

    fn div(self, rhs: Self) -> Self {
        let (quotient, _remainder) = div256(&self.0, &rhs.0);
        Self(quotient)
    }
}

impl Rem for U256 {
    type Output = Self;

    fn rem(self, rhs: Self) -> Self {
        let (_quotient, remainder) = div256(&self.0, &rhs.0);
        Self(remainder)
    }
}impl BitAnd for U256 {
    type Output = Self;

    fn bitand(self, rhs: Self) -> Self {
        Self([
            self.0[0] & rhs.0[0],
            self.0[1] & rhs.0[1],
            self.0[2] & rhs.0[2],
            self.0[3] & rhs.0[3],
        ])
    }
}

impl BitOr for U256 {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self {
        Self([
            self.0[0] | rhs.0[0],
            self.0[1] | rhs.0[1],
            self.0[2] | rhs.0[2],
            self.0[3] | rhs.0[3],
        ])
    }
}

impl BitXor for U256 {
    type Output = Self;

    fn bitxor(self, rhs: Self) -> Self {
        Self([
            self.0[0] ^ rhs.0[0],
            self.0[1] ^ rhs.0[1],
            self.0[2] ^ rhs.0[2],
            self.0[3] ^ rhs.0[3],
        ])
    }
}

impl Not for U256 {
    type Output = Self;

    fn not(self) -> Self {
        Self([
            !self.0[0],
            !self.0[1],
            !self.0[2],
            !self.0[3],
        ])
    }
}

impl Shl<u32> for U256 {
    type Output = Self;

    fn shl(self, rhs: u32) -> Self {
        let result = shl256(&self.0, rhs);
        Self(result)
    }
}

impl Shr<u32> for U256 {
    type Output = Self;

    fn shr(self, rhs: u32) -> Self {
        let result = shr256(&self.0, rhs);
        Self(result)
    }
}

impl PartialOrd for U256 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for U256 {
    fn cmp(&self, other: &Self) -> Ordering {
        for i in (0..4).rev() {
            match self.0[i].cmp(&other.0[i]) {
                Ordering::Equal => continue,
                ord => return ord,
            }
        }
        Ordering::Equal
    }
}

impl core::fmt::Debug for U256 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "U256(0x")?;
        for &word in self.0.iter().rev() {
            write!(f, "{:016x}", word)?;
        }
        write!(f, ")")
    }
}

impl core::fmt::Display for U256 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "0x")?;
        for &word in self.0.iter().rev() {
            write!(f, "{:016x}", word)?;
        }
        Ok(())
    }
}

impl crate::traits::BigUint for U256 {
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
        // Safety: U256 is repr(transparent) over [u64; 4], which is 32 bytes
        unsafe { core::slice::from_raw_parts(self as *const U256 as *const u8, 32) }
    }

    #[inline]
    fn bits(&self) -> u32 {
        256
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
    #[test]
    fn test_basic_ops() {
        let a = U256::from_u64(100);
        let b = U256::from_u64(50);

        assert_eq!((a + b).to_u64(), 150);
        assert_eq!((a - b).to_u64(), 50);
        assert_eq!((a * b).to_u64(), 5000);
        assert_eq!((a / b).to_u64(), 2);
        assert_eq!((a % b).to_u64(), 0);

        // Division with remainder
        let a = U256::from_u64(107);
        let b = U256::from_u64(10);
        assert_eq!((a / b).to_u64(), 10);
        assert_eq!((a % b).to_u64(), 7);
    }        let a = U256::from_u64(0b1010);
        let b = U256::from_u64(0b1100);

        assert_eq!((a & b).to_u64(), 0b1000);
        assert_eq!((a | b).to_u64(), 0b1110);
        assert_eq!((a ^ b).to_u64(), 0b0110);
    }

    #[test]
    fn test_comparison() {
        let a = U256::from_u64(100);
        let b = U256::from_u64(50);

        assert!(a > b);
        assert!(b < a);
        assert_eq!(a, a);
    }
}
