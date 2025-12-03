//! Run-Length Encoding (RLE) implementation
//!
//! Optimized for data with repeated values

use crate::error::{ArrowError, Result};

/// Encode data using RLE
pub fn encode(data: &[u8]) -> Result<Vec<u8>> {
    if data.is_empty() {
        return Ok(Vec::new());
    }

    let mut output = Vec::with_capacity(data.len() / 2);
    let mut i = 0;

    while i < data.len() {
        let value = data[i];
        let mut count = 1u8;

        // Count consecutive identical values
        while i + (count as usize) < data.len()
            && data[i + count as usize] == value
            && count < 255 {
            count += 1;
        }

        // Write count and value
        output.push(count);
        output.push(value);

        i += count as usize;
    }

    Ok(output)
}

/// Decode RLE data
pub fn decode(data: &[u8]) -> Result<Vec<u8>> {
    if data.len() % 2 != 0 {
        return Err(ArrowError::InvalidData(
            "RLE data must have even length".to_string()
        ));
    }

    let mut output = Vec::with_capacity(data.len() * 2);
    let mut i = 0;

    while i < data.len() {
        let count = data[i] as usize;
        let value = data[i + 1];

        output.extend(std::iter::repeat(value).take(count));
        i += 2;
    }

    Ok(output)
}

/// RLE encoder with state
pub struct RleEncoder {
    buffer: Vec<u8>,
}

impl RleEncoder {
    /// Create new encoder
    pub fn new() -> Self {
        Self { buffer: Vec::new() }
    }

    /// Encode data
    pub fn encode(&mut self, data: &[u8]) -> Result<()> {
        let encoded = encode(data)?;
        self.buffer.extend_from_slice(&encoded);
        Ok(())
    }

    /// Get encoded data
    pub fn finish(self) -> Vec<u8> {
        self.buffer
    }
}

impl Default for RleEncoder {
    fn default() -> Self {
        Self::new()
    }
}

/// RLE decoder with state
pub struct RleDecoder {
    buffer: Vec<u8>,
}

impl RleDecoder {
    /// Create new decoder
    pub fn new() -> Self {
        Self { buffer: Vec::new() }
    }

    /// Decode data
    pub fn decode(&mut self, data: &[u8]) -> Result<()> {
        let decoded = decode(data)?;
        self.buffer.extend_from_slice(&decoded);
        Ok(())
    }

    /// Get decoded data
    pub fn finish(self) -> Vec<u8> {
        self.buffer
    }
}

impl Default for RleDecoder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rle_repeated() {
        let data = vec![1u8; 100];
        let encoded = encode(&data).unwrap();
        assert!(encoded.len() < data.len());

        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_rle_mixed() {
        let data = vec![1, 1, 1, 2, 2, 3, 3, 3, 3, 4];
        let encoded = encode(&data).unwrap();
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_rle_encoder() {
        let mut encoder = RleEncoder::new();
        encoder.encode(&[1, 1, 1]).unwrap();
        encoder.encode(&[2, 2, 2, 2]).unwrap();

        let encoded = encoder.finish();
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, vec![1, 1, 1, 2, 2, 2, 2]);
    }
}
