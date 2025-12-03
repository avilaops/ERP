//! Hash de 1024 bits.

use core::fmt;
use crate::hash::HashCore;

/// Hash de 1024 bits (128 bytes)
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub struct H1024([u8; 128]);

impl H1024 {
    /// Cria um novo H1024 a partir de um array de bytes
    #[inline]
    pub const fn from_array(bytes: [u8; 128]) -> Self {
        H1024(bytes)
    }

    /// Retorna o array de bytes
    #[inline]
    pub const fn to_array(&self) -> [u8; 128] {
        self.0
    }

    /// Verifica se é zero
    #[inline]
    pub fn is_zero(&self) -> bool {
        self.0.iter().all(|&b| b == 0)
    }

    /// Cria hash aleatório (requer feature std)
    #[cfg(feature = "std")]
    pub fn random() -> Self {
        use std::time::{SystemTime, UNIX_EPOCH};
        let mut bytes = [0u8; 128];
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        for (i, byte) in bytes.iter_mut().enumerate() {
            *byte = ((timestamp >> (i % 16)) ^ (i as u128)) as u8;
        }

        H1024(bytes)
    }
}

impl HashCore for H1024 {
    const BITS: usize = 1024;
    const BYTES: usize = 128;
    const ZERO: Self = H1024([0; 128]);

    fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() != 128 {
            return None;
        }
        let mut array = [0u8; 128];
        array.copy_from_slice(bytes);
        Some(H1024(array))
    }

    #[inline]
    fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    fn to_bytes(&self) -> Vec<u8> {
        self.0.to_vec()
    }
}

impl From<[u8; 128]> for H1024 {
    #[inline]
    fn from(bytes: [u8; 128]) -> Self {
        H1024(bytes)
    }
}

impl AsRef<[u8]> for H1024 {
    #[inline]
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

impl fmt::Debug for H1024 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "H1024(0x")?;
        for &byte in &self.0[..16] {
            write!(f, "{:02x}", byte)?;
        }
        write!(f, "...)")?;
        Ok(())
    }
}

impl fmt::Display for H1024 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "0x")?;
        for &byte in &self.0 {
            write!(f, "{:02x}", byte)?;
        }
        Ok(())
    }
}

impl fmt::LowerHex for H1024 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for &byte in &self.0 {
            write!(f, "{:02x}", byte)?;
        }
        Ok(())
    }
}

impl fmt::UpperHex for H1024 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for &byte in &self.0 {
            write!(f, "{:02X}", byte)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero() {
        assert!(H1024::ZERO.is_zero());
    }

    #[test]
    fn test_from_bytes() {
        let bytes = [42u8; 128];
        let hash = H1024::from_bytes(&bytes).unwrap();
        assert_eq!(hash.as_bytes(), &bytes);
    }

    #[test]
    fn test_from_bytes_wrong_size() {
        let bytes = [42u8; 64];
        assert!(H1024::from_bytes(&bytes).is_none());
    }
}
