//! Binary serialization and deserialization (stub)

use crate::error::Result;
use crate::ser::Serialize;
use crate::de::Deserialize;

/// Serialize a value to binary format
pub fn to_binary<T: Serialize>(_value: &T) -> Result<Vec<u8>> {
    unimplemented!("Binary serialization - to be implemented in future version")
}

/// Deserialize a value from binary format
pub fn from_binary<T: Deserialize>(_bytes: &[u8]) -> Result<T> {
    unimplemented!("Binary deserialization - to be implemented in future version")
}
