//! Example demonstrating checksum verification with metrics
//!
//! Shows how to use checksums to verify data integrity and track performance.
//!
//! Run with:
//! ```bash
//! cargo run --example checksums --release
//! ```

use avila_compress::{checksum, lz4, metrics, Level};
use std::time::Instant;

fn main() {
    println!("========================================");
    println!("Checksum Verification Example");
    println!("========================================\n");

    // Example 1: Basic checksum usage
    println!("1. Basic Checksums:");
    let data = b"Hello, World! This is important data.";

    let xxhash = checksum::xxhash64(data, 0);
    let crc = checksum::crc32(data);

    println!("   Data: {:?}", String::from_utf8_lossy(data));
    println!("   XXHash64: 0x{:016x}", xxhash);
    println!("   CRC32:    0x{:08x}\n", crc);

    // Example 2: Verify data integrity
    println!("2. Integrity Verification:");

    let original = b"Critical data that must not be corrupted";
    let xxhash_orig = checksum::xxhash64(original, 0);

    // Simulate transmission/storage
    let transmitted = original.to_vec();

    if checksum::verify_xxhash64(&transmitted, xxhash_orig) {
        println!("   ✓ Data integrity verified (XXHash64)");
    } else {
        println!("   ✗ Data corruption detected!");
    }

    // Simulate corruption
    let mut corrupted = original.to_vec();
    corrupted[10] ^= 0xFF; // Flip bits

    if !checksum::verify_xxhash64(&corrupted, xxhash_orig) {
        println!("   ✓ Corruption detected correctly\n");
    }

    // Example 3: Compression + Checksum
    println!("3. Compression with Integrity Check:");

    let data = b"Important data to compress and verify".repeat(100);

    // Calculate checksum of original
    let original_hash = checksum::xxhash64(&data, 0);
    println!("   Original checksum: 0x{:016x}", original_hash);

    // Compress
    let compressed = lz4::compress(&data).unwrap();
    println!("   Compressed: {} bytes", compressed.len());

    // Add checksum to compressed data
    let mut with_checksum = compressed.clone();
    with_checksum.extend_from_slice(&original_hash.to_le_bytes());
    println!("   With checksum: {} bytes\n", with_checksum.len());

    // Decompress and verify
    let compressed_only = &with_checksum[..with_checksum.len() - 8];
    let stored_hash = u64::from_le_bytes([
        with_checksum[with_checksum.len() - 8],
        with_checksum[with_checksum.len() - 7],
        with_checksum[with_checksum.len() - 6],
        with_checksum[with_checksum.len() - 5],
        with_checksum[with_checksum.len() - 4],
        with_checksum[with_checksum.len() - 3],
        with_checksum[with_checksum.len() - 2],
        with_checksum[with_checksum.len() - 1],
    ]);

    let decompressed = lz4::decompress(compressed_only).unwrap();

    if checksum::verify_xxhash64(&decompressed, stored_hash) {
        println!("   ✓ Decompressed data verified");
    } else {
        println!("   ✗ Verification failed!");
    }

    // Example 4: Performance comparison
    println!("\n4. Performance Comparison:");

    let test_sizes = vec![
        ("1 KB", 1024),
        ("10 KB", 10 * 1024),
        ("100 KB", 100 * 1024),
        ("1 MB", 1024 * 1024),
    ];

    for (name, size) in test_sizes {
        let data = vec![b'X'; size];

        // XXHash64
        let start = Instant::now();
        let _ = checksum::xxhash64(&data, 0);
        let xxhash_time = start.elapsed();
        let xxhash_speed = (size as f64) / xxhash_time.as_secs_f64() / (1024.0 * 1024.0);

        // CRC32
        let start = Instant::now();
        let _ = checksum::crc32(&data);
        let crc_time = start.elapsed();
        let crc_speed = (size as f64) / crc_time.as_secs_f64() / (1024.0 * 1024.0);

        println!("\n   {}:", name);
        println!("     XXHash64: {:>8.2} MB/s ({:?})", xxhash_speed, xxhash_time);
        println!("     CRC32:    {:>8.2} MB/s ({:?})", crc_speed, crc_time);
        println!(
            "     XXHash is {:.1}x faster",
            crc_time.as_secs_f64() / xxhash_time.as_secs_f64()
        );
    }

    // Example 5: Different hash values for different data
    println!("\n5. Hash Collision Resistance:");

    let data1 = b"data version 1";
    let data2 = b"data version 2";
    let data3 = b"data version 1"; // Same as data1

    let hash1 = checksum::xxhash64(data1, 0);
    let hash2 = checksum::xxhash64(data2, 0);
    let hash3 = checksum::xxhash64(data3, 0);

    println!("   Data 1 hash: 0x{:016x}", hash1);
    println!("   Data 2 hash: 0x{:016x}", hash2);
    println!("   Data 3 hash: 0x{:016x}", hash3);

    assert_eq!(hash1, hash3);
    assert_ne!(hash1, hash2);
    println!("   ✓ Same data produces same hash");
    println!("   ✓ Different data produces different hash");

    println!("\n========================================");
    println!("All checksum tests passed! ✓");
    println!("========================================");

    // Example 6: Compression with metrics
    println!("\n\n6. Compression with Metrics:");
    let large_data = vec![b'A'; 1024 * 1024];

    let (compressed, compress_metrics) =
        metrics::compress_with_metrics(&large_data, "LZ4-Fast", |d| {
            lz4::compress_with_level(d, Level::Fast)
        })
        .unwrap();

    println!("\n{}", compress_metrics.display());

    let (decompressed, full_metrics) =
        metrics::decompress_with_metrics(compressed.as_slice(), compress_metrics, |c| {
            lz4::decompress(c)
        })
        .unwrap();

    println!("{}", full_metrics.display());
    assert_eq!(large_data, decompressed);
    println!("   ✓ Data integrity verified via checksum!\n");
}
