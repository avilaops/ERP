//! Benchmark de compression levels

use avila_compress::{lz4, Level};
use std::time::Instant;

fn main() {
    println!("🚀 avila-compress v0.3.0 - Performance Benchmark\n");

    // Test data: highly compressible
    let repetitive = "AAAA".repeat(1000);
    println!("📊 Test 1: Repetitive data ({} bytes)", repetitive.len());
    test_compression("Repetitive", repetitive.as_bytes());

    // Test data: moderate compression
    let text = include_str!("../src/lib.rs");
    println!("\n📊 Test 2: Source code ({} bytes)", text.len());
    test_compression("Source code", text.as_bytes());

    // Test data: random-ish
    let random: Vec<u8> = (0..10000).map(|i| ((i * 17 + 42) % 256) as u8).collect();
    println!("\n📊 Test 3: Random data ({} bytes)", random.len());
    test_compression("Random", &random);

    println!("\n✅ Benchmark completed!");
}

fn test_compression(name: &str, data: &[u8]) {
    let levels = [
        ("Fast", Level::Fast),
        ("Balanced", Level::Balanced),
        ("Best", Level::Best),
        ("Ultra", Level::Ultra),
    ];

    for (level_name, level) in levels {
        let start = Instant::now();
        let compressed = lz4::compress_with_level(data, level).unwrap();
        let compress_time = start.elapsed();

        let start = Instant::now();
        let decompressed = lz4::decompress(&compressed).unwrap();
        let decompress_time = start.elapsed();

        assert_eq!(data, &decompressed[..]);

        let ratio = (compressed.len() as f64 / data.len() as f64) * 100.0;
        let speed_mb = (data.len() as f64 / 1024.0 / 1024.0) / compress_time.as_secs_f64();

        println!(
            "  {:8} | {:6} bytes | {:5.1}% ratio | {:7.1} MB/s | decomp: {:6.0} µs",
            level_name,
            compressed.len(),
            ratio,
            speed_mb,
            decompress_time.as_micros()
        );
    }
}
