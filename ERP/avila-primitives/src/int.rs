//! Fixed-size integer types

use core::fmt;
use core::ops::{Add, Sub, Mul, BitAnd, BitOr, BitXor, Shl, Shr};

/// 64-bit unsigned integer (for consistency)
pub type U64 = u64;

/// 128-bit unsigned integer (for consistency)
pub type U128 = u128;

/// 256-bit unsigned integer (stack-allocated)
#[repr(align(32))]
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct U256 {
    /// Limbs in little-endian order (4 × 64 bits)
    pub limbs: [u64; 4],
}

impl U256 {
    /// Zero
    pub const ZERO: Self = Self { limbs: [0; 4] };

    /// One
    pub const ONE: Self = Self { limbs: [1, 0, 0, 0] };

    /// Maximum value
    pub const MAX: Self = Self { limbs: [u64::MAX; 4] };

    /// Number of bits
    pub const BITS: u32 = 256;

    /// Number of limbs
    pub const LIMBS: usize = 4;

    /// Creates from u64
    #[inline]
    pub const fn from_u64(value: u64) -> Self {
        Self { limbs: [value, 0, 0, 0] }
    }

    /// Creates from u128
    #[inline]
    pub const fn from_u128(value: u128) -> Self {
        Self {
            limbs: [
                value as u64,
                (value >> 64) as u64,
                0,
                0,
            ],
        }
    }

    /// Converts to u64 (truncates)
    #[inline]
    pub const fn to_u64(&self) -> u64 {
        self.limbs[0]
    }

    /// Converts to u128 (truncates)
    #[inline]
    pub const fn to_u128(&self) -> u128 {
        (self.limbs[0] as u128) | ((self.limbs[1] as u128) << 64)
    }

    /// Creates from bytes (big-endian)
    pub fn from_bytes_be(bytes: &[u8; 32]) -> Self {
        let mut limbs = [0u64; 4];
        for i in 0..4 {
            let offset = i * 8;
            limbs[3 - i] = u64::from_be_bytes([
                bytes[offset],
                bytes[offset + 1],
                bytes[offset + 2],
                bytes[offset + 3],
                bytes[offset + 4],
                bytes[offset + 5],
                bytes[offset + 6],
                bytes[offset + 7],
            ]);
        }
        Self { limbs }
    }

    /// Converts to bytes (big-endian)
    pub fn to_bytes_be(&self) -> [u8; 32] {
        let mut bytes = [0u8; 32];
        for i in 0..4 {
            let limb_bytes = self.limbs[3 - i].to_be_bytes();
            bytes[i * 8..(i + 1) * 8].copy_from_slice(&limb_bytes);
        }
        bytes
    }

    /// Checked addition
    pub fn checked_add(&self, rhs: &Self) -> Option<Self> {
        let mut result = Self::ZERO;
        let mut carry = 0u64;

        for i in 0..4 {
            let (sum, c1) = self.limbs[i].overflowing_add(rhs.limbs[i]);
            let (sum, c2) = sum.overflowing_add(carry);
            result.limbs[i] = sum;
            carry = (c1 as u64) + (c2 as u64);
        }

        if carry != 0 {
            None
        } else {
            Some(result)
        }
    }

    /// Wrapping addition
    pub fn wrapping_add(&self, rhs: &Self) -> Self {
        let mut result = Self::ZERO;
        let mut carry = 0u64;

        for i in 0..4 {
            let (sum, c1) = self.limbs[i].overflowing_add(rhs.limbs[i]);
            let (sum, c2) = sum.overflowing_add(carry);
            result.limbs[i] = sum;
            carry = (c1 as u64) + (c2 as u64);
        }

        result
    }
}

impl Default for U256 {
    fn default() -> Self {
        Self::ZERO
    }
}

impl Add for U256 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        self.wrapping_add(&rhs)
    }
}

impl fmt::Debug for U256 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "U256(0x{:016x}{:016x}...)", self.limbs[3], self.limbs[2])
    }
}

impl fmt::Display for U256 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "0x")?;
        for limb in self.limbs.iter().rev() {
            write!(f, "{:016x}", limb)?;
        }
        Ok(())
    }
}

/// 512-bit unsigned integer
#[repr(align(64))]
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct U512 {
    /// Limbs in little-endian order (8 × 64 bits)
    pub limbs: [u64; 8],
}

impl U512 {
    /// Zero
    pub const ZERO: Self = Self { limbs: [0; 8] };

    /// One
    pub const ONE: Self = Self { limbs: [1, 0, 0, 0, 0, 0, 0, 0] };

    /// Number of bits
    pub const BITS: u32 = 512;

    /// Number of limbs
    pub const LIMBS: usize = 8;
}

impl Default for U512 {
    fn default() -> Self {
        Self::ZERO
    }
}

// Placeholders for larger types
/// 1024-bit unsigned integer
pub type U1024 = [u64; 16];

/// 2048-bit unsigned integer (for RSA)
pub type U2048 = [u64; 32];

/// 4096-bit unsigned integer (for RSA-4096)
pub type U4096 = [u64; 64];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_u256_zero() {
        let z = U256::ZERO;
        assert_eq!(z.limbs, [0, 0, 0, 0]);
    }

    #[test]
    fn test_u256_one() {
        let o = U256::ONE;
        assert_eq!(o.limbs, [1, 0, 0, 0]);
    }

    #[test]
    fn test_u256_from_u64() {
        let n = U256::from_u64(42);
        assert_eq!(n.to_u64(), 42);
    }

    #[test]
    fn test_u256_add() {
        let a = U256::from_u64(10);
        let b = U256::from_u64(32);
        let c = a + b;
        assert_eq!(c.to_u64(), 42);
    }

    #[test]
    fn test_u256_checked_add_overflow() {
        let a = U256::MAX;
        let b = U256::ONE;
        assert!(a.checked_add(&b).is_none());
    }
}
