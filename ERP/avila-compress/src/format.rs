// avila-compress v0.8.0: .avz file format
// Structured format with metadata and integrity checking

use crate::error::{Error, Result};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;

/// Magic bytes identifying .avz files: "AVZF"
const MAGIC: [u8; 4] = [b'A', b'V', b'Z', b'F'];

/// Current format version
const VERSION: u16 = 1;

/// Compression algorithm used
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Algorithm {
    /// LZ4 Fast compression
    Lz4Fast = 1,
    /// LZ4 Normal compression
    Lz4Normal = 2,
    /// LZ4 Best compression
    Lz4Best = 3,
    /// Uncompressed (store only)
    None = 0,
}

impl Algorithm {
    fn from_u8(value: u8) -> Result<Self> {
        match value {
            0 => Ok(Algorithm::None),
            1 => Ok(Algorithm::Lz4Fast),
            2 => Ok(Algorithm::Lz4Normal),
            3 => Ok(Algorithm::Lz4Best),
            _ => Err(Error::InvalidInput("IO error".to_string())),
        }
    }
}

/// A compressed block with metadata
#[derive(Debug, Clone)]
pub struct Block {
    /// Uncompressed size
    pub uncompressed_size: u32,
    /// Compressed size
    pub compressed_size: u32,
    /// xxHash64 checksum of uncompressed data
    pub checksum: u64,
    /// Compressed data
    pub data: Vec<u8>,
}

/// .avz file format structure
#[derive(Debug, Clone)]
pub struct AvzFormat {
    /// Magic bytes "AVZF"
    pub magic: [u8; 4],
    /// Format version
    pub version: u16,
    /// Compression algorithm
    pub algorithm: Algorithm,
    /// Total uncompressed size
    pub uncompressed_size: u64,
    /// Total compressed size
    pub compressed_size: u64,
    /// xxHash64 checksum of entire uncompressed data
    pub checksum: u64,
    /// User-defined metadata
    pub metadata: HashMap<String, String>,
    /// Compressed blocks
    pub blocks: Vec<Block>,
}

impl AvzFormat {
    /// Create new .avz format from uncompressed data
    pub fn new(data: &[u8], algorithm: Algorithm, metadata: HashMap<String, String>) -> Result<Self> {
        // Calculate checksum
        let checksum = xxhash64(data);

        // Split into blocks (64KB each)
        const BLOCK_SIZE: usize = 64 * 1024;
        let mut blocks = Vec::new();
        let mut total_compressed = 0u64;

        for chunk in data.chunks(BLOCK_SIZE) {
            let compressed = match algorithm {
                Algorithm::Lz4Fast | Algorithm::Lz4Normal | Algorithm::Lz4Best => {
                    crate::lz4::compress(chunk)?
                }
                Algorithm::None => chunk.to_vec(),
            };

            let block = Block {
                uncompressed_size: chunk.len() as u32,
                compressed_size: compressed.len() as u32,
                checksum: xxhash64(chunk),
                data: compressed,
            };

            total_compressed += block.compressed_size as u64;
            blocks.push(block);
        }

        Ok(AvzFormat {
            magic: MAGIC,
            version: VERSION,
            algorithm,
            uncompressed_size: data.len() as u64,
            compressed_size: total_compressed,
            checksum,
            metadata,
            blocks,
        })
    }

    /// Write .avz file to disk
    pub fn write_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let mut file = std::fs::File::create(path)
            .map_err(|_| Error::InvalidInput("IO error".to_string()))?;

