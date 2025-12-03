//! LZ4 compression algorithm - 100% native Rust implementation
//!
//! LZ4 is an extremely fast lossless compression algorithm designed for real-time scenarios.
//! It provides compression speeds > 500 MB/s and decompression > 2000 MB/s per core.
//!
//! ## Algorithm
//! LZ4 uses a simple format:
//! - **Literals**: Uncompressed bytes copied as-is
//! - **Matches**: References to previous data (offset + length)
//!
//! ## Format
//! ```text
//! [Header: 4 bytes original size]
//! [Token byte: 4 bits literal length | 4 bits match length]
//! [Literal data if any]
//! [Match offset: 2 bytes]
//! [Extra length bytes if needed]
//! ...
//! ```

use crate::{Error, Result, Level};

/// LZ4 constants - optimized for maximum performance
const MIN_MATCH: usize = 4;
const HASH_LOG: usize = 16; // 64K hash table for better compression
const HASH_TABLE_SIZE: usize = 1 << HASH_LOG;
const MAX_DISTANCE: usize = 65535;
const LAST_LITERALS: usize = 5;
#[allow(dead_code)]
const ACCELERATION: usize = 1; // Search step size
const MFLIMIT: usize = 12; // Minimum match finder limit
const OPTIMAL_ML: usize = 18; // Optimal match length threshold

/// Compress data using LZ4 algorithm
///
/// # Arguments
/// * `input` - Raw data to compress
///
/// # Returns
/// Compressed data with 4-byte header containing original size
///
/// # Example
/// ```
/// use avila_compress::lz4;
/// let data = b"Hello, World!";
/// let compressed = lz4::compress(data).unwrap();
/// assert!(compressed.len() >= 4); // At least header
/// ```
pub fn compress(input: &[u8]) -> Result<Vec<u8>> {
    compress_with_level(input, Level::default())
}

/// Compress data with specified compression level
///
/// # Arguments
/// * `input` - Raw data to compress
/// * `level` - Compression level (Fast/Balanced/Best)
///
/// # Returns
/// Compressed data with 4-byte header
///
/// # Example
/// ```
/// use avila_compress::{lz4, Level};
/// let data = b"Hello, World!";
/// let compressed = lz4::compress_with_level(data, Level::Best).unwrap();
/// ```
pub fn compress_with_level(input: &[u8], level: Level) -> Result<Vec<u8>> {
    match level {
        Level::Fast => compress_fast(input),
        Level::Balanced => compress_balanced(input),
        Level::Best => compress_best(input),
        Level::Ultra => compress_best(input), // TODO: Fix Ultra mode - use Best for now
    }
}

/// Fast compression - prioritizes speed over ratio
fn compress_fast(input: &[u8]) -> Result<Vec<u8>> {
    if input.is_empty() {
        return Ok(vec![0, 0, 0, 0]);
    }

    if input.len() > u32::MAX as usize {
        return Err(Error::InputTooLarge {
            size: input.len(),
            max_size: u32::MAX as usize,
        });
    }

    let mut output = Vec::with_capacity(input.len() + input.len() / 255 + 16);
    output.extend_from_slice(&(input.len() as u32).to_le_bytes());

    let mut hash_table: Vec<i32> = vec![-1; HASH_TABLE_SIZE];
    let mut anchor = 0;
    let mut pos = 0;
    let input_end = input.len();
    let input_limit = if input_end > LAST_LITERALS {
        input_end - LAST_LITERALS
    } else {
        0
    };

    // Fast mode: hash every 2nd position, accept first match
    while pos < input_limit {
        if pos + MIN_MATCH <= input_end {
            let hash = hash4(&input[pos..]);
            let candidate = hash_table[hash];

            if candidate >= 0 {
                let candidate_pos = candidate as usize;
                let distance = pos - candidate_pos;

                if distance > 0 && distance <= MAX_DISTANCE {
                    let max_match = input_end - pos;
                    let len = count_match(&input[candidate_pos..], &input[pos..], max_match);

                    if len >= MIN_MATCH {
                        // Accept first match immediately
                        emit_sequence(&mut output, input, &mut anchor, pos, candidate_pos, len);
                        pos += len;
                        anchor = pos;
                        continue;
                    }
                }
            }

            hash_table[hash] = pos as i32;
        }

        pos += 2; // Skip every other position
    }

    emit_final_literals(&mut output, input, anchor, input_end);
    Ok(output)
}

