//! # avila-serialize - Binary Serialization
//!
//! Fast zero-copy binary serialization.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

use avila_error::{Error, ErrorKind, Result};

/// Serialization trait
pub trait Serialize {
    /// Serializes to bytes
    fn serialize(&self, buf: &mut [u8]) -> Result<usize>;

    /// Returns serialized size
    fn size(&self) -> usize;
}

/// Deserialization trait
pub trait Deserialize: Sized {
    /// Deserializes from bytes
    fn deserialize(buf: &[u8]) -> Result<Self>;
}

impl Serialize for u8 {
    fn serialize(&self, buf: &mut [u8]) -> Result<usize> {
        if buf.is_empty() {
            return Err(Error::new(ErrorKind::InvalidInput, "Buffer too small"));
        }
        buf[0] = *self;
        Ok(1)
    }

    fn size(&self) -> usize { 1 }
}

impl Deserialize for u8 {
    fn deserialize(buf: &[u8]) -> Result<Self> {
        if buf.is_empty() {
            return Err(Error::new(ErrorKind::InvalidInput, "Buffer too small"));
        }
        Ok(buf[0])
    }
}

impl Serialize for u16 {
    fn serialize(&self, buf: &mut [u8]) -> Result<usize> {
        if buf.len() < 2 {
            return Err(Error::new(ErrorKind::InvalidInput, "Buffer too small"));
        }
        buf[..2].copy_from_slice(&self.to_le_bytes());
        Ok(2)
    }

    fn size(&self) -> usize { 2 }
}

impl Deserialize for u16 {
    fn deserialize(buf: &[u8]) -> Result<Self> {
        if buf.len() < 2 {
            return Err(Error::new(ErrorKind::InvalidInput, "Buffer too small"));
        }
        Ok(u16::from_le_bytes([buf[0], buf[1]]))
    }
}

impl Serialize for u32 {
    fn serialize(&self, buf: &mut [u8]) -> Result<usize> {
        if buf.len() < 4 {
            return Err(Error::new(ErrorKind::InvalidInput, "Buffer too small"));
        }
        buf[..4].copy_from_slice(&self.to_le_bytes());
        Ok(4)
    }

    fn size(&self) -> usize { 4 }
}

impl Deserialize for u32 {
    fn deserialize(buf: &[u8]) -> Result<Self> {
        if buf.len() < 4 {
            return Err(Error::new(ErrorKind::InvalidInput, "Buffer too small"));
        }
        Ok(u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]))
    }
}

impl Serialize for u64 {
    fn serialize(&self, buf: &mut [u8]) -> Result<usize> {
        if buf.len() < 8 {
            return Err(Error::new(ErrorKind::InvalidInput, "Buffer too small"));
        }
        buf[..8].copy_from_slice(&self.to_le_bytes());
        Ok(8)
    }

    fn size(&self) -> usize { 8 }
}

impl Deserialize for u64 {
    fn deserialize(buf: &[u8]) -> Result<Self> {
        if buf.len() < 8 {
            return Err(Error::new(ErrorKind::InvalidInput, "Buffer too small"));
        }
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&buf[..8]);
        Ok(u64::from_le_bytes(bytes))
    }
}

/// Prelude
pub mod prelude {
    pub use crate::{Deserialize, Serialize};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_u64_roundtrip() {
        let val = 0x123456789ABCDEFu64;
        let mut buf = [0u8; 8];
        val.serialize(&mut buf).unwrap();
        let decoded = u64::deserialize(&buf).unwrap();
        assert_eq!(val, decoded);
    }

    #[test]
    fn test_u32_serialize() {
        let val = 0x12345678u32;
        let mut buf = [0u8; 4];
        val.serialize(&mut buf).unwrap();
        assert_eq!(buf, [0x78, 0x56, 0x34, 0x12]);
    }
}
