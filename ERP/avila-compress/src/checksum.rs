//! Checksums for data integrity verification
//!
//! This module provides fast non-cryptographic checksums for verifying
//! data integrity after compression/decompression.
//!
//! ## Available Checksums
//! - **XXHash64**: Ultra-fast (20+ GB/s), 64-bit hash
//! - **CRC32**: Classic checksum, good error detection
//!
//! ## Example
//! ```rust
//! use avila_compress::checksum;
//!
//! let data = b"Hello, World!";
//! let hash = checksum::xxhash64(data, 0);
//! println!("XXHash64: 0x{:016x}", hash);
//!
//! let crc = checksum::crc32(data);
//! println!("CRC32: 0x{:08x}", crc);
//! ```

/// XXHash64 implementation - ultra-fast 64-bit hash
///
/// XXHash is extremely fast (20+ GB/s) and provides good distribution.
/// Perfect for checksums and hash tables.
///
/// # Arguments
/// * `data` - Input data to hash
/// * `seed` - Seed value (use 0 for default)
///
/// # Returns
/// 64-bit hash value
///
/// # Example
/// ```rust
/// use avila_compress::checksum;
///
/// let data = b"test data";
/// let hash1 = checksum::xxhash64(data, 0);
/// let hash2 = checksum::xxhash64(data, 0);
/// assert_eq!(hash1, hash2); // Same input = same hash
/// ```
pub fn xxhash64(data: &[u8], seed: u64) -> u64 {
    const PRIME1: u64 = 11400714785074694791;
    const PRIME2: u64 = 14029467366897019727;
    const PRIME3: u64 = 1609587929392839161;
    const PRIME5: u64 = 2870177450012600261;

    let len = data.len();
    let mut h64: u64;

    if len >= 32 {
        let mut v1 = seed.wrapping_add(PRIME1).wrapping_add(PRIME2);
        let mut v2 = seed.wrapping_add(PRIME2);
        let mut v3 = seed;
        let mut v4 = seed.wrapping_sub(PRIME1);

        let mut pos = 0;
        while pos + 32 <= len {
            v1 = round(v1, read_u64_le(&data[pos..]));
            v2 = round(v2, read_u64_le(&data[pos + 8..]));
            v3 = round(v3, read_u64_le(&data[pos + 16..]));
            v4 = round(v4, read_u64_le(&data[pos + 24..]));
            pos += 32;
        }

        h64 = v1.rotate_left(1)
            .wrapping_add(v2.rotate_left(7))
            .wrapping_add(v3.rotate_left(12))
            .wrapping_add(v4.rotate_left(18));

        h64 = merge_round(h64, v1);
        h64 = merge_round(h64, v2);
        h64 = merge_round(h64, v3);
        h64 = merge_round(h64, v4);

        h64 = h64.wrapping_add(len as u64);

        // Process remaining bytes
        let remaining = &data[pos..];
        h64 = finalize(h64, remaining);
    } else {
        h64 = seed.wrapping_add(PRIME5);
        h64 = h64.wrapping_add(len as u64);
        h64 = finalize(h64, data);
    }

    // Final mix
    h64 ^= h64 >> 33;
    h64 = h64.wrapping_mul(PRIME2);
    h64 ^= h64 >> 29;
    h64 = h64.wrapping_mul(PRIME3);
    h64 ^= h64 >> 32;

    h64
}

#[inline]
fn round(acc: u64, input: u64) -> u64 {
    const PRIME1: u64 = 11400714785074694791;
    const PRIME2: u64 = 14029467366897019727;

    let acc = acc.wrapping_add(input.wrapping_mul(PRIME2));
    acc.rotate_left(31).wrapping_mul(PRIME1)
}

#[inline]
fn merge_round(acc: u64, val: u64) -> u64 {
    const PRIME1: u64 = 11400714785074694791;
    const PRIME2: u64 = 14029467366897019727;

    let val = round(0, val);
    let acc = acc ^ val;
    acc.wrapping_mul(PRIME1).wrapping_add(PRIME2.wrapping_mul(2))
}

#[inline]
fn finalize(mut h64: u64, data: &[u8]) -> u64 {
    const PRIME1: u64 = 11400714785074694791;
    const PRIME2: u64 = 14029467366897019727;
    const PRIME3: u64 = 1609587929392839161;
    const PRIME5: u64 = 2870177450012600261;

    let mut pos = 0;
    let len = data.len();

    while pos + 8 <= len {
        let k1 = round(0, read_u64_le(&data[pos..]));
        h64 ^= k1;
        h64 = h64.rotate_left(27).wrapping_mul(PRIME1).wrapping_add(PRIME2.wrapping_mul(2));
        pos += 8;
    }

    if pos + 4 <= len {
        let k1 = read_u32_le(&data[pos..]) as u64;
        h64 ^= k1.wrapping_mul(PRIME1);
        h64 = h64.rotate_left(23).wrapping_mul(PRIME2).wrapping_add(PRIME3);
        pos += 4;
    }

    while pos < len {
        let k1 = data[pos] as u64;
        h64 ^= k1.wrapping_mul(PRIME5);
        h64 = h64.rotate_left(11).wrapping_mul(PRIME1);
        pos += 1;
    }

    h64
}

