// Example: .avz file format with metadata and integrity checking
// This demonstrates the v0.8.0 feature: structured file format

use avila_compress::AvzFormat;
use avila_compress::format::Algorithm;
use std::collections::HashMap;

fn main() {
    println!("=== .avz File Format Examples ===\n");

    // Example 1: Basic compression with metadata
    example_basic();

    // Example 2: Large file with multiple blocks
    example_large_file();

    // Example 3: Write and read from disk
    example_file_io();

    // Example 4: Integrity checking
    example_integrity();

    // Example 5: Different algorithms
    example_algorithms();
}

fn example_basic() {
    println!("Example 1: Basic compression with metadata");
    println!("-------------------------------------------");

    let data = b"Hello, World! This is a test of the .avz format. \
                 It supports metadata, checksums, and block-based compression.";

    let mut metadata = HashMap::new();
    metadata.insert("author".to_string(), "AvilaDB".to_string());
    metadata.insert("timestamp".to_string(), "2025-01-20".to_string());
    metadata.insert("description".to_string(), "Test file".to_string());

    let avz = AvzFormat::new(data, Algorithm::Lz4Normal, metadata).unwrap();

    println!("Original size: {} bytes", avz.uncompressed_size);
    println!("Compressed size: {} bytes", avz.compressed_size);
    println!("Compression ratio: {:.2}%", avz.compression_percentage());
    println!("Checksum: 0x{:016x}", avz.checksum);
    println!("Metadata entries: {}", avz.metadata.len());
    println!("Blocks: {}", avz.blocks.len());

    // Decompress
    let decompressed = avz.decompress().unwrap();
    assert_eq!(&decompressed, data);
    println!("✓ Decompression verified\n");
}

fn example_large_file() {
    println!("Example 2: Large file with multiple blocks");
    println!("------------------------------------------");

    // 200KB of data to trigger multiple 64KB blocks
    let data: Vec<u8> = (0..200_000).map(|i| (i % 256) as u8).collect();

    let metadata = HashMap::new();
    let avz = AvzFormat::new(&data, Algorithm::Lz4Normal, metadata).unwrap();

    println!("Original size: {} bytes", avz.uncompressed_size);
    println!("Compressed size: {} bytes", avz.compressed_size);
    println!("Compression ratio: {:.2}%", avz.compression_percentage());
    println!("Number of blocks: {}", avz.blocks.len());

    // Show block details
    for (i, block) in avz.blocks.iter().enumerate() {
        let ratio = (1.0 - block.compressed_size as f64 / block.uncompressed_size as f64) * 100.0;
        println!(
            "  Block {}: {} → {} bytes ({:.2}% compression)",
            i,
            block.uncompressed_size,
            block.compressed_size,
            ratio
        );
    }

    // Decompress
    let decompressed = avz.decompress().unwrap();
    assert_eq!(decompressed, data);
    println!("✓ Decompression verified\n");
}

fn example_file_io() {
    println!("Example 3: Write and read from disk");
    println!("-----------------------------------");

    let data = b"Test data for file I/O. This will be written to disk as a .avz file.";

    let mut metadata = HashMap::new();
    metadata.insert("test".to_string(), "file_io".to_string());

    // Create format
    let avz = AvzFormat::new(data, Algorithm::Lz4Normal, metadata).unwrap();
    println!("Created .avz format: {} → {} bytes", avz.uncompressed_size, avz.compressed_size);

    // Write to temporary location
    let temp_path = std::env::temp_dir().join("test.avz");
    avz.write_file(&temp_path).unwrap();
    println!("✓ Written to: {:?}", temp_path);

    // Read back
    let avz2 = AvzFormat::read_file(&temp_path).unwrap();
    println!("✓ Read from disk");

    // Verify
    assert_eq!(avz.uncompressed_size, avz2.uncompressed_size);
    assert_eq!(avz.compressed_size, avz2.compressed_size);
    assert_eq!(avz.checksum, avz2.checksum);

    let decompressed = avz2.decompress().unwrap();
    assert_eq!(&decompressed, data);
    println!("✓ Data verified");

    // Cleanup
    std::fs::remove_file(temp_path).ok();
    println!();
}

fn example_integrity() {
    println!("Example 4: Integrity checking");
    println!("-----------------------------");

    let data = b"Data with integrity checks. Checksums ensure corruption detection.";

    let metadata = HashMap::new();
    let mut avz = AvzFormat::new(data, Algorithm::Lz4Normal, metadata).unwrap();

    println!("Original checksum: 0x{:016x}", avz.checksum);

    // Simulate corruption
    if let Some(block) = avz.blocks.first_mut() {
        println!("Corrupting first block...");
        block.data[0] ^= 0xFF;
    }

    // Try to decompress
    match avz.decompress() {
        Ok(_) => println!("✗ Corruption not detected (unexpected)"),
        Err(_) => println!("✓ Corruption detected by checksum verification"),
    }
    println!();
}

fn example_algorithms() {
    println!("Example 5: Different algorithms");
    println!("-------------------------------");

    let data = vec![b'A'; 10000]; // Highly compressible

    // None (no compression)
    let avz_none = AvzFormat::new(&data, Algorithm::None, HashMap::new()).unwrap();
    println!("Algorithm::None");
    println!("  Original: {} bytes", avz_none.uncompressed_size);
    println!("  Compressed: {} bytes", avz_none.compressed_size);
    println!("  Ratio: {:.2}%", avz_none.compression_percentage());

    // LZ4 Fast
    let avz_fast = AvzFormat::new(&data, Algorithm::Lz4Fast, HashMap::new()).unwrap();
    println!("\nAlgorithm::Lz4Fast");
    println!("  Original: {} bytes", avz_fast.uncompressed_size);
    println!("  Compressed: {} bytes", avz_fast.compressed_size);
    println!("  Ratio: {:.2}%", avz_fast.compression_percentage());

    // LZ4 Normal
    let avz_normal = AvzFormat::new(&data, Algorithm::Lz4Normal, HashMap::new()).unwrap();
    println!("\nAlgorithm::Lz4Normal");
    println!("  Original: {} bytes", avz_normal.uncompressed_size);
    println!("  Compressed: {} bytes", avz_normal.compressed_size);
    println!("  Ratio: {:.2}%", avz_normal.compression_percentage());

    // LZ4 Best
    let avz_best = AvzFormat::new(&data, Algorithm::Lz4Best, HashMap::new()).unwrap();
    println!("\nAlgorithm::Lz4Best");
    println!("  Original: {} bytes", avz_best.uncompressed_size);
    println!("  Compressed: {} bytes", avz_best.compressed_size);
    println!("  Ratio: {:.2}%", avz_best.compression_percentage());

    // Verify all
    assert_eq!(avz_none.decompress().unwrap(), data);
    assert_eq!(avz_fast.decompress().unwrap(), data);
    assert_eq!(avz_normal.decompress().unwrap(), data);
    assert_eq!(avz_best.decompress().unwrap(), data);
    println!("\n✓ All algorithms verified");
}