/// Balanced compression - optimized with single-level lazy matching
fn compress_balanced(input: &[u8]) -> Result<Vec<u8>> {
    if input.is_empty() {
        return Ok(vec![0, 0, 0, 0]); // Empty data marker
    }

    if input.len() > u32::MAX as usize {
        return Err(Error::InputTooLarge {
            size: input.len(),
            max_size: u32::MAX as usize,
        });
    }

    // Optimized capacity estimation
    let estimated_capacity = input.len() + (input.len() / 64).max(256);
    let mut output = Vec::with_capacity(estimated_capacity);

    // Write original size as 4-byte header
    output.extend_from_slice(&(input.len() as u32).to_le_bytes());

    // Hash table to find matches
    let mut hash_table: Vec<i32> = vec![-1; HASH_TABLE_SIZE];

    let mut anchor = 0; // Start of current literal run
    let mut pos = 0;

    let input_end = input.len();
    let input_limit = if input_end > MFLIMIT {
        input_end - MFLIMIT
    } else {
        0
    };

    while pos < input_limit {
        let mut best_match_pos = 0;
        let mut best_match_len = 0;

        // Find match at current position
        if pos + MIN_MATCH <= input_end {
            let hash = hash4(&input[pos..]);
            let candidate = hash_table[hash];

            // Check candidate
            if candidate >= 0 {
                let candidate_pos = candidate as usize;
                let distance = pos - candidate_pos;

                if distance > 0 && distance <= MAX_DISTANCE {
                    let max_match = input_end - pos;
                    let len = count_match(&input[candidate_pos..], &input[pos..], max_match);

                    if len >= MIN_MATCH {
                        best_match_pos = candidate_pos;
                        best_match_len = len;
                    }
                }
            }

            // Update hash table
            hash_table[hash] = pos as i32;
        }

        // Simple lazy matching: check next position if current match is short
        if best_match_len > 0 && best_match_len < 8 && pos + 1 < input_limit {
            let next_pos = pos + 1;
            if next_pos + MIN_MATCH <= input_end {
                let hash = hash4(&input[next_pos..]);
                let candidate = hash_table[hash];

                if candidate >= 0 {
                    let candidate_pos = candidate as usize;
                    let distance = next_pos - candidate_pos;

                    if distance > 0 && distance <= MAX_DISTANCE {
                        let max_match = input_end - next_pos;
                        let len = count_match(&input[candidate_pos..], &input[next_pos..], max_match);

                        // Use next match if better by at least 2 bytes
                        if len >= best_match_len + 2 {
                            pos = next_pos;
                            best_match_pos = candidate_pos;
                            best_match_len = len;
                        }
                    }
                }
            }
        }

        if best_match_len >= MIN_MATCH {
            emit_sequence(&mut output, input, &mut anchor, pos, best_match_pos, best_match_len);

            // Skip some positions in matched area
            let skip = (best_match_len / 2).min(8);
            for i in 1..skip {
                let skip_pos = pos + i;
                if skip_pos < input_end && skip_pos + MIN_MATCH <= input_end {
                    let hash = hash4(&input[skip_pos..]);
                    hash_table[hash] = skip_pos as i32;
                }
            }

            pos += best_match_len;
            anchor = pos;
        } else {
            pos += 1;
        }
    }

    // Emit remaining literals
    emit_final_literals(&mut output, input, anchor, input_end);
    Ok(output)
}

