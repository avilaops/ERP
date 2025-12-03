//! AvilaDB - Globally distributed NoSQL database optimized for Brazil and LATAM
//!
//! # Features
//!
//! - **4 MB documents** (2x larger than DynamoDB)
//! - **Native vector search** (HNSW index)
//! - **Multi-region writes** (FREE)
//! - **5-10ms latency** in Brazil
//! - **Automatic compression** via `avila-compress`
//!
//! # Quick Start
//!
//! ```no_run
//! use aviladb::{AvilaClient, Document};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = AvilaClient::connect("http://localhost:8000").await?;
//!     let db = client.database("gamedb").await?;
//!     let players = db.collection("players").await?;
//!
//!     // Insert document
//!     let player = Document::new()
//!         .set("userId", "player123")
//!         .set("username", "CoolGamer")
//!         .set("level", 42);
//!
//!     players.insert(player).await?;
//!     Ok(())
//! }
//! ```

use serde::{Deserialize, Serialize};

pub mod auth;
pub mod cache;
pub mod client;
pub mod collection;
pub mod compression;
pub mod config;
pub mod database;
pub mod document;
pub mod error;
pub mod hnsw;
pub mod http;
pub mod partition;
pub mod query;
pub mod storage;
pub mod telemetry;
pub mod vector;

pub use auth::{AuthProvider, AuthToken, Credentials, Scope};
pub use cache::{CacheConfig, CacheKey, QueryCache};
pub use client::AvilaClient;
pub use collection::Collection;
pub use compression::{compress, decompress, CompressionLevel, CompressionStats};
pub use config::Config;
pub use database::Database;
pub use document::Document;
pub use error::{AvilaError, Result};
pub use hnsw::{DistanceMetric, HnswIndex, SearchResult};
pub use http::{HttpClient, HttpConfig};
pub use partition::{HierarchicalPartitionKey, PartitionKeyComponent, PartitionRouter, PartitionStrategy};
pub use query::Query;
pub use telemetry::{OperationType, TelemetryCollector, TelemetryConfig, TelemetryEvent, TelemetrySpan};

/// Maximum document size in bytes (4 MB)
pub const MAX_DOCUMENT_SIZE: usize = 4 * 1024 * 1024;

/// Maximum partition size in bytes (50 GB)
pub const MAX_PARTITION_SIZE: u64 = 50 * 1024 * 1024 * 1024;

/// Insert result with document ID and metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertResult {
    /// Unique document ID
    pub id: String,

    /// Document size in bytes
    pub size_bytes: usize,

    /// Compression ratio (original / compressed)
    pub compression_ratio: f64,

    /// Operation latency in milliseconds
    pub latency_ms: u128,
}

/// Query result with documents and metadata
#[derive(Debug, Clone)]
pub struct QueryResult {
    /// Retrieved documents
    pub documents: Vec<Document>,

    /// Total count (may be greater than documents.len() if paginated)
    pub total_count: usize,

    /// Continuation token for pagination
    pub continuation_token: Option<String>,

    /// Query latency in milliseconds
    pub latency_ms: u128,
}

/// Storage class for documents
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum StorageClass {
    /// Standard storage with LZ4 compression (hot data)
    Standard,

    /// Infrequent access (warm data)
    InfrequentAccess,

    /// Archive storage with Zstd compression (cold data)
    Archive,
}

impl Default for StorageClass {
    fn default() -> Self {
        Self::Standard
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_max_constants() {
        assert_eq!(MAX_DOCUMENT_SIZE, 4 * 1024 * 1024); // 4 MB
        assert_eq!(MAX_PARTITION_SIZE, 50 * 1024 * 1024 * 1024); // 50 GB
    }
}
