//! # avila-serialize
//!
//! High-performance serialization framework for AVL Platform.
//!
//! ## Features
//!
//! - Zero-copy deserialization
//! - Multiple format support (JSON, TOML, Binary)
//! - Derive macros for automatic implementation
//! - Type-safe with comprehensive error handling
//!
//! ## Quick Start
//!
//! ```rust
//! use avila_serialize::{Serialize, Deserialize, to_json, from_json};
//!
//! #[derive(Serialize, Deserialize, Debug)]
//! struct Player {
//!     id: u64,
//!     username: String,
//!     level: u32,
//! }
//!
//! let player = Player {
//!     id: 12345,
//!     username: "Gamer".to_string(),
//!     level: 42,
//! };
//!
//! let json = to_json(&player).unwrap();
//! let decoded: Player = from_json(&json).unwrap();
//! ```

#![warn(missing_docs)]
#![warn(clippy::all)]

pub mod error;
pub mod ser;
pub mod de;

#[cfg(feature = "json")]
pub mod json;

#[cfg(feature = "toml")]
pub mod toml;

#[cfg(feature = "binary")]
pub mod binary;

// Re-exports
pub use error::{Error, Result};
pub use ser::{Serialize, Serializer};
pub use de::{Deserialize, Deserializer};

#[cfg(feature = "derive")]
pub use avila_serialize_derive::{Serialize, Deserialize};

#[cfg(feature = "json")]
pub use json::{to_json, to_json_pretty, from_json};

#[cfg(feature = "toml")]
pub use toml::{to_toml, from_toml};

#[cfg(feature = "binary")]
pub use binary::{to_binary, from_binary};

/// Version information
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert!(!VERSION.is_empty());
    }
}
