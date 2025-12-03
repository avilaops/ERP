//! Dictionary Encoding implementation
//!
//! Optimized for low-cardinality data (categorical columns)

use crate::error::{ArrowError, Result};
use std::collections::HashMap;

/// Encode data using dictionary encoding
pub fn encode(data: &[u8]) -> Result<Vec<u8>> {
    if data.is_empty() {
        return Ok(Vec::new());
    }

    let mut dictionary = Vec::new();
    let mut map: HashMap<u8, u8> = HashMap::new();
    let mut indices = Vec::with_capacity(data.len());

    // Build dictionary
    for &value in data {
        let index = *map.entry(value).or_insert_with(|| {
            let idx = dictionary.len() as u8;
            dictionary.push(value);
            idx
        });
        indices.push(index);
    }

    if dictionary.len() > 255 {
        return Err(ArrowError::InvalidData(
            "Dictionary too large (>255 entries)".to_string()
        ));
    }

    // Output format: [dict_size][dict_values...][indices...]
    let mut output = Vec::with_capacity(1 + dictionary.len() + indices.len());
    output.push(dictionary.len() as u8);
    output.extend_from_slice(&dictionary);
    output.extend_from_slice(&indices);

    Ok(output)
}

/// Decode dictionary-encoded data
pub fn decode(data: &[u8]) -> Result<Vec<u8>> {
    if data.is_empty() {
        return Ok(Vec::new());
    }

    if data.len() < 1 {
        return Err(ArrowError::InvalidData(
            "Dictionary data too short".to_string()
        ));
    }

    let dict_size = data[0] as usize;
    if data.len() < 1 + dict_size {
        return Err(ArrowError::InvalidData(
            "Truncated dictionary".to_string()
        ));
    }

    let dictionary = &data[1..1 + dict_size];
    let indices = &data[1 + dict_size..];

    let mut output = Vec::with_capacity(indices.len());
    for &idx in indices {
        if idx as usize >= dict_size {
            return Err(ArrowError::InvalidData(
                format!("Invalid index {} for dictionary size {}", idx, dict_size)
            ));
        }
        output.push(dictionary[idx as usize]);
    }

    Ok(output)
}

/// Dictionary encoder for strings
pub struct DictionaryEncoder {
    dictionary: Vec<Vec<u8>>,
    map: HashMap<Vec<u8>, u32>,
    indices: Vec<u32>,
}

impl DictionaryEncoder {
    /// Create new encoder
    pub fn new() -> Self {
        Self {
            dictionary: Vec::new(),
            map: HashMap::new(),
            indices: Vec::new(),
        }
    }

    /// Encode a string value
    pub fn encode(&mut self, value: &[u8]) -> Result<()> {
        let index = *self.map.entry(value.to_vec()).or_insert_with(|| {
            let idx = self.dictionary.len() as u32;
            self.dictionary.push(value.to_vec());
            idx
        });
        self.indices.push(index);
        Ok(())
    }

    /// Get dictionary size
    pub fn dict_size(&self) -> usize {
        self.dictionary.len()
    }

    /// Get encoded data
    pub fn finish(self) -> (Vec<Vec<u8>>, Vec<u32>) {
        (self.dictionary, self.indices)
    }
}

impl Default for DictionaryEncoder {
    fn default() -> Self {
        Self::new()
    }
}

/// Dictionary encoder for integers
pub struct DictionaryEncoderI64 {
    dictionary: Vec<i64>,
    map: HashMap<i64, u32>,
    indices: Vec<u32>,
}

impl DictionaryEncoderI64 {
    /// Create new encoder
    pub fn new() -> Self {
        Self {
            dictionary: Vec::new(),
            map: HashMap::new(),
            indices: Vec::new(),
        }
    }

    /// Encode an i64 value
    pub fn encode(&mut self, value: i64) {
        let index = *self.map.entry(value).or_insert_with(|| {
            let idx = self.dictionary.len() as u32;
            self.dictionary.push(value);
            idx
        });
        self.indices.push(index);
    }

    /// Get dictionary size
    pub fn dict_size(&self) -> usize {
        self.dictionary.len()
    }

    /// Get encoded data
    pub fn finish(self) -> (Vec<i64>, Vec<u32>) {
        (self.dictionary, self.indices)
    }
}

impl Default for DictionaryEncoderI64 {
    fn default() -> Self {
        Self::new()
    }
}

/// Dictionary encoder for f64
pub struct DictionaryEncoderF64 {
    dictionary: Vec<f64>,
    map: HashMap<u64, u32>, // Use bits as key
    indices: Vec<u32>,
}

impl DictionaryEncoderF64 {
    /// Create new encoder
    pub fn new() -> Self {
        Self {
            dictionary: Vec::new(),
            map: HashMap::new(),
            indices: Vec::new(),
        }
    }

    /// Encode an f64 value
    pub fn encode(&mut self, value: f64) {
        let bits = value.to_bits();
        let index = *self.map.entry(bits).or_insert_with(|| {
            let idx = self.dictionary.len() as u32;
            self.dictionary.push(value);
            idx
        });
        self.indices.push(index);
    }

    /// Get dictionary size
    pub fn dict_size(&self) -> usize {
        self.dictionary.len()
    }

    /// Get encoded data
    pub fn finish(self) -> (Vec<f64>, Vec<u32>) {
        (self.dictionary, self.indices)
    }
}

impl Default for DictionaryEncoderF64 {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dict_low_cardinality() {
        let data = vec![1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3];
        let encoded = encode(&data).unwrap();
        // Small data may not compress due to overhead

        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_dict_repeated() {
        let data = vec![5u8; 100];
        let encoded = encode(&data).unwrap();
        // Small repeated data has overhead

        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_dict_encoder_strings() {
        let mut encoder = DictionaryEncoder::new();
        encoder.encode(b"hello").unwrap();
        encoder.encode(b"world").unwrap();
        encoder.encode(b"hello").unwrap();
        encoder.encode(b"world").unwrap();

        assert_eq!(encoder.dict_size(), 2);
        let (dict, indices) = encoder.finish();
        assert_eq!(dict.len(), 2);
        assert_eq!(indices, vec![0, 1, 0, 1]);
    }

    #[test]
    fn test_dict_encoder_i64() {
        let mut encoder = DictionaryEncoderI64::new();
        for i in 0..100 {
            encoder.encode(i % 10); // Only 10 unique values
        }

        assert_eq!(encoder.dict_size(), 10);
        let (dict, indices) = encoder.finish();
        assert_eq!(dict.len(), 10);
        assert_eq!(indices.len(), 100);
    }

    #[test]
    fn test_dict_encoder_f64() {
        let mut encoder = DictionaryEncoderF64::new();
        for i in 0..100 {
            encoder.encode((i % 5) as f64 * 0.5); // Only 5 unique values
        }

        assert_eq!(encoder.dict_size(), 5);
        let (dict, indices) = encoder.finish();
        assert_eq!(dict.len(), 5);
        assert_eq!(indices.len(), 100);
    }
}
