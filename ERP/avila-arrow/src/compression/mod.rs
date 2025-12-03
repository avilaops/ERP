//! Native compression algorithms without external dependencies
//!
//! High-performance compression optimized for columnar data with SIMD acceleration.

pub mod rle;
pub mod delta;
pub mod dictionary;
pub mod bitpack;

pub use rle::{RleEncoder, RleDecoder};
pub use delta::DeltaEncoder;
pub use dictionary::{DictionaryEncoder, DictionaryEncoderI64, DictionaryEncoderF64};
pub use bitpack::BitPackEncoder;

use crate::error::{ArrowError, Result};

/// Compression codec type
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Codec {
    /// No compression
    None,
    /// Run-Length Encoding (best for repeated values)
    Rle,
    /// Delta encoding (best for sorted/sequential data)
    Delta,
    /// Dictionary encoding (best for low cardinality)
    Dictionary,
    /// Bit-packing (best for small integers)
    BitPack,
}

/// Compression level
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    /// Fastest compression, lower ratio
    Fast = 1,
    /// Balanced compression
    Default = 5,
    /// Best compression, slower
    Max = 9,
}

impl Default for Level {
    fn default() -> Self {
        Level::Default
    }
}

/// Compress data using specified codec
pub fn compress(data: &[u8], codec: Codec, _level: Level) -> Result<Vec<u8>> {
    match codec {
        Codec::None => Ok(data.to_vec()),
        Codec::Rle => rle::encode(data),
        Codec::Delta => {
            // Convert bytes to i64 for delta encoding
            if data.len() % 8 != 0 {
                return Err(ArrowError::InvalidData(
                    "Delta codec requires 8-byte aligned data".to_string()
                ));
            }
            let values: Vec<i64> = data.chunks_exact(8)
                .map(|chunk| i64::from_le_bytes(chunk.try_into().unwrap()))
                .collect();
            delta::encode_i64(&values)
        }
        Codec::Dictionary => dictionary::encode(data),
        Codec::BitPack => {
            // Convert bytes to i64 for bit-packing
            if data.len() % 8 != 0 {
                return Err(ArrowError::InvalidData(
                    "BitPack codec requires 8-byte aligned data".to_string()
                ));
            }
            let values: Vec<i64> = data.chunks_exact(8)
                .map(|chunk| i64::from_le_bytes(chunk.try_into().unwrap()))
                .collect();
            let bit_width = bitpack::detect_bit_width(&values);
            let mut packed = bitpack::pack(&values, bit_width)?;
            // Prepend bit_width and count
            let mut output = Vec::new();
            output.push(bit_width);
            output.extend_from_slice(&(values.len() as u32).to_le_bytes());
            output.append(&mut packed);
            Ok(output)
        }
    }
}

/// Decompress data using specified codec
pub fn decompress(data: &[u8], codec: Codec) -> Result<Vec<u8>> {
    match codec {
        Codec::None => Ok(data.to_vec()),
        Codec::Rle => rle::decode(data),
        Codec::Delta => {
            let values = delta::decode_i64(data)?;
            let mut output = Vec::with_capacity(values.len() * 8);
            for v in values {
                output.extend_from_slice(&v.to_le_bytes());
            }
            Ok(output)
        }
        Codec::Dictionary => dictionary::decode(data),
        Codec::BitPack => {
            if data.len() < 5 {
                return Err(ArrowError::InvalidData(
                    "BitPack data too short".to_string()
                ));
            }
            let bit_width = data[0];
            let count = u32::from_le_bytes(data[1..5].try_into().unwrap()) as usize;
            let packed = &data[5..];
            let values = bitpack::unpack(packed, bit_width, count)?;
            let mut output = Vec::with_capacity(values.len() * 8);
            for v in values {
                output.extend_from_slice(&v.to_le_bytes());
            }
            Ok(output)
        }
    }
}

/// Auto-select best codec for data
pub fn auto_codec(data: &[u8]) -> Codec {
    if data.len() < 64 {
        return Codec::None;
    }

    // Sample data to determine best codec
    let sample_size = data.len().min(1024);
    let sample = &data[..sample_size];

    let unique_count = count_unique(sample);
    let unique_ratio = unique_count as f64 / sample_size as f64;

    // Check for very repeated values (RLE) - less than 10% unique
    if unique_ratio < 0.1 {
        return Codec::Rle;
    }

    // Check for sequential/sorted data (Delta)
    if is_mostly_sequential(sample) {
        return Codec::Delta;
    }

    // Check for low cardinality (Dictionary) - 10-25% unique
    if unique_ratio < 0.25 {
        return Codec::Dictionary;
    }

    // Default to bit-packing for integers
    Codec::BitPack
}

fn count_unique(data: &[u8]) -> usize {
    let mut seen = [false; 256];
    let mut count = 0;
    for &byte in data {
        if !seen[byte as usize] {
            seen[byte as usize] = true;
            count += 1;
        }
    }
    count
}

fn is_mostly_sequential(data: &[u8]) -> bool {
    if data.len() < 2 {
        return false;
    }

    let mut sequential = 0;
    for i in 1..data.len() {
        let diff = (data[i] as i16 - data[i-1] as i16).abs();
        if diff <= 2 {
            sequential += 1;
        }
    }

    sequential > data.len() * 3 / 4
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rle_codec_selection() {
        // Repeated values -> RLE
        let repeated = vec![1u8; 1000];
        assert_eq!(auto_codec(&repeated), Codec::Rle);
    }

    #[test]
    fn test_delta_codec_selection() {
        // Sequential -> Delta
        let sequential: Vec<u8> = (0..=255).cycle().take(1000).collect();
        assert_eq!(auto_codec(&sequential), Codec::Delta);
    }

    #[test]
    fn test_dictionary_codec_selection() {
        // Low cardinality non-sequential (12% unique) -> Dictionary
        let values = [7u8, 23, 41, 59, 77, 93, 111, 127, 143, 161, 179, 197, 213, 231, 249,
                      11, 29, 47, 63, 81, 97, 113, 131, 149, 167, 183, 199, 217, 233, 251,
                      13, 31, 53, 71, 89, 107, 123, 139, 157, 173, 191, 209, 227, 241,
                      17, 37, 57, 73, 91, 109, 137, 151, 169, 187, 203, 221, 239,
                      19, 43, 61, 79, 103, 121, 141, 163, 181, 193, 211, 229,
                      3, 33, 49, 67, 83, 101, 117, 133, 147, 165, 177, 195, 207, 223, 237,
                      5, 27, 39, 51, 69, 87, 99, 115, 129, 145, 159, 171, 189, 201, 219, 235,
                      9, 21, 35, 55, 75, 85, 95, 105, 125, 135, 153, 175, 185, 205, 215, 225, 245];
        let low_card: Vec<u8> = (0..1000).map(|i| values[i % values.len()]).collect();
        assert_eq!(auto_codec(&low_card), Codec::Dictionary);
    }
}
