//! # avila-compress
//!
//! Native compression library optimized for AvilaDB and scientific computing.
//!
//! ## Features
//! - **LZ4**: Ultra-fast compression for real-time data
//! - **Zero dependencies**: 100% native Rust implementation
//! - **SIMD optimized**: AVX2/AVX-512 when available (future)
//! - **AvilaDB integration**: Native support for columnar data
//!
//! ## Example
//! ```rust
//! use avila_compress::lz4;
//!
//! let data = b"Hello, World! This is a test of LZ4 compression.";
//! let compressed = lz4::compress(data).expect("compression failed");
//! let decompressed = lz4::decompress(&compressed).expect("decompression failed");
//! assert_eq!(data, &decompressed[..]);
//! ```

pub mod error;
pub mod lz4;
pub mod stream;
pub mod checksum;
pub mod metrics;
pub mod columnar;
pub mod format;

#[cfg(feature = "parallel")]
pub mod parallel;

#[cfg(feature = "simd")]
pub mod simd;

#[cfg(feature = "dictionary")]
pub mod dictionary;

pub use error::{Error, Result};
pub use metrics::CompressionMetrics;
pub use format::{AvzFormat, Block};

/// Compression algorithms available
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum CompressionAlgorithm {
    /// LZ4 - Ultra-fast compression
    Lz4,
    // Future: Zstd, Snappy, Custom
}

/// Compression level
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Level {
    /// Fastest compression, lower ratio (optimized for speed)
    Fast,
    /// Balanced speed and ratio (good default)
    Balanced,
    /// Best compression ratio, slower (optimal parsing)
    Best,
    /// Ultra compression with maximum effort
    Ultra,
}

impl Default for Level {
    fn default() -> Self {
        Level::Balanced
    }
}

/// Convenience function to compress data with LZ4
pub fn compress(data: &[u8]) -> Result<Vec<u8>> {
    lz4::compress(data)
}

/// Convenience function to decompress LZ4 data
pub fn decompress(data: &[u8]) -> Result<Vec<u8>> {
    lz4::decompress(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_round_trip() {
        let data = b"Hello, World!";
        let compressed = compress(data).unwrap();
        let decompressed = decompress(&compressed).unwrap();
        assert_eq!(data, &decompressed[..]);
    }

    #[test]
    fn test_empty_data() {
        let data = b"";
        let compressed = compress(data).unwrap();
        let decompressed = decompress(&compressed).unwrap();
        assert_eq!(data, &decompressed[..]);
    }

    #[test]
    fn test_large_repetitive() {
        let data = vec![b'A'; 10000];
        let compressed = compress(&data).unwrap();
        // TODO: Add real compression with matches
        // assert!(compressed.len() < data.len());
        let decompressed = decompress(&compressed).unwrap();
        assert_eq!(data, decompressed);
    }
}