        self.write(&mut file)
    }

    /// Write .avz format to writer
    pub fn write<W: Write>(&self, writer: &mut W) -> Result<()> {
        // Header
        writer.write_all(&self.magic).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        writer.write_all(&self.version.to_le_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        writer.write_all(&[self.algorithm as u8]).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        writer.write_all(&self.uncompressed_size.to_le_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        writer.write_all(&self.compressed_size.to_le_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        writer.write_all(&self.checksum.to_le_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;

        // Metadata
        let metadata_count = self.metadata.len() as u32;
        writer.write_all(&metadata_count.to_le_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;

        for (key, value) in &self.metadata {
            let key_len = key.len() as u32;
            let value_len = value.len() as u32;

            writer.write_all(&key_len.to_le_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            writer.write_all(key.as_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            writer.write_all(&value_len.to_le_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            writer.write_all(value.as_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        }

        // Blocks
        let block_count = self.blocks.len() as u32;
        writer.write_all(&block_count.to_le_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;

        for block in &self.blocks {
            writer.write_all(&block.uncompressed_size.to_le_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            writer.write_all(&block.compressed_size.to_le_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            writer.write_all(&block.checksum.to_le_bytes()).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            writer.write_all(&block.data).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        }

        Ok(())
    }

    /// Read .avz file from disk
    pub fn read_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let mut file = std::fs::File::open(path)
            .map_err(|_| Error::InvalidInput("IO error".to_string()))?;

        Self::read(&mut file)
    }

    /// Read .avz format from reader
    pub fn read<R: Read>(reader: &mut R) -> Result<Self> {
        // Header
        let mut magic = [0u8; 4];
        reader.read_exact(&mut magic).map_err(|_| Error::InvalidInput("IO error".to_string()))?;

        if magic != MAGIC {
            return Err(Error::InvalidInput("IO error".to_string()));
        }

        let mut version_bytes = [0u8; 2];
        reader.read_exact(&mut version_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        let version = u16::from_le_bytes(version_bytes);

        if version != VERSION {
            return Err(Error::InvalidInput("IO error".to_string()));
        }

        let mut algorithm_byte = [0u8; 1];
        reader.read_exact(&mut algorithm_byte).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        let algorithm = Algorithm::from_u8(algorithm_byte[0])?;

        let mut uncompressed_size_bytes = [0u8; 8];
        reader.read_exact(&mut uncompressed_size_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        let uncompressed_size = u64::from_le_bytes(uncompressed_size_bytes);

        let mut compressed_size_bytes = [0u8; 8];
        reader.read_exact(&mut compressed_size_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        let compressed_size = u64::from_le_bytes(compressed_size_bytes);

        let mut checksum_bytes = [0u8; 8];
        reader.read_exact(&mut checksum_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        let checksum = u64::from_le_bytes(checksum_bytes);

        // Metadata
        let mut metadata_count_bytes = [0u8; 4];
        reader.read_exact(&mut metadata_count_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        let metadata_count = u32::from_le_bytes(metadata_count_bytes);

        let mut metadata = HashMap::new();
        for _ in 0..metadata_count {
            let mut key_len_bytes = [0u8; 4];
            reader.read_exact(&mut key_len_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            let key_len = u32::from_le_bytes(key_len_bytes) as usize;

            let mut key_bytes = vec![0u8; key_len];
            reader.read_exact(&mut key_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            let key = String::from_utf8(key_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;

            let mut value_len_bytes = [0u8; 4];
            reader.read_exact(&mut value_len_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            let value_len = u32::from_le_bytes(value_len_bytes) as usize;

            let mut value_bytes = vec![0u8; value_len];
            reader.read_exact(&mut value_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            let value = String::from_utf8(value_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;

            metadata.insert(key, value);
        }

        // Blocks
        let mut block_count_bytes = [0u8; 4];
        reader.read_exact(&mut block_count_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
        let block_count = u32::from_le_bytes(block_count_bytes);

        let mut blocks = Vec::with_capacity(block_count as usize);
        for _ in 0..block_count {
            let mut uncompressed_size_bytes = [0u8; 4];
            reader.read_exact(&mut uncompressed_size_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            let uncompressed_size = u32::from_le_bytes(uncompressed_size_bytes);

            let mut compressed_size_bytes = [0u8; 4];
            reader.read_exact(&mut compressed_size_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            let compressed_size = u32::from_le_bytes(compressed_size_bytes);

            let mut checksum_bytes = [0u8; 8];
            reader.read_exact(&mut checksum_bytes).map_err(|_| Error::InvalidInput("IO error".to_string()))?;
            let checksum = u64::from_le_bytes(checksum_bytes);

            let mut data = vec![0u8; compressed_size as usize];
            reader.read_exact(&mut data).map_err(|_| Error::InvalidInput("IO error".to_string()))?;

            blocks.push(Block {
                uncompressed_size,
                compressed_size,
                checksum,
                data,
            });
        }

        Ok(AvzFormat {
            magic,
            version,
            algorithm,
            uncompressed_size,
            compressed_size,
            checksum,
            metadata,
            blocks,
        })
    }

    /// Decompress all blocks and return data
    pub fn decompress(&self) -> Result<Vec<u8>> {
        let mut result = Vec::with_capacity(self.uncompressed_size as usize);

        for block in &self.blocks {
            let decompressed = match self.algorithm {
                Algorithm::Lz4Fast | Algorithm::Lz4Normal | Algorithm::Lz4Best => {
                    crate::lz4::decompress(&block.data)?
                }
                Algorithm::None => block.data.clone(),
            };

            // Verify block checksum
            let calculated_checksum = xxhash64(&decompressed);
            if calculated_checksum != block.checksum {
                return Err(Error::InvalidInput("IO error".to_string()));
            }

            result.extend_from_slice(&decompressed);
        }

        // Verify total checksum
        let calculated_checksum = xxhash64(&result);
        if calculated_checksum != self.checksum {
            return Err(Error::InvalidInput("IO error".to_string()));
        }

        Ok(result)
    }

    /// Get compression ratio
    pub fn compression_ratio(&self) -> f64 {
        self.compressed_size as f64 / self.uncompressed_size as f64
    }

    /// Get compression percentage
    pub fn compression_percentage(&self) -> f64 {
        (1.0 - self.compression_ratio()) * 100.0
    }
}

/// Fast non-cryptographic hash (xxHash64)
fn xxhash64(data: &[u8]) -> u64 {
    const PRIME1: u64 = 0x9E3779B185EBCA87;
    const PRIME2: u64 = 0xC2B2AE3D27D4EB4F;
    const PRIME3: u64 = 0x165667B19E3779F9;
    #[allow(dead_code)]
    const PRIME4: u64 = 0x85EBCA77C2B2AE63;
    const PRIME5: u64 = 0x27D4EB2F165667C5;

    let mut hash = PRIME5.wrapping_add(data.len() as u64);

    let mut i = 0;
    while i + 8 <= data.len() {
        let k = u64::from_le_bytes([
            data[i], data[i + 1], data[i + 2], data[i + 3],
            data[i + 4], data[i + 5], data[i + 6], data[i + 7],
        ]);
        hash ^= k.wrapping_mul(PRIME2);
        hash = hash.rotate_left(31).wrapping_mul(PRIME1);
        i += 8;
    }

    if i + 4 <= data.len() {
        let k = u32::from_le_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]) as u64;
        hash ^= k.wrapping_mul(PRIME1);
        hash = hash.rotate_left(23).wrapping_mul(PRIME2).wrapping_add(PRIME3);
        i += 4;
    }

    while i < data.len() {
        hash ^= (data[i] as u64).wrapping_mul(PRIME5);
        hash = hash.rotate_left(11).wrapping_mul(PRIME1);
        i += 1;
    }

    hash ^= hash >> 33;
    hash = hash.wrapping_mul(PRIME2);
    hash ^= hash >> 29;
    hash = hash.wrapping_mul(PRIME3);
    hash ^= hash >> 32;

    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xxhash64() {
        let data = b"Hello, World!";
        let hash = xxhash64(data);
        assert_ne!(hash, 0);

        // Same data produces same hash
        let hash2 = xxhash64(data);
        assert_eq!(hash, hash2);

        // Different data produces different hash
        let hash3 = xxhash64(b"Hello, Rust!");
        assert_ne!(hash, hash3);
    }

    #[test]
    fn test_algorithm_conversion() {
        assert_eq!(Algorithm::from_u8(0).unwrap(), Algorithm::None);
        assert_eq!(Algorithm::from_u8(1).unwrap(), Algorithm::Lz4Fast);
        assert_eq!(Algorithm::from_u8(2).unwrap(), Algorithm::Lz4Normal);
        assert_eq!(Algorithm::from_u8(3).unwrap(), Algorithm::Lz4Best);
        assert!(Algorithm::from_u8(99).is_err());
    }

    #[test]
    fn test_avz_format_basic() {
        let data = b"Hello, World! This is a test of the .avz format.";
        let mut metadata = HashMap::new();
        metadata.insert("author".to_string(), "test".to_string());
        metadata.insert("timestamp".to_string(), "2025-01-01".to_string());

        let avz = AvzFormat::new(data, Algorithm::Lz4Normal, metadata.clone()).unwrap();

        assert_eq!(avz.magic, MAGIC);
        assert_eq!(avz.version, VERSION);
        assert_eq!(avz.algorithm, Algorithm::Lz4Normal);
        assert_eq!(avz.uncompressed_size, data.len() as u64);
        assert_eq!(avz.metadata, metadata);
        assert!(avz.blocks.len() > 0);

        // Decompress
        let decompressed = avz.decompress().unwrap();
        assert_eq!(&decompressed, data);
    }

    #[test]
    fn test_avz_format_write_read() {
        let data = b"Test data for write/read cycle. This should compress well since it has repetition.";
        let mut metadata = HashMap::new();
        metadata.insert("test".to_string(), "value".to_string());

        let avz = AvzFormat::new(data, Algorithm::Lz4Normal, metadata).unwrap();

        // Write to buffer
        let mut buffer = Vec::new();
        avz.write(&mut buffer).unwrap();

        // Read back
        let mut cursor = std::io::Cursor::new(buffer);
        let avz2 = AvzFormat::read(&mut cursor).unwrap();

        assert_eq!(avz.magic, avz2.magic);
        assert_eq!(avz.version, avz2.version);
        assert_eq!(avz.algorithm, avz2.algorithm);
        assert_eq!(avz.uncompressed_size, avz2.uncompressed_size);
        assert_eq!(avz.compressed_size, avz2.compressed_size);
        assert_eq!(avz.checksum, avz2.checksum);
        assert_eq!(avz.metadata, avz2.metadata);

        // Decompress
        let decompressed = avz2.decompress().unwrap();
        assert_eq!(&decompressed, data);
    }

    #[test]
    fn test_avz_format_large_data() {
        // 200KB of data to test multiple blocks
        let data: Vec<u8> = (0..200_000).map(|i| (i % 256) as u8).collect();
        let metadata = HashMap::new();

        let avz = AvzFormat::new(&data, Algorithm::Lz4Normal, metadata).unwrap();

        // Should have multiple blocks (64KB each)
        assert!(avz.blocks.len() >= 3);

        // Decompress
        let decompressed = avz.decompress().unwrap();
        assert_eq!(decompressed, data);
    }

    #[test]
    fn test_compression_ratio() {
        let data = vec![b'A'; 10000]; // Highly compressible
        let metadata = HashMap::new();

        let avz = AvzFormat::new(&data, Algorithm::Lz4Normal, metadata).unwrap();

        // Should achieve good compression
        assert!(avz.compression_ratio() < 0.1);
        assert!(avz.compression_percentage() > 90.0);
    }

    #[test]
    fn test_checksum_validation() {
        let data = b"Test data";
        let metadata = HashMap::new();

        let mut avz = AvzFormat::new(data, Algorithm::Lz4Normal, metadata).unwrap();

        // Corrupt a block
        if let Some(block) = avz.blocks.first_mut() {
            block.data[0] ^= 0xFF;
        }

        // Decompression should fail due to checksum mismatch
        assert!(avz.decompress().is_err());
    }

    #[test]
    fn test_none_algorithm() {
        let data = b"Uncompressed data";
        let metadata = HashMap::new();

        let avz = AvzFormat::new(data, Algorithm::None, metadata).unwrap();

        // Should not compress
        assert_eq!(avz.compressed_size, avz.uncompressed_size);

        // Decompress
        let decompressed = avz.decompress().unwrap();
        assert_eq!(&decompressed, data);
    }
}


