//! Example demonstrating different compression levels
//!
//! Run with:
//! ```bash
//! cargo run --example compression_levels --release
//! ```

use avila_compress::{lz4, Level};
use std::time::Instant;

fn main() {
    // Test different types of data
    let test_cases = vec![
        (
            "Highly repetitive data",
            vec![b'A'; 10000],
        ),
        (
            "JSON-like data",
            br#"{"user":"john","email":"john@example.com","items":[{"id":1,"name":"Item1"},{"id":2,"name":"Item2"}]}"#.repeat(100).into_bytes(),
        ),
        (
            "Random data",
            (0..5000).map(|i| ((i * 17) % 256) as u8).collect::<Vec<u8>>(),
        ),
        (
            "Text data",
            "The quick brown fox jumps over the lazy dog. ".repeat(200).into_bytes(),
        ),
    ];

    for (name, data) in test_cases {
        println!("\n========================================");
        println!("Test: {}", name);
        println!("Original size: {} bytes", data.len());
        println!("========================================");

        // Test Fast compression
        let start = Instant::now();
        let compressed_fast = lz4::compress_with_level(&data, Level::Fast).unwrap();
        let duration_fast = start.elapsed();
        let decompressed = lz4::decompress(&compressed_fast).unwrap();
        assert_eq!(data, decompressed);

        println!(
            "Fast:     {} bytes ({:.2}% of original) - {:?}",
            compressed_fast.len(),
            (compressed_fast.len() as f64 / data.len() as f64) * 100.0,
            duration_fast
        );

        // Test Balanced compression
        let start = Instant::now();
        let compressed_balanced = lz4::compress_with_level(&data, Level::Balanced).unwrap();
        let duration_balanced = start.elapsed();
        let decompressed = lz4::decompress(&compressed_balanced).unwrap();
        assert_eq!(data, decompressed);

        println!(
            "Balanced: {} bytes ({:.2}% of original) - {:?}",
            compressed_balanced.len(),
            (compressed_balanced.len() as f64 / data.len() as f64) * 100.0,
            duration_balanced
        );

        // Test Best compression
        let start = Instant::now();
        let compressed_best = lz4::compress_with_level(&data, Level::Best).unwrap();
        let duration_best = start.elapsed();
        let decompressed = lz4::decompress(&compressed_best).unwrap();
        assert_eq!(data, decompressed);

        println!(
            "Best:     {} bytes ({:.2}% of original) - {:?}",
            compressed_best.len(),
            (compressed_best.len() as f64 / data.len() as f64) * 100.0,
            duration_best
        );

        println!("\nSpeed comparison:");
        println!(
            "  Fast is {:.2}x faster than Balanced",
            duration_balanced.as_secs_f64() / duration_fast.as_secs_f64()
        );
        println!(
            "  Fast is {:.2}x faster than Best",
            duration_best.as_secs_f64() / duration_fast.as_secs_f64()
        );

        println!("\nSize comparison:");
        if compressed_fast.len() > compressed_best.len() {
            let saving = compressed_fast.len() - compressed_best.len();
            println!(
                "  Best saves {} bytes ({:.2}% smaller than Fast)",
                saving,
                (saving as f64 / compressed_fast.len() as f64) * 100.0
            );
        }
    }

    println!("\n========================================");
    println!("All tests passed! ✓");
    println!("========================================");
}