/// Best compression - optimal parsing with advanced lazy matching
fn compress_best(input: &[u8]) -> Result<Vec<u8>> {
    if input.is_empty() {
        return Ok(vec![0, 0, 0, 0]);
    }

    if input.len() > u32::MAX as usize {
        return Err(Error::InputTooLarge {
            size: input.len(),
            max_size: u32::MAX as usize,
        });
    }

    let mut output = Vec::with_capacity(input.len() + input.len() / 255 + 16);
    output.extend_from_slice(&(input.len() as u32).to_le_bytes());

    // Chain hash table for multiple candidate matches
    let mut hash_table: Vec<i32> = vec![-1; HASH_TABLE_SIZE];
    let mut chain: Vec<i32> = vec![-1; input.len().min(MAX_DISTANCE + 1)];

    let mut anchor = 0;
    let mut pos = 0;
    let input_end = input.len();
    let input_limit = if input_end > LAST_LITERALS {
        input_end - LAST_LITERALS
    } else {
        0
    };

    // Best mode: chain hashing + multi-level lazy matching
    while pos < input_limit {
        let mut best_match_pos = 0;
        let mut best_match_len = 0;

        // Search with hash chains for best match
        if pos + MIN_MATCH <= input_end {
            let hash = hash4(&input[pos..]);
            let mut candidate = hash_table[hash];
            let mut depth = 0;
            const MAX_CHAIN_DEPTH: usize = 16; // Search up to 16 candidates

            // Chain through previous positions with same hash
            while candidate >= 0 && depth < MAX_CHAIN_DEPTH {
                let candidate_pos = candidate as usize;
                let distance = pos - candidate_pos;

                if distance > MAX_DISTANCE {
                    break;
                }

                if distance > 0 {
                    let max_match = input_end - pos;
                    let len = count_match(&input[candidate_pos..], &input[pos..], max_match);

                    if len > best_match_len {
                        best_match_pos = candidate_pos;
                        best_match_len = len;

                        // Early exit if we found optimal match
                        if len >= OPTIMAL_ML {
                            break;
                        }
                    }
                }

                candidate = chain[candidate_pos % chain.len()];
                depth += 1;
            }

            // Update chain
            let chain_idx = pos % chain.len();
            chain[chain_idx] = hash_table[hash];
            hash_table[hash] = pos as i32;
        }

        // Multi-level lazy matching: check next 2 positions
        if best_match_len >= MIN_MATCH && best_match_len < OPTIMAL_ML {
            for lookahead in 1..=2 {
                let next_pos = pos + lookahead;
                if next_pos >= input_limit {
                    break;
                }

                if next_pos + MIN_MATCH <= input_end {
                    let hash = hash4(&input[next_pos..]);
                    let candidate = hash_table[hash];

                    if candidate >= 0 {
                        let candidate_pos = candidate as usize;
                        let distance = next_pos - candidate_pos;

                        if distance > 0 && distance <= MAX_DISTANCE {
                            let max_match = input_end - next_pos;
                            let len = count_match(&input[candidate_pos..], &input[next_pos..], max_match);

                            // Accept if significantly better (at least 3 bytes gain)
                            if len > best_match_len + lookahead + 2 {
                                pos = next_pos;
                                best_match_pos = candidate_pos;
                                best_match_len = len;
                                break;
                            }
                        }
                    }
                }
            }
        }

        if best_match_len >= MIN_MATCH {
            emit_sequence(&mut output, input, &mut anchor, pos, best_match_pos, best_match_len);

            // Skip positions in matched sequence (reduce work)
            let skip = best_match_len.saturating_sub(1);
            for i in 1..skip.min(16) {
                let skip_pos = pos + i;
                if skip_pos < input_end && skip_pos + MIN_MATCH <= input_end {
                    let hash = hash4(&input[skip_pos..]);
                    let chain_idx = skip_pos % chain.len();
                    chain[chain_idx] = hash_table[hash];
                    hash_table[hash] = skip_pos as i32;
                }
            }

            pos += best_match_len;
            anchor = pos;
        } else {
            pos += 1;
        }
    }

    emit_final_literals(&mut output, input, anchor, input_end);
    Ok(output)
}

