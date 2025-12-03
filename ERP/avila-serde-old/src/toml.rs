//! TOML serialization and deserialization (stub)

use crate::error::Result;
use crate::ser::Serialize;
use crate::de::Deserialize;

/// Serialize a value to TOML string
pub fn to_toml<T: Serialize>(_value: &T) -> Result<String> {
    unimplemented!("TOML serialization - to be implemented in future version")
}

/// Deserialize a value from TOML string
pub fn from_toml<T: Deserialize>(_toml: &str) -> Result<T> {
    unimplemented!("TOML deserialization - to be implemented in future version")
}
