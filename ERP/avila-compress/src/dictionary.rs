//! Dictionary compression for avila-compress
//!
//! Provides shared dictionary compression for improved compression ratios
//! on similar data. Trained dictionaries can be reused across multiple files.

use crate::error::{Error, Result};
use std::collections::HashMap;

/// Maximum dictionary size in bytes
pub const MAX_DICT_SIZE: usize = 64 * 1024; // 64 KB

/// Minimum sequence length to include in dictionary
const MIN_SEQUENCE_LENGTH: usize = 4;

/// Maximum sequence length to track
const MAX_SEQUENCE_LENGTH: usize = 128;

/// A trained compression dictionary
#[derive(Debug, Clone)]
pub struct Dictionary {
    /// Dictionary data buffer
    data: Vec<u8>,
    /// Sequence map: hash -> (offset, length)
    sequences: HashMap<u64, Vec<(u32, u16)>>,
    /// Total samples used in training
    samples_count: usize,
}

impl Dictionary {
    /// Create a new empty dictionary
    pub fn new() -> Self {
        Self {
            data: Vec::new(),
            sequences: HashMap::new(),
            samples_count: 0,
        }
    }

    /// Train a dictionary from multiple data samples
    ///
    /// # Arguments
    /// * `samples` - Iterator of byte slices to train on
    /// * `max_size` - Maximum dictionary size in bytes
    ///
    /// # Example
    /// ```
    /// use avila_compress::dictionary::Dictionary;
    ///
    /// let samples = vec![
    ///     b"user_id: 12345, name: John".as_slice(),
    ///     b"user_id: 67890, name: Jane".as_slice(),
    /// ];
    ///
    /// let dict = Dictionary::train(samples.into_iter(), 8192).unwrap();
    /// ```
    pub fn train<'a, I>(samples: I, max_size: usize) -> Result<Self>
    where
        I: Iterator<Item = &'a [u8]>,
    {
        if max_size > MAX_DICT_SIZE {
            return Err(Error::InvalidInput("Dictionary size too large".to_string()));
        }

        let mut builder = DictionaryBuilder::new(max_size);

        for sample in samples {
            builder.add_sample(sample);
        }

        builder.build()
    }

    /// Get dictionary data
    pub fn data(&self) -> &[u8] {
        &self.data
    }

    /// Get dictionary size in bytes
    pub fn size(&self) -> usize {
        self.data.len()
    }

    /// Find matching sequence in dictionary
    ///
    /// Returns (offset, length) if found
    pub fn find_match(&self, data: &[u8], pos: usize, max_len: usize) -> Option<(u32, u16)> {
        if pos + MIN_SEQUENCE_LENGTH > data.len() {
            return None;
        }

        let search_len = (max_len.min(MAX_SEQUENCE_LENGTH)).min(data.len() - pos);

        // Try progressively shorter sequences
        for len in (MIN_SEQUENCE_LENGTH..=search_len).rev() {
            let sequence = &data[pos..pos + len];
            let hash = hash_sequence(sequence);

            if let Some(positions) = self.sequences.get(&hash) {
                // Find best match
                for &(offset, dict_len) in positions {
                    if dict_len as usize >= len {
                        // Verify actual match
                        let dict_data = &self.data[offset as usize..offset as usize + len];
                        if dict_data == sequence {
                            return Some((offset, len as u16));
                        }
                    }
                }
            }
        }

        None
    }

    /// Compress data using this dictionary
    pub fn compress(&self, input: &[u8]) -> Result<Vec<u8>> {
        compress_with_dict(input, self)
    }

    /// Decompress data using this dictionary
    pub fn decompress(&self, input: &[u8]) -> Result<Vec<u8>> {
        decompress_with_dict(input, self)
    }
}

impl Default for Dictionary {
    fn default() -> Self {
        Self::new()
    }
}

/// Dictionary builder for training
struct DictionaryBuilder {
    max_size: usize,
    sequence_freq: HashMap<Vec<u8>, usize>,
    total_samples: usize,
}

impl DictionaryBuilder {
    fn new(max_size: usize) -> Self {
        Self {
            max_size,
            sequence_freq: HashMap::new(),
            total_samples: 0,
        }
    }

    fn add_sample(&mut self, data: &[u8]) {
        self.total_samples += 1;

        // Extract all sequences of varying lengths
        for len in MIN_SEQUENCE_LENGTH..=MAX_SEQUENCE_LENGTH.min(data.len()) {
            for i in 0..=(data.len().saturating_sub(len)) {
                let sequence = data[i..i + len].to_vec();
                *self.sequence_freq.entry(sequence).or_insert(0) += 1;
            }
        }
    }

