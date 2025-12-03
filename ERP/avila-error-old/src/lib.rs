//! # avila-errors
//!
//! Rich error handling for AVL Platform.
//!
//! ## Features
//!
//! - Derive macros for automatic Error implementation
//! - Error context and chains
//! - Optional backtrace support
//! - Compatible with std::error::Error
//!
//! ## Quick Start
//!
//! ```rust
//! use avila_errors::{Error, Result};
//!
//! #[derive(Debug)]
//! pub enum MyError {
//!     InvalidInput(String),
//!     NotFound,
//! }
//!
//! impl std::fmt::Display for MyError {
//!     fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
//!         match self {
//!             MyError::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
//!             MyError::NotFound => write!(f, "Not found"),
//!         }
//!     }
//! }
//!
//! impl std::error::Error for MyError {}
//! ```

#![warn(missing_docs)]
#![warn(clippy::all)]

pub mod error;
pub mod context;
pub mod result;

// Re-exports
pub use error::Error;
pub use context::{Context, ResultExt};
pub use result::Result;

#[cfg(feature = "derive")]
pub use avila_errors_derive::Error;

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
