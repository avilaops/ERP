//! # Arrow IPC (Inter-Process Communication)
//!
//! Implementation of Apache Arrow IPC format for zero-copy data exchange.
//!
//! The Arrow IPC format enables efficient data sharing between processes
//! without serialization overhead. It's based on FlatBuffers and provides
//! both streaming and file formats.
//!
//! ## Features
//!
//! - **Zero-Copy**: Direct memory mapping without deserialization
//! - **Language Agnostic**: Compatible with PyArrow, Arrow C++, etc.
//! - **Streaming**: Supports large datasets that don't fit in memory
//! - **Metadata Preservation**: Schema, field names, types preserved
//!
//! ## Format Specification
//!
//! Arrow IPC uses FlatBuffers for metadata and raw buffers for data:
//!
//! ```text
//! Stream Format:
//! [Schema Message][RecordBatch Message][RecordBatch Message]...
//!
//! File Format:
//! [Magic: "ARROW1"][Schema][RecordBatch]...[Footer][Magic: "ARROW1"]
//! ```
//!
//! ## Example
//!
//! ```rust
//! use avila_arrow::{Schema, Field, DataType, RecordBatch};
//! use avila_arrow::ipc::{write_stream, read_stream};
//!
//! # fn example() -> Result<(), Box<dyn std::error::Error>> {
//! // Create batch
//! let schema = Schema::new(vec![Field::new("id", DataType::Int64)]);
//! let batch = RecordBatch::try_new(schema, vec![])?;
//!
//! // Write to IPC format
//! let bytes = write_stream(&[batch.clone()])?;
//!
//! // Read back
//! let batches = read_stream(&bytes)?;
//! assert_eq!(batches.len(), 1);
//! # Ok(())
//! # }
//! ```

pub mod reader;
pub mod writer;

mod message;
mod schema_generated;

pub use reader::{StreamReader, FileReader};
pub use writer::{StreamWriter, FileWriter};

use crate::{ArrowError, Result};

/// Arrow IPC magic bytes for file format
pub const ARROW_MAGIC: &[u8; 6] = b"ARROW1";

/// Current Arrow IPC version
pub const IPC_VERSION: i32 = 5;

/// Message type in Arrow IPC
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageType {
    /// Schema metadata
    Schema = 0,
    /// RecordBatch data
    RecordBatch = 1,
    /// Dictionary batch (for dictionary encoding)
    DictionaryBatch = 2,
}

/// Metadata version
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MetadataVersion {
    /// Version 1
    V1 = 0,
    /// Version 2
    V2 = 1,
    /// Version 3
    V3 = 2,
    /// Version 4
    V4 = 3,
    /// Version 5 (current)
    V5 = 4,
}

impl Default for MetadataVersion {
    fn default() -> Self {
        MetadataVersion::V5
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_magic_bytes() {
        assert_eq!(ARROW_MAGIC, b"ARROW1");
        assert_eq!(ARROW_MAGIC.len(), 6);
    }

    #[test]
    fn test_ipc_version() {
        assert_eq!(IPC_VERSION, 5);
    }

    #[test]
    fn test_message_types() {
        assert_eq!(MessageType::Schema as i32, 0);
        assert_eq!(MessageType::RecordBatch as i32, 1);
        assert_eq!(MessageType::DictionaryBatch as i32, 2);
    }

    #[test]
    fn test_metadata_version() {
        let version = MetadataVersion::default();
        assert_eq!(version, MetadataVersion::V5);
        assert_eq!(version as i32, 4);
    }
}