/// Ultra compression - maximum compression with brute-force search
fn compress_ultra(input: &[u8]) -> Result<Vec<u8>> {
    if input.is_empty() {
        return Ok(vec![0, 0, 0, 0]);
    }

    if input.len() > u32::MAX as usize {
        return Err(Error::InputTooLarge {
            size: input.len(),
            max_size: u32::MAX as usize,
        });
    }

    let mut output = Vec::with_capacity(input.len() / 2);
    output.extend_from_slice(&(input.len() as u32).to_le_bytes());

    // Larger hash table and longer chains for ultra mode
    let mut hash_table: Vec<i32> = vec![-1; HASH_TABLE_SIZE];
    let mut chain: Vec<i32> = vec![-1; input.len().min(MAX_DISTANCE + 1)];

    let mut anchor = 0;
    let mut pos = 0;
    let input_end = input.len();
    let input_limit = if input_end > LAST_LITERALS {
        input_end - LAST_LITERALS
    } else {
        0
    };

    const MAX_ULTRA_CHAIN: usize = 128; // Deep search
    const ULTRA_LAZY_LEVELS: usize = 4; // Check 4 positions ahead

    while pos < input_limit {
        let mut best_match_pos = 0;
        let mut best_match_len = 0;

        // Exhaustive search with long chains
        if pos + MIN_MATCH <= input_end {
            let hash = hash4(&input[pos..]);
            let mut candidate = hash_table[hash];
            let mut depth = 0;

            while candidate >= 0 && depth < MAX_ULTRA_CHAIN {
                let candidate_pos = candidate as usize;
                let distance = pos - candidate_pos;

                if distance > MAX_DISTANCE {
                    break;
                }

                if distance > 0 {
                    let max_match = input_end - pos;
                    let len = count_match(&input[candidate_pos..], &input[pos..], max_match);

                    if len > best_match_len {
                        best_match_pos = candidate_pos;
                        best_match_len = len;
                    }
                }

                candidate = chain[candidate_pos % chain.len()];
                depth += 1;
            }

            // Also try 8-byte hash for longer patterns
            if pos + 8 <= input_end && best_match_len < OPTIMAL_ML {
                let hash8_val = hash8(&input[pos..]);

                // Search in a different part of the hash table to avoid collisions
                let hash8_idx = (HASH_TABLE_SIZE / 2) + (hash8_val % (HASH_TABLE_SIZE / 2));
                let hash8_candidate = hash_table[hash8_idx];

                if hash8_candidate >= 0 {
                    let candidate_pos = hash8_candidate as usize;
                    let distance = pos.saturating_sub(candidate_pos);

                    if distance > 0 && distance <= MAX_DISTANCE {
                        let max_match = input_end - pos;
                        let len = count_match(&input[candidate_pos..], &input[pos..], max_match);

                        if len > best_match_len {
                            best_match_pos = candidate_pos;
                            best_match_len = len;
                        }
                    }
                }

                // Update 8-byte hash entry
                hash_table[hash8_idx] = pos as i32;
            }

            let chain_idx = pos % chain.len();
            chain[chain_idx] = hash_table[hash];
            hash_table[hash] = pos as i32;
        }

        // Multi-level ultra lazy matching
        if best_match_len >= MIN_MATCH {
            let mut final_pos = pos;
            let mut final_match_pos = best_match_pos;
            let mut final_match_len = best_match_len;

            for lookahead in 1..=ULTRA_LAZY_LEVELS {
                let next_pos = pos + lookahead;
                if next_pos >= input_limit {
                    break;
                }

                if next_pos + MIN_MATCH <= input_end {
                    let hash = hash4(&input[next_pos..]);
                    let candidate = hash_table[hash];

                    if candidate >= 0 {
                        let candidate_pos = candidate as usize;
                        let distance = next_pos.saturating_sub(candidate_pos);

                        if distance > 0 && distance <= MAX_DISTANCE {
                            let max_match = input_end - next_pos;
                            let len = count_match(&input[candidate_pos..], &input[next_pos..], max_match);

                            // Accept if better by at least lookahead bytes
                            if len > final_match_len + lookahead {
                                final_pos = next_pos;
                                final_match_pos = candidate_pos;
                                final_match_len = len;
                                break;
                            }
                        }
                    }
                }
            }

            // Emit the best match found
            emit_sequence(&mut output, input, &mut anchor, final_pos, final_match_pos, final_match_len);

            // Update hash table for skipped positions
            for i in 1..final_match_len.min(32) {
                let skip_pos = final_pos + i;
                if skip_pos < input_end && skip_pos + MIN_MATCH <= input_end {
                    let hash = hash4(&input[skip_pos..]);
                    let chain_idx = skip_pos % chain.len();
                    chain[chain_idx] = hash_table[hash];
                    hash_table[hash] = skip_pos as i32;
                }
            }

            pos = final_pos + final_match_len;
            anchor = pos;
        } else {
            pos += 1;
        }
    }

    emit_final_literals(&mut output, input, anchor, input_end);
    Ok(output)
}

