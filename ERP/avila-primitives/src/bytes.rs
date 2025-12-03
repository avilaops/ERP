//! Byte array types and operations

use core::fmt;

/// Fixed 32-byte array (256 bits)
#[repr(align(32))]
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct Bytes32(pub [u8; 32]);

impl Bytes32 {
    /// Zero bytes
    pub const ZERO: Self = Self([0u8; 32]);

    /// Creates from slice, panics if length != 32
    #[inline]
    pub const fn from_slice(slice: &[u8]) -> Self {
        assert!(slice.len() == 32, "Slice must be exactly 32 bytes");
        let mut arr = [0u8; 32];
        let mut i = 0;
        while i < 32 {
            arr[i] = slice[i];
            i += 1;
        }
        Self(arr)
    }

    /// As slice
    #[inline]
    pub const fn as_slice(&self) -> &[u8] {
        &self.0
    }

    /// As mutable slice
    #[inline]
    pub fn as_mut_slice(&mut self) -> &mut [u8] {
        &mut self.0
    }
}

impl Default for Bytes32 {
    fn default() -> Self {
        Self::ZERO
    }
}

impl AsRef<[u8]> for Bytes32 {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

impl AsMut<[u8]> for Bytes32 {
    fn as_mut(&mut self) -> &mut [u8] {
        &mut self.0
    }
}

impl fmt::Debug for Bytes32 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Bytes32(0x")?;
        for byte in &self.0[..4] {
            write!(f, "{:02x}", byte)?;
        }
        write!(f, "...)")?;
        Ok(())
    }
}

impl fmt::Display for Bytes32 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "0x")?;
        for byte in &self.0 {
            write!(f, "{:02x}", byte)?;
        }
        Ok(())
    }
}

/// Fixed 64-byte array (512 bits)
#[repr(align(64))]
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct Bytes64(pub [u8; 64]);

impl Bytes64 {
    /// Zero bytes
    pub const ZERO: Self = Self([0u8; 64]);

    /// Creates from slice, panics if length != 64
    #[inline]
    pub const fn from_slice(slice: &[u8]) -> Self {
        assert!(slice.len() == 64, "Slice must be exactly 64 bytes");
        let mut arr = [0u8; 64];
        let mut i = 0;
        while i < 64 {
            arr[i] = slice[i];
            i += 1;
        }
        Self(arr)
    }

    /// As slice
    #[inline]
    pub const fn as_slice(&self) -> &[u8] {
        &self.0
    }
}

impl Default for Bytes64 {
    fn default() -> Self {
        Self::ZERO
    }
}

impl AsRef<[u8]> for Bytes64 {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

impl fmt::Debug for Bytes64 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Bytes64(0x")?;
        for byte in &self.0[..4] {
            write!(f, "{:02x}", byte)?;
        }
        write!(f, "...)")?;
        Ok(())
    }
}

/// Generic byte array trait
pub trait ByteArray: AsRef<[u8]> + AsMut<[u8]> {
    /// Length in bytes
    fn len(&self) -> usize {
        self.as_ref().len()
    }

    /// Check if empty
    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Zeroize (security)
    fn zeroize(&mut self) {
        for byte in self.as_mut() {
            *byte = 0;
        }
    }
}

impl ByteArray for Bytes32 {}
impl ByteArray for Bytes64 {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bytes32_zero() {
        let b = Bytes32::ZERO;
        assert_eq!(b.0, [0u8; 32]);
    }

    #[test]
    fn test_bytes32_from_slice() {
        let data = [42u8; 32];
        let b = Bytes32::from_slice(&data);
        assert_eq!(b.0, data);
    }

    #[test]
    fn test_bytes32_zeroize() {
        let mut b = Bytes32([255u8; 32]);
        b.zeroize();
        assert_eq!(b.0, [0u8; 32]);
    }

    #[test]
    fn test_bytes64_default() {
        let b = Bytes64::default();
        assert_eq!(b.0, [0u8; 64]);
    }
}
