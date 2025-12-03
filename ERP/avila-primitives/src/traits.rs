//! Common traits for big integer types

use core::ops::{Add, Sub, Mul, Div, Rem, BitAnd, BitOr, BitXor, Not, Shl, Shr};
use core::cmp::{PartialOrd, Ord};

/// Trait for unsigned big integers
pub trait BigUint:
    Sized
    + Clone
    + Copy
    + PartialEq
    + Eq
    + PartialOrd
    + Ord
    + Add<Output = Self>
    + Sub<Output = Self>
    + Mul<Output = Self>
    + Div<Output = Self>
    + Rem<Output = Self>
    + BitAnd<Output = Self>
    + BitOr<Output = Self>
    + BitXor<Output = Self>
    + Not<Output = Self>
    + Shl<u32, Output = Self>
    + Shr<u32, Output = Self>
{
    /// Create from u64
    fn from_u64(value: u64) -> Self;

    /// Convert to u64 (lossy)
    fn to_u64(&self) -> u64;

    /// Create from little-endian bytes
    fn from_le_bytes(bytes: &[u8]) -> Self;

    /// Convert to little-endian bytes (fixed size array)
    fn to_le_bytes(&self) -> &[u8];

    /// Get number of bits
    fn bits(&self) -> u32;

    /// Count leading zeros
    fn leading_zeros(&self) -> u32;

    /// Count trailing zeros
    fn trailing_zeros(&self) -> u32;

    /// Constant-time equality
    fn ct_eq(&self, other: &Self) -> bool;
}

/// Trait for signed big integers
pub trait BigInt:
    Sized
    + Clone
    + Copy
    + PartialEq
    + Eq
    + PartialOrd
    + Ord
    + Add<Output = Self>
    + Sub<Output = Self>
    + Mul<Output = Self>
    + Div<Output = Self>
    + Rem<Output = Self>
    + BitAnd<Output = Self>
    + BitOr<Output = Self>
    + BitXor<Output = Self>
    + Not<Output = Self>
    + Shl<u32, Output = Self>
    + Shr<u32, Output = Self>
{
    /// Create from i64
    fn from_i64(value: i64) -> Self;

    /// Convert to i64 (lossy)
    fn to_i64(&self) -> i64;

    /// Create from little-endian bytes (two's complement)
    fn from_le_bytes(bytes: &[u8]) -> Self;

    /// Convert to little-endian bytes (two's complement, fixed size array)
    fn to_le_bytes(&self) -> &[u8];

    /// Get number of bits
    fn bits(&self) -> u32;

    /// Check if negative
    fn is_negative(&self) -> bool;

    /// Absolute value
    fn abs(&self) -> Self;

    /// Constant-time equality
    fn ct_eq(&self, other: &Self) -> bool;
}