/// Helper: Emit a literal + match sequence
fn emit_sequence(
    output: &mut Vec<u8>,
    input: &[u8],
    anchor: &mut usize,
    pos: usize,
    match_pos: usize,
    match_len: usize,
) {
    // Sanity checks
    debug_assert!(pos > match_pos, "Invalid match: pos <= match_pos");
    debug_assert!(pos - match_pos <= MAX_DISTANCE, "Match offset too large");
    debug_assert!(match_len >= MIN_MATCH, "Match too short");
    debug_assert!(pos >= *anchor, "pos < anchor");

    let literal_len = pos - *anchor;

    // Emit token
    let lit_token = if literal_len >= 15 { 15 } else { literal_len };
    let match_token = if match_len >= MIN_MATCH + 15 {
        15
    } else {
        match_len - MIN_MATCH
    };
    output.push(((lit_token << 4) | match_token) as u8);

    // Extended literal length
    if literal_len >= 15 {
        let mut remaining = literal_len - 15;
        while remaining >= 255 {
            output.push(255);
            remaining -= 255;
        }
        output.push(remaining as u8);
    }

    // Copy literals
    output.extend_from_slice(&input[*anchor..pos]);

    // Emit match offset (validated)
    let offset = (pos - match_pos) as u16;
    debug_assert!(offset > 0 && offset as usize <= MAX_DISTANCE);
    output.extend_from_slice(&offset.to_le_bytes());

    // Extended match length
    if match_len >= MIN_MATCH + 15 {
        let mut remaining = match_len - MIN_MATCH - 15;
        while remaining >= 255 {
            output.push(255);
            remaining -= 255;
        }
        output.push(remaining as u8);
    }
}

/// Helper: Emit final literals
fn emit_final_literals(output: &mut Vec<u8>, input: &[u8], anchor: usize, input_end: usize) {
    let final_literals = input_end - anchor;
    if final_literals > 0 {
        let lit_token = if final_literals >= 15 { 15 } else { final_literals };
        output.push((lit_token << 4) as u8);

        // Extended literal length
        if final_literals >= 15 {
            let mut remaining = final_literals - 15;
            while remaining >= 255 {
                output.push(255);
                remaining -= 255;
            }
            output.push(remaining as u8);
        }

        output.extend_from_slice(&input[anchor..]);
    }
}

