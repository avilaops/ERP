//! Parallel compression using multiple threads
//!
//! This module provides parallel compression that can utilize multiple CPU cores
//! to compress large datasets faster. Data is split into independent blocks that
//! are compressed concurrently.
//!
//! ## Example
//! ```rust,ignore
//! use avila_compress::parallel;
//!
//! let data = vec![b'A'; 1_000_000]; // 1 MB
//! let compressed = parallel::compress_parallel(&data, 8).unwrap();
//! let decompressed = parallel::decompress_parallel(&compressed, 8).unwrap();
//! assert_eq!(data, decompressed);
//! ```
//!
//! ## Requirements
//! Enable the `parallel` feature:
//! ```toml
//! [dependencies]
//! avila-compress = { version = "*", features = ["parallel"] }
//! ```

use crate::{lz4, Error, Level, Result};

#[cfg(feature = "parallel")]
use rayon::prelude::*;

/// Block size for parallel compression (64 KB)
const BLOCK_SIZE: usize = 64 * 1024;

/// Parallel compression format header
const MAGIC: &[u8; 4] = b"AVPZ"; // Avila Parallel Zipped
const VERSION: u8 = 1;

/// Compress data in parallel using multiple threads
///
/// Splits data into blocks and compresses them concurrently.
///
/// # Arguments
/// * `data` - Input data to compress
/// * `num_threads` - Number of threads to use (0 = auto-detect)
///
/// # Returns
/// Compressed data with parallel format header
///
/// # Example
/// ```rust,ignore
/// use avila_compress::parallel;
///
/// let data = vec![b'X'; 1_000_000];
/// let compressed = parallel::compress_parallel(&data, 8).unwrap();
/// println!("Compressed to {} bytes", compressed.len());
/// ```
#[cfg(feature = "parallel")]
pub fn compress_parallel(data: &[u8], num_threads: usize) -> Result<Vec<u8>> {
    compress_parallel_with_level(data, num_threads, Level::default())
}

/// Compress data in parallel with specified compression level
///
/// # Arguments
/// * `data` - Input data to compress
/// * `num_threads` - Number of threads (0 = auto-detect)
/// * `level` - Compression level (Fast/Balanced/Best)
#[cfg(feature = "parallel")]
pub fn compress_parallel_with_level(
    data: &[u8],
    num_threads: usize,
    level: Level,
) -> Result<Vec<u8>> {
    if data.is_empty() {
        return Ok(create_empty_parallel_header());
    }

    // Set thread pool size
    let pool = if num_threads > 0 {
        rayon::ThreadPoolBuilder::new()
            .num_threads(num_threads)
            .build()
            .map_err(|e| Error::InvalidInput(format!("Thread pool error: {}", e)))?
    } else {
        rayon::ThreadPoolBuilder::new()
            .build()
            .map_err(|e| Error::InvalidInput(format!("Thread pool error: {}", e)))?
    };

    // Split data into blocks
    let blocks: Vec<&[u8]> = data.chunks(BLOCK_SIZE).collect();
    let num_blocks = blocks.len();

    // Compress blocks in parallel
    let compressed_blocks: Vec<Vec<u8>> = pool.install(|| {
        blocks
            .par_iter()
            .map(|block| lz4::compress_with_level(block, level))
            .collect::<Result<Vec<_>>>()
    })?;

    // Build output
    let mut output = Vec::new();

    // Write header
    output.extend_from_slice(MAGIC); // 4 bytes
    output.push(VERSION); // 1 byte
    output.extend_from_slice(&(data.len() as u64).to_le_bytes()); // 8 bytes original size
    output.extend_from_slice(&(num_blocks as u32).to_le_bytes()); // 4 bytes block count

    // Write block sizes and data
    for block in &compressed_blocks {
        output.extend_from_slice(&(block.len() as u32).to_le_bytes());
    }

    for block in compressed_blocks {
        output.extend_from_slice(&block);
    }

    Ok(output)
}

