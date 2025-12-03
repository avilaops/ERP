//! Example demonstrating different compression levels
//!
//! Run with:
//! ```bash
//! cargo run --example compression_levels --release
//! ```

use avila_compress::{lz4, Level};
use std::time::Instant;

fn benchmark_level(data: &[u8], level: Level, name: &str) {
    println!("\n{}", "=".repeat(60));
    println!("Testing: {}", name);
    println!("{}", "=".repeat(60));

    let start = Instant::now();
    let compressed = lz4::compress_with_level(data, level).unwrap();
    let compress_time = start.elapsed();

    let start = Instant::now();
    let decompressed = lz4::decompress(&compressed).unwrap();
    let decompress_time = start.elapsed();

    assert_eq!(data, decompressed.as_slice());

    let ratio = compressed.len() as f64 / data.len() as f64;
    let compress_speed = (data.len() as f64 / 1024.0 / 1024.0) / compress_time.as_secs_f64();
    let decompress_speed =
        (data.len() as f64 / 1024.0 / 1024.0) / decompress_time.as_secs_f64();

    println!("  Original size:      {} bytes", data.len());
    println!("  Compressed size:    {} bytes", compressed.len());
    println!("  Compression ratio:  {:.2}% ({:.2}x)", ratio * 100.0, 1.0 / ratio);
    println!("  Compress time:      {:?}", compress_time);
    println!("  Decompress time:    {:?}", decompress_time);
    println!("  Compress speed:     {:.2} MB/s", compress_speed);
    println!("  Decompress speed:   {:.2} MB/s", decompress_speed);
}

fn main() {
    println!("\n{}", "=".repeat(60));
    println!("LZ4 Compression Levels Comparison");
    println!("{}", "=".repeat(60));

    // Test 1: Repetitive data
    println!("\n📊 TEST 1: Repetitive Data (1 MB of 'AAAA...')");
    let repetitive = vec![b'A'; 1024 * 1024];
    benchmark_level(&repetitive, Level::Fast, "Level::Fast");
    benchmark_level(&repetitive, Level::Balanced, "Level::Balanced");
    benchmark_level(&repetitive, Level::Best, "Level::Best");

    // Test 2: Text data
    println!("\n\n📊 TEST 2: Text Data (repeated Lorem Ipsum)");
    let lorem = b"Lorem ipsum dolor sit amet, consectetur adipiscing elit. \
                  Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. \
                  Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.";
    let mut text_data = Vec::new();
    for _ in 0..5000 {
        text_data.extend_from_slice(lorem);
    }
    benchmark_level(&text_data, Level::Fast, "Level::Fast");
    benchmark_level(&text_data, Level::Balanced, "Level::Balanced");
    benchmark_level(&text_data, Level::Best, "Level::Best");

    // Test 3: Mixed data
    println!("\n\n📊 TEST 3: Mixed Data (alternating patterns)");
    let mut mixed_data = Vec::new();
    for i in 0..10000 {
        let pattern = match i % 4 {
            0 => b"AAAA",
            1 => b"BBBB",
            2 => b"CCCC",
            _ => b"DDDD",
        };
        mixed_data.extend_from_slice(pattern);
    }
    benchmark_level(&mixed_data, Level::Fast, "Level::Fast");
    benchmark_level(&mixed_data, Level::Balanced, "Level::Balanced");
    benchmark_level(&mixed_data, Level::Best, "Level::Best");

    // Test 4: JSON-like data
    println!("\n\n📊 TEST 4: JSON-like Data");
    let json_template = br#"{"user_id":12345,"name":"John Doe","email":"john@example.com","age":30,"active":true}"#;
    let mut json_data = Vec::new();
    for i in 0..5000 {
        let entry = format!(
            r#"{{"user_id":{},"name":"User{}","email":"user{}@example.com","age":{},"active":true}}"#,
            i, i, i, 20 + (i % 50)
        );
        json_data.extend_from_slice(entry.as_bytes());
    }
    benchmark_level(&json_data, Level::Fast, "Level::Fast");
    benchmark_level(&json_data, Level::Balanced, "Level::Balanced");
    benchmark_level(&json_data, Level::Best, "Level::Best");

    // Summary
    println!("\n\n{}", "=".repeat(60));
    println!("SUMMARY");
    println!("{}", "=".repeat(60));
    println!("\n📝 Recommendations:");
    println!("\n  • Level::Fast");
    println!("    - Use for: Real-time logging, network streaming");
    println!("    - Speed: Fastest (~2x normal)");
    println!("    - Ratio: Slightly lower than Balanced");
    println!("\n  • Level::Balanced (Default)");
    println!("    - Use for: General purpose, hot data");
    println!("    - Speed: Good balance");
    println!("    - Ratio: Good balance");
    println!("\n  • Level::Best");
    println!("    - Use for: Archival, cold storage");
    println!("    - Speed: ~50% slower than Balanced");
    println!("    - Ratio: 10-20% better compression");
    println!("\n{}", "=".repeat(60));
}