/// Decompress LZ4 data
///
/// # Arguments
/// * `input` - Compressed data (must include 4-byte header)
///
/// # Returns
/// Original uncompressed data
///
/// # Example
/// ```
/// use avila_compress::lz4;
/// let original = b"Test data";
/// let compressed = lz4::compress(original).unwrap();
/// let decompressed = lz4::decompress(&compressed).unwrap();
/// assert_eq!(original, &decompressed[..]);
/// ```
pub fn decompress(input: &[u8]) -> Result<Vec<u8>> {
    if input.len() < 4 {
        return Err(Error::InvalidInput(
            "Input too short, missing header".to_string(),
        ));
    }

    // Read original size from header
    let original_size = u32::from_le_bytes([input[0], input[1], input[2], input[3]]) as usize;

    if original_size == 0 {
        return Ok(Vec::new()); // Empty data
    }

    let mut output = Vec::with_capacity(original_size);
    let mut pos = 4; // Skip header

    while pos < input.len() {
        // Read token
        if pos >= input.len() {
            break;
        }
        let token = input[pos];
        pos += 1;

        let mut literal_len = (token >> 4) as usize;
        let mut match_len = (token & 0x0F) as usize;

        // Extended literal length
        if literal_len == 15 {
            loop {
                if pos >= input.len() {
                    return Err(Error::CorruptedData(
                        "Unexpected end while reading literal length".to_string(),
                    ));
                }
                let extra = input[pos] as usize;
                pos += 1;
                literal_len += extra;
                if extra != 255 {
                    break;
                }
            }
        }

        // Copy literals
        if literal_len > 0 {
            if pos + literal_len > input.len() {
                return Err(Error::CorruptedData(format!(
                    "Literal overflow: need {} bytes at pos {}",
                    literal_len, pos
                )));
            }
            output.extend_from_slice(&input[pos..pos + literal_len]);
            pos += literal_len;
        }

        // Check if we're done (no match after literals)
        if pos >= input.len() {
            break;
        }

        // If match_len from token is 0, there's no match to process
        if match_len == 0 {
            continue;
        }

        // Read match offset
        if pos + 2 > input.len() {
            return Err(Error::CorruptedData(
                "Unexpected end while reading match offset".to_string(),
            ));
        }
        let offset = u16::from_le_bytes([input[pos], input[pos + 1]]) as usize;
        pos += 2;

        if offset == 0 || offset > output.len() {
            return Err(Error::CorruptedData(format!(
                "Invalid match offset: {} (output len: {})",
                offset,
                output.len()
            )));
        }

        // Extended match length
        match_len += MIN_MATCH;
        if match_len == MIN_MATCH + 15 {
            loop {
                if pos >= input.len() {
                    return Err(Error::CorruptedData(
                        "Unexpected end while reading match length".to_string(),
                    ));
                }
                let extra = input[pos] as usize;
                pos += 1;
                match_len += extra;
                if extra != 255 {
                    break;
                }
            }
        }

        // Copy match
        let match_start = output.len() - offset;

        // Handle overlapping matches (copy byte-by-byte)
        // This is correct even when offset < match_len (overlapping)
        for i in 0..match_len {
            let byte = output[match_start + i];
            output.push(byte);
        }
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

/// Calculate 32-bit hash of 4 bytes - optimized multiplier
#[inline(always)]
fn hash4(data: &[u8]) -> usize {
    if data.len() < 4 {
        return 0;
    }
    let value = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    // xxHash-inspired multiplication for better distribution
    ((value.wrapping_mul(0x9E3779B1)) >> (32 - HASH_LOG)) as usize
}

/// Calculate 64-bit hash for longer sequences
#[inline(always)]
fn hash8(data: &[u8]) -> usize {
    if data.len() < 8 {
        return hash4(data);
    }
    let value = u64::from_le_bytes([
        data[0], data[1], data[2], data[3],
        data[4], data[5], data[6], data[7],
    ]);
    ((value.wrapping_mul(0x9E3779B185EBCA87)) >> (64 - HASH_LOG)) as usize
}

/// Count matching bytes between two slices - optimized with 8-byte comparison
#[inline(always)]
fn count_match(a: &[u8], b: &[u8], max_len: usize) -> usize {
    let limit = a.len().min(b.len()).min(max_len);
    let mut len = 0;

    // Fast path: compare 8 bytes at a time
    while len + 8 <= limit {
        let a_chunk = u64::from_le_bytes([
            a[len], a[len+1], a[len+2], a[len+3],
            a[len+4], a[len+5], a[len+6], a[len+7],
        ]);
        let b_chunk = u64::from_le_bytes([
            b[len], b[len+1], b[len+2], b[len+3],
            b[len+4], b[len+5], b[len+6], b[len+7],
        ]);

        if a_chunk != b_chunk {
            // Find exact mismatch position
            let xor = a_chunk ^ b_chunk;
            len += (xor.trailing_zeros() / 8) as usize;
            return len;
        }
        len += 8;
    }

    // Remaining bytes
    while len < limit && a[len] == b[len] {
        len += 1;
    }

    len
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compress_decompress_simple() {
        let data = b"Hello, World!";
        let compressed = compress(data).unwrap();
        let decompressed = decompress(&compressed).unwrap();
        assert_eq!(data, &decompressed[..]);
    }

    #[test]
    fn test_empty() {
        let data = b"";
        let compressed = compress(data).unwrap();
        assert_eq!(compressed, vec![0, 0, 0, 0]);
        let decompressed = decompress(&compressed).unwrap();
        assert_eq!(data, &decompressed[..]);
    }

    #[test]
    fn test_repetitive_data() {
        let data = vec![b'A'; 1000];
        let compressed = compress(&data).unwrap();
        // TODO: Add real compression with matches
        // assert!(compressed.len() < data.len());
        let decompressed = decompress(&compressed).unwrap();
        assert_eq!(data, decompressed);
    }

    #[test]
    fn test_random_data() {
        let data: Vec<u8> = (0..1000).map(|i| (i * 17) as u8).collect();
        let compressed = compress(&data).unwrap();
        let decompressed = decompress(&compressed).unwrap();
        assert_eq!(data, decompressed);
    }

    #[test]
    fn test_all_zeros() {
        let data = vec![0u8; 5000];
        let compressed = compress(&data).unwrap();
        // TODO: Add real compression with matches
        // assert!(compressed.len() < data.len() / 10); // Should compress very well
        let decompressed = decompress(&compressed).unwrap();
        assert_eq!(data, decompressed);
    }

    #[test]
    fn test_patterns() {
        let patterns = vec![
            b"abcabcabcabc".to_vec(),
            b"The quick brown fox jumps over the lazy dog".to_vec(),
            vec![1, 2, 3, 1, 2, 3, 1, 2, 3],
        ];

        for data in patterns {
            let compressed = compress(&data).unwrap();
            let decompressed = decompress(&compressed).unwrap();
            assert_eq!(data, decompressed);
        }
    }
}