/// Decompress parallel-compressed data
///
/// # Arguments
/// * `data` - Compressed data with parallel format
/// * `num_threads` - Number of threads (0 = auto-detect)
///
/// # Returns
/// Original uncompressed data
#[cfg(feature = "parallel")]
pub fn decompress_parallel(data: &[u8], num_threads: usize) -> Result<Vec<u8>> {
    if data.len() < 17 {
        return Err(Error::InvalidInput("Data too short for parallel format".to_string()));
    }

    // Verify magic
    if &data[0..4] != MAGIC {
        return Err(Error::InvalidInput("Invalid parallel format magic".to_string()));
    }

    // Read version
    let version = data[4];
    if version != VERSION {
        return Err(Error::InvalidInput(format!(
            "Unsupported version: {}",
            version
        )));
    }

    // Read original size
    let original_size = u64::from_le_bytes([
        data[5], data[6], data[7], data[8], data[9], data[10], data[11], data[12],
    ]) as usize;

    if original_size == 0 {
        return Ok(Vec::new());
    }

    // Read block count
    let num_blocks = u32::from_le_bytes([data[13], data[14], data[15], data[16]]) as usize;

    // Read block sizes
    let mut pos = 17;
    let mut block_sizes = Vec::with_capacity(num_blocks);
    for _ in 0..num_blocks {
        if pos + 4 > data.len() {
            return Err(Error::CorruptedData("Truncated block sizes".to_string()));
        }
        let size = u32::from_le_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
        block_sizes.push(size);
        pos += 4;
    }

    // Extract compressed blocks
    let mut compressed_blocks = Vec::with_capacity(num_blocks);
    for &size in &block_sizes {
        if pos + size > data.len() {
            return Err(Error::CorruptedData("Truncated block data".to_string()));
        }
        compressed_blocks.push(&data[pos..pos + size]);
        pos += size;
    }

    // Set thread pool
    let pool = if num_threads > 0 {
        rayon::ThreadPoolBuilder::new()
            .num_threads(num_threads)
            .build()
            .map_err(|e| Error::InvalidInput(format!("Thread pool error: {}", e)))?
    } else {
        rayon::ThreadPoolBuilder::new()
            .build()
            .map_err(|e| Error::InvalidInput(format!("Thread pool error: {}", e)))?
    };

    // Decompress blocks in parallel
    let decompressed_blocks: Vec<Vec<u8>> = pool.install(|| {
        compressed_blocks
            .par_iter()
            .map(|block| lz4::decompress(block))
            .collect::<Result<Vec<_>>>()
    })?;

    // Combine blocks
    let mut output = Vec::with_capacity(original_size);
    for block in decompressed_blocks {
        output.extend_from_slice(&block);
    }

    if output.len() != original_size {
        return Err(Error::CorruptedData(format!(
            "Size mismatch: expected {}, got {}",
            original_size,
            output.len()
        )));
    }

    Ok(output)
}

/// Create empty parallel format header
fn create_empty_parallel_header() -> Vec<u8> {
    let mut output = Vec::new();
    output.extend_from_slice(MAGIC);
    output.push(VERSION);
    output.extend_from_slice(&0u64.to_le_bytes()); // 0 original size
    output.extend_from_slice(&0u32.to_le_bytes()); // 0 blocks
    output
}

// Fallback implementations when parallel feature is disabled

#[cfg(not(feature = "parallel"))]
pub fn compress_parallel(data: &[u8], _num_threads: usize) -> Result<Vec<u8>> {
    Err(Error::InvalidInput(
        "Parallel compression requires 'parallel' feature".to_string(),
    ))
}

#[cfg(not(feature = "parallel"))]
pub fn compress_parallel_with_level(
    data: &[u8],
    _num_threads: usize,
    _level: Level,
) -> Result<Vec<u8>> {
    Err(Error::InvalidInput(
        "Parallel compression requires 'parallel' feature".to_string(),
    ))
}

#[cfg(not(feature = "parallel"))]
pub fn decompress_parallel(data: &[u8], _num_threads: usize) -> Result<Vec<u8>> {
    Err(Error::InvalidInput(
        "Parallel decompression requires 'parallel' feature".to_string(),
    ))
}

#[cfg(all(test, feature = "parallel"))]
mod tests {
    use super::*;

    #[test]
    fn test_parallel_compress_decompress() {
        let data = vec![b'A'; 100000];
        let compressed = compress_parallel(&data, 4).unwrap();
        let decompressed = decompress_parallel(&compressed, 4).unwrap();
        assert_eq!(data, decompressed);
    }

    #[test]
    fn test_parallel_empty() {
        let data = vec![];
        let compressed = compress_parallel(&data, 4).unwrap();
        let decompressed = decompress_parallel(&compressed, 4).unwrap();
        assert_eq!(data, decompressed);
    }

    #[test]
    fn test_parallel_large() {
        let data = (0..1000000).map(|i| (i % 256) as u8).collect::<Vec<u8>>();
        let compressed = compress_parallel(&data, 8).unwrap();
        assert!(compressed.len() < data.len());
        let decompressed = decompress_parallel(&compressed, 8).unwrap();
        assert_eq!(data, decompressed);
    }

    #[test]
    fn test_parallel_all_levels() {
        let data = vec![b'X'; 200000];

        for level in [Level::Fast, Level::Balanced, Level::Best] {
            let compressed = compress_parallel_with_level(&data, 4, level).unwrap();
            let decompressed = decompress_parallel(&compressed, 4).unwrap();
            assert_eq!(data, decompressed);
        }
    }
}
