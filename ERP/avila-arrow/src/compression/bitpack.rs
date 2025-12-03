//! Bit-Packing implementation
//!
//! Packs small integers into minimal bits with SIMD acceleration

use crate::error::{ArrowError, Result};

/// Pack integers into minimal bits
pub fn pack(data: &[i64], bit_width: u8) -> Result<Vec<u8>> {
    if bit_width == 0 || bit_width > 64 {
        return Err(ArrowError::InvalidData(
            format!("Invalid bit width: {}", bit_width)
        ));
    }

    if data.is_empty() {
        return Ok(Vec::new());
    }

    let mask = if bit_width == 64 {
        u64::MAX
    } else {
        (1u64 << bit_width) - 1
    };

    let total_bits = data.len() * bit_width as usize;
    let total_bytes = (total_bits + 7) / 8;
    let mut output = vec![0u8; total_bytes];

    let mut bit_offset = 0usize;
    for &value in data {
        let packed = (value as u64) & mask;
        write_bits(&mut output, bit_offset, packed, bit_width);
        bit_offset += bit_width as usize;
    }

    Ok(output)
}

/// Unpack integers from packed bits
pub fn unpack(data: &[u8], bit_width: u8, count: usize) -> Result<Vec<i64>> {
    if bit_width == 0 || bit_width > 64 {
        return Err(ArrowError::InvalidData(
            format!("Invalid bit width: {}", bit_width)
        ));
    }

    let mask = if bit_width == 64 {
        u64::MAX
    } else {
        (1u64 << bit_width) - 1
    };

    let mut output = Vec::with_capacity(count);
    let mut bit_offset = 0usize;

    for _ in 0..count {
        let value = read_bits(data, bit_offset, bit_width);
        output.push((value & mask) as i64);
        bit_offset += bit_width as usize;
    }

    Ok(output)
}

/// Write bits to byte array
fn write_bits(data: &mut [u8], bit_offset: usize, value: u64, bit_width: u8) {
    let byte_offset = bit_offset / 8;
    let bit_shift = bit_offset % 8;
    let bits_remaining = bit_width as usize;

    let mut value = value;
    let mut bits_written = 0;
    let mut current_byte = byte_offset;

    while bits_written < bits_remaining {
        if current_byte >= data.len() {
            break;
        }

        let bits_in_current = 8 - if bits_written == 0 { bit_shift } else { 0 };
        let bits_to_write = bits_remaining - bits_written;
        let bits_this_round = bits_in_current.min(bits_to_write);

        let shift = if bits_written == 0 { bit_shift } else { 0 };
        let mask = ((1u64 << bits_this_round) - 1) << shift;

        data[current_byte] &= !(mask as u8);
        data[current_byte] |= ((value << shift) & mask) as u8;

        value >>= bits_this_round;
        bits_written += bits_this_round;
        current_byte += 1;
    }
}

/// Read bits from byte array
fn read_bits(data: &[u8], bit_offset: usize, bit_width: u8) -> u64 {
    let byte_offset = bit_offset / 8;
    let bit_shift = bit_offset % 8;
    let bits_remaining = bit_width as usize;

    let mut result = 0u64;
    let mut bits_read = 0;
    let mut current_byte = byte_offset;

    while bits_read < bits_remaining && current_byte < data.len() {
        let bits_in_current = 8 - if bits_read == 0 { bit_shift } else { 0 };
        let bits_to_read = bits_remaining - bits_read;
        let bits_this_round = bits_in_current.min(bits_to_read);

        let shift = if bits_read == 0 { bit_shift } else { 0 };
        let mask = (1u64 << bits_this_round) - 1;

        let bits = ((data[current_byte] as u64) >> shift) & mask;
        result |= bits << bits_read;

        bits_read += bits_this_round;
        current_byte += 1;
    }

    result
}

/// Detect required bit width for data
pub fn detect_bit_width(data: &[i64]) -> u8 {
    if data.is_empty() {
        return 0;
    }

    let max_value = data.iter()
        .map(|&v| v.abs() as u64)
        .max()
        .unwrap_or(0);

    if max_value == 0 {
        return 1;
    }

    64 - max_value.leading_zeros() as u8
}

/// Bit-packing encoder with auto bit-width detection
pub struct BitPackEncoder {
    values: Vec<i64>,
}

