//! Avila ID - AVL Platform unique identifier
//! Replacement for uuid crate - 100% Rust std
//! Generates RFC 4122 compliant UUIDs (v4 - random)

use std::fmt;
use std::str::FromStr;

/// 128-bit unique identifier (UUID v4)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Id([u8; 16]);

impl Id {
    /// Generate a new random ID (UUIDv4)
    pub fn new() -> Self {
        let mut bytes = [0u8; 16];

        // Use std random (básico) - em produção usar getrandom/OsRng
        use std::collections::hash_map::RandomState;
        use std::hash::{BuildHasher, Hasher};

        let hasher1 = RandomState::new().build_hasher();
        let hasher2 = RandomState::new().build_hasher();

        let h1 = hasher1.finish();
        let h2 = hasher2.finish();

        bytes[0..8].copy_from_slice(&h1.to_le_bytes());
        bytes[8..16].copy_from_slice(&h2.to_le_bytes());

        // Set version (4) and variant (RFC 4122)
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant RFC 4122

        Self(bytes)
    }

    /// Parse from string (hyphenated format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    pub fn parse(s: &str) -> Result<Self, ParseError> {
        let s = s.replace("-", "");
        if s.len() != 32 {
            return Err(ParseError::InvalidLength);
        }

        let mut bytes = [0u8; 16];
        for (i, chunk) in s.as_bytes().chunks(2).enumerate() {
            let hex = std::str::from_utf8(chunk).map_err(|_| ParseError::InvalidChar)?;
            bytes[i] = u8::from_str_radix(hex, 16).map_err(|_| ParseError::InvalidChar)?;
        }

        Ok(Self(bytes))
    }

    /// Get bytes representation
    pub fn as_bytes(&self) -> &[u8; 16] {
        &self.0
    }

    /// Convert to hyphenated string
    pub fn to_string(&self) -> String {
        format!(
            "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
            self.0[0], self.0[1], self.0[2], self.0[3],
            self.0[4], self.0[5],
            self.0[6], self.0[7],
            self.0[8], self.0[9],
            self.0[10], self.0[11], self.0[12], self.0[13], self.0[14], self.0[15]
        )
    }

    /// Nil/empty ID
    pub fn nil() -> Self {
        Self([0u8; 16])
    }

    /// Check if this is nil
    pub fn is_nil(&self) -> bool {
        self.0.iter().all(|&b| b == 0)
    }
}

impl Default for Id {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for Id {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_string())
    }
}

impl FromStr for Id {
    type Err = ParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse(s)
    }
}

#[derive(Debug, Clone)]
pub enum ParseError {
    InvalidLength,
    InvalidChar,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseError::InvalidLength => write!(f, "Invalid ID length"),
            ParseError::InvalidChar => write!(f, "Invalid character in ID"),
        }
    }
}

impl std::error::Error for ParseError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_id_generation() {
        let id1 = Id::new();
        let id2 = Id::new();
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_id_parse() {
        let id = Id::new();
        let s = id.to_string();
        let parsed = Id::parse(&s).unwrap();
        assert_eq!(id, parsed);
    }

    #[test]
    fn test_nil() {
        let nil = Id::nil();
        assert!(nil.is_nil());
        assert_eq!(nil.to_string(), "00000000-0000-0000-0000-000000000000");
    }
}

// Implementação de Serialize/Deserialize para avila-serde
#[cfg(feature = "serde")]
impl avila_serde::Serialize for Id {
    fn to_value(&self) -> avila_serde::Value {
        // Serializa como string hyphenated
        avila_serde::Value::String(self.to_string())
    }
}

#[cfg(feature = "serde")]
impl avila_serde::Deserialize for Id {
    fn from_value(value: avila_serde::Value) -> Result<Self, avila_serde::Error> {
        match value {
            avila_serde::Value::String(s) => {
                Self::parse(&s).map_err(|e| avila_serde::Error::Parse(format!("Invalid ID: {}", e)))
            }
            _ => Err(avila_serde::Error::Parse("Expected string for Id".to_string()))
        }
    }
}
