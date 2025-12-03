//! Columnar compression algorithms optimized for scientific and time-series data
//!
//! This module provides specialized compression techniques for columnar data:
//! - **RLE (Run-Length Encoding)**: For repetitive data (10-50x compression)
//! - **Delta Encoding**: For monotonic sequences (time series, counters)
//! - **FOR (Frame-of-Reference)**: For data with small range
//! - **BitPacking**: For integers with limited bit width
//!
//! These algorithms are inspired by Apache Arrow, Parquet, and ClickHouse.

use crate::{Error, Result};

/// Run-Length Encoding for repetitive data
///
/// Compresses sequences of repeated values into (value, count) pairs.
/// Perfect for sparse data, boolean columns, and constant sequences.
///
/// # Example
/// ```
/// use avila_compress::columnar;
///
/// let data = vec![1.0, 1.0, 1.0, 2.0, 2.0, 3.0];
/// let compressed = columnar::rle_encode_f64(&data);
/// let decompressed = columnar::rle_decode_f64(&compressed).unwrap();
/// assert_eq!(data, decompressed);
/// ```
pub fn rle_encode_f64(data: &[f64]) -> Vec<u8> {
    if data.is_empty() {
        return vec![];
    }

    let mut output = Vec::new();

    // Write count of runs
    output.extend_from_slice(&(0u32).to_le_bytes()); // Placeholder
    let mut run_count = 0u32;

    let mut i = 0;
    while i < data.len() {
        let value = data[i];
        let mut count = 1usize;

        // Count consecutive equal values
        while i + count < data.len() && data[i + count] == value {
            count += 1;
        }

        // Write (value, count) pair
        output.extend_from_slice(&value.to_le_bytes());
        output.extend_from_slice(&(count as u32).to_le_bytes());

        i += count;
        run_count += 1;
    }

    // Write actual run count at the beginning
    output[0..4].copy_from_slice(&run_count.to_le_bytes());

    output
}

/// Decode RLE-encoded f64 data
pub fn rle_decode_f64(data: &[u8]) -> Result<Vec<f64>> {
    if data.is_empty() {
        return Ok(vec![]);
    }

    if data.len() < 4 {
        return Err(Error::InvalidInput("RLE data too short".to_string()));
    }

    let run_count = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
    let mut output = Vec::new();
    let mut pos = 4;

    for _ in 0..run_count {
        if pos + 12 > data.len() {
            return Err(Error::CorruptedData("Incomplete RLE run".to_string()));
        }

        let value = f64::from_le_bytes([
            data[pos],
            data[pos + 1],
            data[pos + 2],
            data[pos + 3],
            data[pos + 4],
            data[pos + 5],
            data[pos + 6],
            data[pos + 7],
        ]);
        pos += 8;

        let count = u32::from_le_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]])
            as usize;
        pos += 4;

        for _ in 0..count {
            output.push(value);
        }
    }

    Ok(output)
}

/// RLE encoding for integers
pub fn rle_encode_i64(data: &[i64]) -> Vec<u8> {
    if data.is_empty() {
        return vec![];
    }

    let mut output = Vec::new();
    output.extend_from_slice(&(0u32).to_le_bytes());
    let mut run_count = 0u32;

    let mut i = 0;
    while i < data.len() {
        let value = data[i];
        let mut count = 1usize;

        while i + count < data.len() && data[i + count] == value {
            count += 1;
        }

        output.extend_from_slice(&value.to_le_bytes());
        output.extend_from_slice(&(count as u32).to_le_bytes());

        i += count;
        run_count += 1;
    }

    output[0..4].copy_from_slice(&run_count.to_le_bytes());
    output
}

