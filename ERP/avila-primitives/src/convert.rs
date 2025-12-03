//! Type conversion utilities

/// Endianness
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Endian {
    /// Big-endian (network byte order)
    Big,
    /// Little-endian (most CPUs)
    Little,
}

impl Endian {
    /// Native endianness
    #[cfg(target_endian = "big")]
    pub const NATIVE: Self = Self::Big;

    /// Native endianness
    #[cfg(target_endian = "little")]
    pub const NATIVE: Self = Self::Little;
}

/// Conversion from bytes
pub trait FromBytes: Sized {
    /// Creates from bytes with specified endianness
    fn from_bytes(bytes: &[u8], endian: Endian) -> Option<Self>;

    /// Creates from big-endian bytes
    fn from_bytes_be(bytes: &[u8]) -> Option<Self> {
        Self::from_bytes(bytes, Endian::Big)
    }

    /// Creates from little-endian bytes
    fn from_bytes_le(bytes: &[u8]) -> Option<Self> {
        Self::from_bytes(bytes, Endian::Little)
    }
}

/// Conversion to bytes
pub trait ToBytes {
    /// Converts to bytes with specified endianness
    fn to_bytes(&self, endian: Endian) -> Vec<u8>;

    /// Converts to big-endian bytes
    fn to_bytes_be(&self) -> Vec<u8> {
        self.to_bytes(Endian::Big)
    }

    /// Converts to little-endian bytes
    fn to_bytes_le(&self) -> Vec<u8> {
        self.to_bytes(Endian::Little)
    }
}

// Implementations for primitive types
macro_rules! impl_conversions {
    ($($t:ty),*) => {
        $(
            impl FromBytes for $t {
                fn from_bytes(bytes: &[u8], endian: Endian) -> Option<Self> {
                    let size = core::mem::size_of::<Self>();
                    if bytes.len() < size {
                        return None;
                    }

                    let mut arr = [0u8; core::mem::size_of::<Self>()];
                    arr.copy_from_slice(&bytes[..size]);

                    Some(match endian {
                        Endian::Big => <$t>::from_be_bytes(arr),
                        Endian::Little => <$t>::from_le_bytes(arr),
                    })
                }
            }

            impl ToBytes for $t {
                fn to_bytes(&self, endian: Endian) -> Vec<u8> {
                    let bytes = match endian {
                        Endian::Big => self.to_be_bytes(),
                        Endian::Little => self.to_le_bytes(),
                    };
                    bytes.to_vec()
                }
            }
        )*
    }
}

impl_conversions!(u8, u16, u32, u64, u128, i8, i16, i32, i64, i128);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_endian_native() {
        #[cfg(target_endian = "little")]
        assert_eq!(Endian::NATIVE, Endian::Little);

        #[cfg(target_endian = "big")]
        assert_eq!(Endian::NATIVE, Endian::Big);
    }

    #[test]
    fn test_from_bytes_be() {
        let bytes = [0, 0, 0, 42];
        let n = u32::from_bytes_be(&bytes).unwrap();
        assert_eq!(n, 42);
    }

    #[test]
    fn test_to_bytes_le() {
        let n = 42u32;
        let bytes = n.to_bytes_le();
        assert_eq!(bytes, vec![42, 0, 0, 0]);
    }

    #[test]
    fn test_roundtrip() {
        let original = 0x12345678u32;
        let bytes = original.to_bytes_be();
        let restored = u32::from_bytes_be(&bytes).unwrap();
        assert_eq!(original, restored);
    }
}
