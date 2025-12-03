//! Delta Encoding implementation
//!
//! Optimized for sequential/sorted data (timestamps, IDs)

use crate::error::{ArrowError, Result};
use std::mem;

/// Encode i64 data using delta encoding
pub fn encode_i64(data: &[i64]) -> Result<Vec<u8>> {
    if data.is_empty() {
        return Ok(Vec::new());
    }

    let mut output = Vec::with_capacity(data.len() * mem::size_of::<i64>());

    // Write first value
    output.extend_from_slice(&data[0].to_le_bytes());

    // Write deltas with variable-length encoding
    for i in 1..data.len() {
        let delta = data[i].wrapping_sub(data[i - 1]);
        write_varint(&mut output, delta);
    }

    Ok(output)
}

/// Decode i64 delta-encoded data
pub fn decode_i64(data: &[u8]) -> Result<Vec<i64>> {
    if data.len() < 8 {
        return Err(ArrowError::InvalidData(
            "Delta data must have at least 8 bytes".to_string()
        ));
    }

    let mut output = Vec::new();
    let mut i = 0;

    // Read first value
    let first = i64::from_le_bytes(data[i..i+8].try_into().unwrap());
    output.push(first);
    i += 8;

    // Read deltas
    let mut last = first;
    while i < data.len() {
        let (delta, bytes_read) = read_varint(&data[i..])?;
        last = last.wrapping_add(delta);
        output.push(last);
        i += bytes_read;
    }

    Ok(output)
}

/// Encode f64 data using delta encoding
pub fn encode_f64(data: &[f64]) -> Result<Vec<u8>> {
    // Convert to i64 bits for delta encoding
    let bits: Vec<i64> = data.iter()
        .map(|&f| f.to_bits() as i64)
        .collect();
    encode_i64(&bits)
}

/// Decode f64 delta-encoded data
pub fn decode_f64(data: &[u8]) -> Result<Vec<f64>> {
    let bits = decode_i64(data)?;
    Ok(bits.iter()
        .map(|&i| f64::from_bits(i as u64))
        .collect())
}

/// Write variable-length integer (zigzag encoding)
fn write_varint(output: &mut Vec<u8>, value: i64) {
    // Zigzag encode: (n << 1) ^ (n >> 63)
    let zigzag = ((value << 1) ^ (value >> 63)) as u64;

    let mut n = zigzag;
    loop {
        let mut byte = (n & 0x7F) as u8;
        n >>= 7;
        if n != 0 {
            byte |= 0x80; // Set continuation bit
        }
        output.push(byte);
        if n == 0 {
            break;
        }
    }
}

/// Read variable-length integer (zigzag decoding)
fn read_varint(data: &[u8]) -> Result<(i64, usize)> {
    let mut result = 0u64;
    let mut shift = 0;
    let mut i = 0;

    loop {
        if i >= data.len() {
            return Err(ArrowError::InvalidData(
                "Truncated varint".to_string()
            ));
        }

        let byte = data[i];
        result |= ((byte & 0x7F) as u64) << shift;
        i += 1;

        if byte & 0x80 == 0 {
            break;
        }
        shift += 7;

        if shift >= 64 {
            return Err(ArrowError::InvalidData(
                "Varint too large".to_string()
            ));
        }
    }

    // Zigzag decode: (n >> 1) ^ -(n & 1)
    let value = ((result >> 1) as i64) ^ -((result & 1) as i64);
    Ok((value, i))
}

/// Delta encoder with state
pub struct DeltaEncoder {
    last: Option<i64>,
    buffer: Vec<u8>,
}

impl DeltaEncoder {
    /// Create new encoder
    pub fn new() -> Self {
        Self {
            last: None,
            buffer: Vec::new(),
        }
    }

    /// Encode i64 value
    pub fn encode_i64(&mut self, value: i64) {
        match self.last {
            None => {
                self.buffer.extend_from_slice(&value.to_le_bytes());
                self.last = Some(value);
            }
            Some(last) => {
                let delta = value.wrapping_sub(last);
                write_varint(&mut self.buffer, delta);
                self.last = Some(value);
            }
        }
    }

    /// Encode f64 value
    pub fn encode_f64(&mut self, value: f64) {
        self.encode_i64(value.to_bits() as i64);
    }

    /// Get encoded data
    pub fn finish(self) -> Vec<u8> {
        self.buffer
    }
}

impl Default for DeltaEncoder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_delta_sequential() {
        let data: Vec<i64> = (0..1000).collect();
        let encoded = encode_i64(&data).unwrap();
        assert!(encoded.len() < data.len() * 8);

        let decoded = decode_i64(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_delta_timestamps() {
        let base = 1700000000i64;
        let data: Vec<i64> = (0..100).map(|i| base + i * 1000).collect();
        let encoded = encode_i64(&data).unwrap();
        let decoded = decode_i64(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_delta_f64() {
        let data: Vec<f64> = (0..100).map(|i| i as f64 * 0.1).collect();
        let encoded = encode_f64(&data).unwrap();
        let decoded = decode_f64(&encoded).unwrap();

        for (a, b) in data.iter().zip(decoded.iter()) {
            assert!((a - b).abs() < 1e-10);
        }
    }

    #[test]
    fn test_varint() {
        let values = vec![0i64, 1, -1, 127, -127, 128, -128, 10000, -10000];
        let mut buffer = Vec::new();

        for &v in &values {
            write_varint(&mut buffer, v);
        }

        let mut pos = 0;
        for &v in &values {
            let (decoded, bytes) = read_varint(&buffer[pos..]).unwrap();
            assert_eq!(decoded, v);
            pos += bytes;
        }
    }

    #[test]
    fn test_delta_encoder() {
        let mut encoder = DeltaEncoder::new();
        for i in 0..100 {
            encoder.encode_i64(i);
        }

        let encoded = encoder.finish();
        let decoded = decode_i64(&encoded).unwrap();
        assert_eq!(decoded, (0..100).collect::<Vec<_>>());
    }
}