    fn build(self) -> Result<Dictionary> {
        // Sort sequences by frequency * length (benefit score)
        let mut sequences: Vec<_> = self.sequence_freq
            .into_iter()
            .map(|(seq, freq)| {
                let benefit = freq * seq.len();
                (seq, freq, benefit)
            })
            .collect();

        sequences.sort_by(|a, b| b.2.cmp(&a.2));

        // Build dictionary data and index
        let mut dict_data = Vec::new();
        let mut dict_sequences = HashMap::new();

        for (seq, _freq, _benefit) in sequences {
            if dict_data.len() + seq.len() > self.max_size {
                break;
            }

            // Check for overlap with existing sequences to save space
            let offset = dict_data.len() as u32;
            let len = seq.len() as u16;

            dict_data.extend_from_slice(&seq);

            // Add to sequence map
            let hash = hash_sequence(&seq);
            dict_sequences
                .entry(hash)
                .or_insert_with(Vec::new)
                .push((offset, len));
        }

        Ok(Dictionary {
            data: dict_data,
            sequences: dict_sequences,
            samples_count: self.total_samples,
        })
    }
}

/// Compress data using a dictionary
fn compress_with_dict(input: &[u8], dict: &Dictionary) -> Result<Vec<u8>> {
    let mut output = Vec::with_capacity(input.len());

    // Header: magic + dict flag
    output.extend_from_slice(b"LZ4D"); // LZ4 with Dictionary
    output.push(1); // Version

    let mut pos = 0;

    while pos < input.len() {
        // Try to find match in dictionary
        if let Some((dict_offset, match_len)) = dict.find_match(input, pos, 128) {
            // Encode dictionary match
            output.push(0xFF); // Dictionary match marker
            output.extend_from_slice(&dict_offset.to_le_bytes());
            output.extend_from_slice(&match_len.to_le_bytes());
            pos += match_len as usize;
        } else {
            // Encode literal
            output.push(input[pos]);
            pos += 1;
        }
    }

    Ok(output)
}

/// Decompress data using a dictionary
fn decompress_with_dict(input: &[u8], dict: &Dictionary) -> Result<Vec<u8>> {
    if input.len() < 5 {
        return Err(Error::InvalidInput("Input too short".to_string()));
    }

    // Verify header
    if &input[0..4] != b"LZ4D" {
        return Err(Error::InvalidInput("Invalid magic header".to_string()));
    }

    let version = input[4];
    if version != 1 {
        return Err(Error::InvalidInput(format!("Unsupported version: {}", version)));
    }

    let mut output = Vec::new();
    let mut pos = 5;

    while pos < input.len() {
        if input[pos] == 0xFF {
            // Dictionary match
            if pos + 7 > input.len() {
                return Err(Error::InvalidInput("Truncated dictionary match".to_string()));
            }

            let dict_offset = u32::from_le_bytes([
                input[pos + 1],
                input[pos + 2],
                input[pos + 3],
                input[pos + 4],
            ]);

            let match_len = u16::from_le_bytes([input[pos + 5], input[pos + 6]]);

            let dict_end = (dict_offset as usize + match_len as usize).min(dict.data.len());
            output.extend_from_slice(&dict.data[dict_offset as usize..dict_end]);

            pos += 7;
        } else {
            // Literal
            output.push(input[pos]);
            pos += 1;
        }
    }

    Ok(output)
}

/// Hash a sequence using FNV-1a
fn hash_sequence(data: &[u8]) -> u64 {
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;

    let mut hash = FNV_OFFSET;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dictionary_training() {
        let samples = vec![
            b"user_id: 12345, name: John, email: john@example.com".as_slice(),
            b"user_id: 67890, name: Jane, email: jane@example.com".as_slice(),
            b"user_id: 54321, name: Bob, email: bob@example.com".as_slice(),
        ];

        let dict = Dictionary::train(samples.into_iter(), 1024).unwrap();
        assert!(dict.size() > 0);
        assert!(dict.size() <= 1024);
    }

    #[test]
    fn test_compression_with_dict() {
        let samples = vec![
            b"SELECT * FROM users WHERE id = 1".as_slice(),
            b"SELECT * FROM users WHERE id = 2".as_slice(),
        ];

        let dict = Dictionary::train(samples.into_iter(), 512).unwrap();

        let input = b"SELECT * FROM users WHERE id = 3";
        let compressed = dict.compress(input).unwrap();
        let decompressed = dict.decompress(&compressed).unwrap();

        assert_eq!(input.as_slice(), decompressed.as_slice());
    }

    #[test]
    fn test_empty_input() {
        let dict = Dictionary::new();
        let compressed = dict.compress(b"").unwrap();
        let decompressed = dict.decompress(&compressed).unwrap();
        assert_eq!(decompressed.len(), 0);
    }

    #[test]
    fn test_no_matches() {
        let samples = vec![b"aaaa".as_slice(), b"bbbb".as_slice()];
        let dict = Dictionary::train(samples.into_iter(), 512).unwrap();

        let input = b"cccc";
        let compressed = dict.compress(input).unwrap();
        let decompressed = dict.decompress(&compressed).unwrap();

        assert_eq!(input.as_slice(), decompressed.as_slice());
    }
}