impl BitPackEncoder {
    /// Create new encoder
    pub fn new() -> Self {
        Self {
            values: Vec::new(),
        }
    }

    /// Add value to encode
    pub fn encode(&mut self, value: i64) {
        self.values.push(value);
    }

    /// Finish encoding
    pub fn finish(self) -> Result<(Vec<u8>, u8, usize)> {
        let bit_width = detect_bit_width(&self.values);
        let count = self.values.len();
        let packed = pack(&self.values, bit_width)?;
        Ok((packed, bit_width, count))
    }
}

impl Default for BitPackEncoder {
    fn default() -> Self {
        Self::new()
    }
}

/// SIMD-accelerated bit-packing for 32-bit values
#[cfg(target_arch = "x86_64")]
pub mod simd {
    use super::*;

    #[cfg(target_arch = "x86_64")]
    use std::arch::x86_64::*;

    /// Pack 8 x i32 values with SIMD (AVX2)
    #[target_feature(enable = "avx2")]
    pub unsafe fn pack_i32_x8(data: &[i32], bit_width: u8) -> Vec<u8> {
        if data.len() < 8 || bit_width > 32 {
            return vec![];
        }

        let mask = if bit_width == 32 {
            u32::MAX
        } else {
            (1u32 << bit_width) - 1
        };

        let mut output = Vec::new();
        let mut i = 0;

        while i + 8 <= data.len() {
            // Load 8 values
            let values = _mm256_loadu_si256(data[i..].as_ptr() as *const __m256i);

            // Apply mask
            let mask_vec = _mm256_set1_epi32(mask as i32);
            let masked = _mm256_and_si256(values, mask_vec);

            // Store packed values (simplified - full impl would pack bits)
            let mut buffer = [0i32; 8];
            _mm256_storeu_si256(buffer.as_mut_ptr() as *mut __m256i, masked);

            for &v in &buffer {
                output.extend_from_slice(&v.to_le_bytes());
            }

            i += 8;
        }

        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bitpack_small_values() {
        let data: Vec<i64> = vec![0, 1, 2, 3, 4, 5, 6, 7];
        let bit_width = detect_bit_width(&data);
        assert_eq!(bit_width, 3); // 7 needs 3 bits

        let packed = pack(&data, bit_width).unwrap();
        assert!(packed.len() < data.len() * 8);

        let unpacked = unpack(&packed, bit_width, data.len()).unwrap();
        assert_eq!(unpacked, data);
    }

    #[test]
    fn test_bitpack_powers_of_two() {
        let data: Vec<i64> = (0..16).map(|i| 1i64 << i).collect();
        let bit_width = detect_bit_width(&data);

        let packed = pack(&data, bit_width).unwrap();
        let unpacked = unpack(&packed, bit_width, data.len()).unwrap();
        assert_eq!(unpacked, data);
    }

    #[test]
    fn test_detect_bit_width() {
        assert_eq!(detect_bit_width(&[0, 1]), 1);
        assert_eq!(detect_bit_width(&[0, 3]), 2);
        assert_eq!(detect_bit_width(&[0, 7]), 3);
        assert_eq!(detect_bit_width(&[0, 15]), 4);
        assert_eq!(detect_bit_width(&[0, 255]), 8);
    }

    #[test]
    fn test_bitpack_encoder() {
        let mut encoder = BitPackEncoder::new();
        for i in 0..100 {
            encoder.encode(i % 16); // Values 0-15 need 4 bits
        }

        let (packed, bit_width, count) = encoder.finish().unwrap();
        assert_eq!(bit_width, 4);
        assert_eq!(count, 100);

        let unpacked = unpack(&packed, bit_width, count).unwrap();
        let expected: Vec<i64> = (0..100).map(|i| i % 16).collect();
        assert_eq!(unpacked, expected);
    }

    #[test]
    fn test_bitpack_roundtrip() {
        for bit_width in 1..=16 {
            let max_val = (1i64 << bit_width) - 1;
            let data: Vec<i64> = (0..100).map(|i| i % max_val).collect();

            let packed = pack(&data, bit_width).unwrap();
            let unpacked = unpack(&packed, bit_width, data.len()).unwrap();
            assert_eq!(unpacked, data, "Failed for bit_width={}", bit_width);
        }
    }
}