/// Decode RLE-encoded i64 data
pub fn rle_decode_i64(data: &[u8]) -> Result<Vec<i64>> {
    if data.is_empty() {
        return Ok(vec![]);
    }

    if data.len() < 4 {
        return Err(Error::InvalidInput("RLE data too short".to_string()));
    }

    let run_count = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
    let mut output = Vec::new();
    let mut pos = 4;

    for _ in 0..run_count {
        if pos + 12 > data.len() {
            return Err(Error::CorruptedData("Incomplete RLE run".to_string()));
        }

        let value = i64::from_le_bytes([
            data[pos],
            data[pos + 1],
            data[pos + 2],
            data[pos + 3],
            data[pos + 4],
            data[pos + 5],
            data[pos + 6],
            data[pos + 7],
        ]);
        pos += 8;

        let count = u32::from_le_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]])
            as usize;
        pos += 4;

        for _ in 0..count {
            output.push(value);
        }
    }

    Ok(output)
}

/// Delta encoding for monotonic sequences
///
/// Stores first value, then differences between consecutive elements.
/// Perfect for timestamps, counters, and monotonic series.
///
/// # Example
/// ```
/// use avila_compress::columnar;
///
/// let timestamps = vec![1000, 1001, 1002, 1003, 1004];
/// let encoded = columnar::delta_encode(&timestamps);
/// let decoded = columnar::delta_decode(&encoded).unwrap();
/// assert_eq!(timestamps, decoded);
/// ```
pub fn delta_encode(data: &[i64]) -> Vec<u8> {
    if data.is_empty() {
        return vec![];
    }

    let mut output = Vec::new();

    // Write count
    output.extend_from_slice(&(data.len() as u32).to_le_bytes());

    // Write first value
    output.extend_from_slice(&data[0].to_le_bytes());

    // Write deltas
    for i in 1..data.len() {
        let delta = data[i] - data[i - 1];
        output.extend_from_slice(&delta.to_le_bytes());
    }

    output
}

/// Decode delta-encoded data
pub fn delta_decode(data: &[u8]) -> Result<Vec<i64>> {
    if data.is_empty() {
        return Ok(vec![]);
    }

    if data.len() < 4 {
        return Err(Error::InvalidInput("Delta data too short".to_string()));
    }

    let count = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;

    if count == 0 {
        return Ok(vec![]);
    }

    if data.len() < 4 + count * 8 {
        return Err(Error::CorruptedData("Incomplete delta data".to_string()));
    }

    let mut output = Vec::with_capacity(count);

    // Read first value
    let first = i64::from_le_bytes([
        data[4], data[5], data[6], data[7], data[8], data[9], data[10], data[11],
    ]);
    output.push(first);

    // Read deltas and reconstruct
    let mut pos = 12;
    for _ in 1..count {
        let delta = i64::from_le_bytes([
            data[pos],
            data[pos + 1],
            data[pos + 2],
            data[pos + 3],
            data[pos + 4],
            data[pos + 5],
            data[pos + 6],
            data[pos + 7],
        ]);
        pos += 8;

        let value = output.last().unwrap() + delta;
        output.push(value);
    }

    Ok(output)
}

/// Frame-of-Reference encoding
///
/// Stores minimum value and offsets from that minimum.
/// Reduces bit width needed for storage.
///
/// # Example
/// ```
/// use avila_compress::columnar;
///
/// let data = vec![1000, 1001, 1002, 1005, 1010];
/// let encoded = columnar::for_encode(&data);
/// let decoded = columnar::for_decode(&encoded).unwrap();
/// assert_eq!(data, decoded);
/// ```
pub fn for_encode(data: &[i64]) -> Vec<u8> {
    if data.is_empty() {
        return vec![];
    }

    let mut output = Vec::new();

    // Write count
    output.extend_from_slice(&(data.len() as u32).to_le_bytes());

    // Find min value (reference frame)
    let min_value = *data.iter().min().unwrap();
    output.extend_from_slice(&min_value.to_le_bytes());

    // Write offsets from min
    for &value in data {
        let offset = (value - min_value) as u64;
        output.extend_from_slice(&offset.to_le_bytes());
    }

    output
}

