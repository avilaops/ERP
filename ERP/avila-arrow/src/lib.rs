//! # avila-arrow - Native Columnar Format
//!
//! Native columnar data format optimized for AvilaDB and Brazilian scientific computing.
//!
//! ## Features
//!
//! - **Scientific Types**: Quaternions, Tensors, Complex, Spinors
//! - **High Performance**: Zero-copy, SIMD-optimized
//! - **AvilaDB Native**: Direct integration
//!
//! ## Quick Start
//!
//! ```rust
//! use avila_arrow::{Schema, Field, DataType, RecordBatch};
//! use avila_arrow::array::Int64Array;
//!
//! let schema = Schema::new(vec![
//!     Field::new("id", DataType::Int64),
//! ]);
//!
//! let ids = Int64Array::from(vec![1, 2, 3]);
//! let batch = RecordBatch::try_new(schema, vec![Box::new(ids)])?;
//! # Ok::<(), avila_arrow::ArrowError>(())
//! ```

#![warn(missing_docs)]
#![warn(clippy::all)]

pub mod array;
pub mod compute;
pub mod datatypes;
pub mod error;
pub mod record_batch;
pub mod simd;
pub mod compression;

#[cfg(feature = "scientific")]
pub mod scientific;

#[cfg(feature = "ipc")]
pub mod ipc;

// Re-exports
pub use datatypes::{DataType, Field, Schema};
pub use error::{ArrowError, Result};
pub use record_batch::RecordBatch;

/// Library version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert!(!VERSION.is_empty());
        assert!(VERSION.starts_with("0."));
    }
}