#[inline]
fn read_u64_le(data: &[u8]) -> u64 {
    u64::from_le_bytes([
        data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7],
    ])
}

#[inline]
fn read_u32_le(data: &[u8]) -> u32 {
    u32::from_le_bytes([data[0], data[1], data[2], data[3]])
}

/// CRC32 checksum implementation
///
/// Classic CRC32 with IEEE polynomial (0xEDB88320).
/// Widely used for error detection.
///
/// # Arguments
/// * `data` - Input data to checksum
///
/// # Returns
/// 32-bit CRC value
///
/// # Example
/// ```rust
/// use avila_compress::checksum;
///
/// let data = b"test";
/// let crc = checksum::crc32(data);
/// assert_eq!(crc, 0xD87F7E0C);
/// ```
pub fn crc32(data: &[u8]) -> u32 {
    crc32_with_init(data, 0xFFFFFFFF) ^ 0xFFFFFFFF
}

/// CRC32 with custom initial value
pub fn crc32_with_init(data: &[u8], init: u32) -> u32 {
    let mut crc = init;

    for &byte in data {
        crc = CRC32_TABLE[((crc ^ byte as u32) & 0xFF) as usize] ^ (crc >> 8);
    }

    crc
}

/// CRC32 lookup table (IEEE polynomial)
const CRC32_TABLE: [u32; 256] = generate_crc32_table();

const fn generate_crc32_table() -> [u32; 256] {
    let mut table = [0u32; 256];
    let mut i = 0;

    while i < 256 {
        let mut crc = i as u32;
        let mut j = 0;

        while j < 8 {
            if crc & 1 != 0 {
                crc = (crc >> 1) ^ 0xEDB88320;
            } else {
                crc >>= 1;
            }
            j += 1;
        }

        table[i] = crc;
        i += 1;
    }

    table
}

/// Verify data integrity using checksum
///
/// # Arguments
/// * `data` - Data to verify
/// * `expected` - Expected checksum value
///
/// # Returns
/// `true` if checksum matches, `false` otherwise
///
/// # Example
/// ```rust
/// use avila_compress::checksum;
///
/// let data = b"important data";
/// let hash = checksum::xxhash64(data, 0);
///
/// // Later, verify integrity
/// assert!(checksum::verify_xxhash64(data, hash));
/// ```
pub fn verify_xxhash64(data: &[u8], expected: u64) -> bool {
    xxhash64(data, 0) == expected
}

/// Verify CRC32 checksum
pub fn verify_crc32(data: &[u8], expected: u32) -> bool {
    crc32(data) == expected
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xxhash64_empty() {
        let hash = xxhash64(b"", 0);
        assert_eq!(hash, 0xef46db3751d8e999);
    }

    #[test]
    fn test_xxhash64_simple() {
        let hash = xxhash64(b"Hello, World!", 0);
        assert_ne!(hash, 0); // Should produce non-zero hash
    }

    #[test]
    fn test_xxhash64_deterministic() {
        let data = b"test data";
        let hash1 = xxhash64(data, 0);
        let hash2 = xxhash64(data, 0);
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_xxhash64_different_seeds() {
        let data = b"test";
        let hash1 = xxhash64(data, 0);
        let hash2 = xxhash64(data, 1);
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_xxhash64_large() {
        let data = vec![b'A'; 10000];
        let hash = xxhash64(&data, 0);
        assert_ne!(hash, 0);

        // Verify
        assert!(verify_xxhash64(&data, hash));
    }

    #[test]
    fn test_crc32_empty() {
        let crc = crc32(b"");
        assert_eq!(crc, 0);
    }

    #[test]
    fn test_crc32_known_values() {
        // Known test vectors
        assert_eq!(crc32(b"123456789"), 0xCBF43926);
        assert_eq!(crc32(b"test"), 0xD87F7E0C);
    }

    #[test]
    fn test_crc32_deterministic() {
        let data = b"some data";
        let crc1 = crc32(data);
        let crc2 = crc32(data);
        assert_eq!(crc1, crc2);
    }

    #[test]
    fn test_crc32_different_data() {
        let crc1 = crc32(b"data1");
        let crc2 = crc32(b"data2");
        assert_ne!(crc1, crc2);
    }

    #[test]
    fn test_verify_functions() {
        let data = b"verify this";

        let xxhash = xxhash64(data, 0);
        assert!(verify_xxhash64(data, xxhash));
        assert!(!verify_xxhash64(b"wrong data", xxhash));

        let crc = crc32(data);
        assert!(verify_crc32(data, crc));
        assert!(!verify_crc32(b"wrong data", crc));
    }
}