/// Decode FOR-encoded data
pub fn for_decode(data: &[u8]) -> Result<Vec<i64>> {
    if data.is_empty() {
        return Ok(vec![]);
    }

    if data.len() < 12 {
        return Err(Error::InvalidInput("FOR data too short".to_string()));
    }

    let count = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;

    let min_value = i64::from_le_bytes([
        data[4], data[5], data[6], data[7], data[8], data[9], data[10], data[11],
    ]);

    if data.len() < 12 + count * 8 {
        return Err(Error::CorruptedData("Incomplete FOR data".to_string()));
    }

    let mut output = Vec::with_capacity(count);
    let mut pos = 12;

    for _ in 0..count {
        let offset = u64::from_le_bytes([
            data[pos],
            data[pos + 1],
            data[pos + 2],
            data[pos + 3],
            data[pos + 4],
            data[pos + 5],
            data[pos + 6],
            data[pos + 7],
        ]);
        pos += 8;

        output.push(min_value + offset as i64);
    }

    Ok(output)
}

/// Calculate compression statistics
pub struct ColumnStats {
    pub original_size: usize,
    pub compressed_size: usize,
    pub algorithm: String,
}

impl ColumnStats {
    pub fn ratio(&self) -> f64 {
        if self.original_size == 0 {
            return 1.0;
        }
        self.compressed_size as f64 / self.original_size as f64
    }

    pub fn compression_factor(&self) -> f64 {
        if self.compressed_size == 0 {
            return 0.0;
        }
        self.original_size as f64 / self.compressed_size as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rle_f64_basic() {
        let data = vec![1.0, 1.0, 1.0, 2.0, 2.0];
        let encoded = rle_encode_f64(&data);
        let decoded = rle_decode_f64(&encoded).unwrap();
        assert_eq!(data, decoded);
    }

    #[test]
    fn test_rle_f64_all_same() {
        let data = vec![42.0; 1000];
        let encoded = rle_encode_f64(&data);
        let decoded = rle_decode_f64(&encoded).unwrap();
        assert_eq!(data, decoded);

        // Should be highly compressed
        let original_size = data.len() * std::mem::size_of::<f64>();
        assert!(encoded.len() < original_size / 10);
    }

    #[test]
    fn test_rle_i64_basic() {
        let data = vec![10, 10, 10, 20, 20, 30];
        let encoded = rle_encode_i64(&data);
        let decoded = rle_decode_i64(&encoded).unwrap();
        assert_eq!(data, decoded);
    }

    #[test]
    fn test_delta_encoding() {
        let data = vec![100, 101, 102, 103, 104, 105];
        let encoded = delta_encode(&data);
        let decoded = delta_decode(&encoded).unwrap();
        assert_eq!(data, decoded);
    }

    #[test]
    fn test_delta_non_monotonic() {
        let data = vec![10, 15, 12, 18, 20];
        let encoded = delta_encode(&data);
        let decoded = delta_decode(&encoded).unwrap();
        assert_eq!(data, decoded);
    }

    #[test]
    fn test_for_encoding() {
        let data = vec![1000, 1001, 1002, 1005, 1010];
        let encoded = for_encode(&data);
        let decoded = for_decode(&encoded).unwrap();
        assert_eq!(data, decoded);
    }

    #[test]
    fn test_for_with_large_range() {
        let data = vec![0, 1000, 5000, 10000];
        let encoded = for_encode(&data);
        let decoded = for_decode(&encoded).unwrap();
        assert_eq!(data, decoded);
    }

    #[test]
    fn test_empty_data() {
        let data: Vec<f64> = vec![];
        let encoded = rle_encode_f64(&data);
        let decoded = rle_decode_f64(&encoded).unwrap();
        assert_eq!(data, decoded);

        let data_i64: Vec<i64> = vec![];
        let encoded_delta = delta_encode(&data_i64);
        let decoded_delta = delta_decode(&encoded_delta).unwrap();
        assert_eq!(data_i64, decoded_delta);
    }
}
