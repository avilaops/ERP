//! Columnar compression examples
//!
//! Demonstrates specialized compression for scientific and time-series data.
//!
//! Run with:
//! ```bash
//! cargo run --example columnar --release
//! ```

use avila_compress::columnar::{self, ColumnStats};
use std::mem;
use std::time::Instant;

fn main() {
    println!("\n{}", "=".repeat(70));
    println!("Columnar Compression for Scientific Data");
    println!("{}", "=".repeat(70));

    // Example 1: RLE for sparse sensor data
    println!("\n📊 Example 1: RLE for Sparse Sensor Data");
    println!("{}", "-".repeat(70));

    let sensor_data = vec![
        0.0, 0.0, 0.0, 0.0, 0.0, // Sensor off
        1.5, 1.5, 1.5,           // Reading 1
        0.0, 0.0, 0.0,           // Off again
        2.8, 2.8, 2.8, 2.8,      // Reading 2
        0.0, 0.0, 0.0, 0.0, 0.0, // Off
    ];

    let original_size = sensor_data.len() * mem::size_of::<f64>();
    let encoded = columnar::rle_encode_f64(&sensor_data);
    let decoded = columnar::rle_decode_f64(&encoded).unwrap();

    println!("  Original data points: {}", sensor_data.len());
    println!("  Original size: {} bytes", original_size);
    println!("  Compressed size: {} bytes", encoded.len());
    println!("  Ratio: {:.2}%", (encoded.len() as f64 / original_size as f64) * 100.0);
    println!("  Compression: {:.1}x", original_size as f64 / encoded.len() as f64);
    assert_eq!(sensor_data, decoded);
    println!("  ✓ Verified");

    // Example 2: RLE for boolean/constant data
    println!("\n📊 Example 2: RLE for Constant Values (All Zeros)");
    println!("{}", "-".repeat(70));

    let zeros = vec![0.0; 10000];
    let original_size = zeros.len() * mem::size_of::<f64>();
    let encoded = columnar::rle_encode_f64(&zeros);
    let decoded = columnar::rle_decode_f64(&encoded).unwrap();

    println!("  Data points: {}", zeros.len());
    println!("  Original size: {} bytes ({:.1} KB)", original_size, original_size as f64 / 1024.0);
    println!("  Compressed size: {} bytes", encoded.len());
    println!("  Compression: {:.1}x", original_size as f64 / encoded.len() as f64);
    assert_eq!(zeros, decoded);
    println!("  ✓ Verified - Extreme compression!");

    // Example 3: Delta encoding for timestamps
    println!("\n📊 Example 3: Delta Encoding for Timestamps");
    println!("{}", "-".repeat(70));

    // Simulate timestamps (milliseconds since epoch)
    let base_time = 1700000000000i64;
    let timestamps: Vec<i64> = (0..1000).map(|i| base_time + i * 1000).collect(); // 1 per second

    let original_size = timestamps.len() * mem::size_of::<i64>();
    let start = Instant::now();
    let encoded = columnar::delta_encode(&timestamps);
    let encode_time = start.elapsed();

    let start = Instant::now();
    let decoded = columnar::delta_decode(&encoded).unwrap();
    let decode_time = start.elapsed();

    println!("  Data points: {}", timestamps.len());
    println!("  Original size: {} bytes ({:.1} KB)", original_size, original_size as f64 / 1024.0);
    println!("  Compressed size: {} bytes ({:.1} KB)", encoded.len(), encoded.len() as f64 / 1024.0);
    println!("  Ratio: {:.2}%", (encoded.len() as f64 / original_size as f64) * 100.0);
    println!("  Compression: {:.1}x", original_size as f64 / encoded.len() as f64);
    println!("  Encode time: {:?}", encode_time);
    println!("  Decode time: {:?}", decode_time);
    assert_eq!(timestamps, decoded);
    println!("  ✓ Verified");

    // Example 4: FOR encoding for counter data
    println!("\n📊 Example 4: Frame-of-Reference for Counter Data");
    println!("{}", "-".repeat(70));

    let counters: Vec<i64> = (5000..6000).collect(); // Counters from 5000 to 5999

    let original_size = counters.len() * mem::size_of::<i64>();
    let encoded = columnar::for_encode(&counters);
    let decoded = columnar::for_decode(&encoded).unwrap();

    println!("  Data points: {}", counters.len());
    println!("  Range: {} to {}", counters[0], counters[counters.len() - 1]);
    println!("  Original size: {} bytes ({:.1} KB)", original_size, original_size as f64 / 1024.0);
    println!("  Compressed size: {} bytes ({:.1} KB)", encoded.len(), encoded.len() as f64 / 1024.0);
    println!("  Ratio: {:.2}%", (encoded.len() as f64 / original_size as f64) * 100.0);
    assert_eq!(counters, decoded);
    println!("  ✓ Verified");

    // Example 5: Real-world IoT scenario
    println!("\n📊 Example 5: IoT Temperature Sensors (Real-World)");
    println!("{}", "-".repeat(70));

    // Simulate temperature readings: mostly stable with occasional changes
    let mut temps = Vec::new();
    temps.extend(vec![22.5; 100]);  // Stable room temp
    temps.extend(vec![22.6; 50]);   // Slight change
    temps.extend(vec![22.5; 100]);  // Back to normal
    temps.extend(vec![22.7; 30]);   // Another slight change
    temps.extend(vec![22.5; 120]);  // Stable again

    let original_size = temps.len() * mem::size_of::<f64>();
    let encoded = columnar::rle_encode_f64(&temps);
    let decoded = columnar::rle_decode_f64(&encoded).unwrap();

    println!("  Readings: {}", temps.len());
    println!("  Original size: {} bytes ({:.1} KB)", original_size, original_size as f64 / 1024.0);
    println!("  Compressed size: {} bytes", encoded.len());
    println!("  Compression: {:.1}x", original_size as f64 / encoded.len() as f64);
    println!("  Savings: {:.1}%", (1.0 - encoded.len() as f64 / original_size as f64) * 100.0);
    assert_eq!(temps, decoded);
    println!("  ✓ Verified");

    // Example 6: Performance comparison
    println!("\n📊 Example 6: Performance Comparison (1M data points)");
    println!("{}", "-".repeat(70));

    let large_data: Vec<i64> = (0..1_000_000).collect();
    let original_size = large_data.len() * mem::size_of::<i64>();

    // Delta encoding
    let start = Instant::now();
    let delta_encoded = columnar::delta_encode(&large_data);
    let delta_encode_time = start.elapsed();
    let delta_throughput = (original_size as f64 / 1024.0 / 1024.0) / delta_encode_time.as_secs_f64();

    println!("\n  Delta Encoding:");
    println!("    Compressed size: {:.1} KB", delta_encoded.len() as f64 / 1024.0);
    println!("    Encode time: {:?}", delta_encode_time);
    println!("    Throughput: {:.2} MB/s", delta_throughput);

    // FOR encoding
    let start = Instant::now();
    let for_encoded = columnar::for_encode(&large_data);
    let for_encode_time = start.elapsed();
    let for_throughput = (original_size as f64 / 1024.0 / 1024.0) / for_encode_time.as_secs_f64();

    println!("\n  FOR Encoding:");
    println!("    Compressed size: {:.1} KB", for_encoded.len() as f64 / 1024.0);
    println!("    Encode time: {:?}", for_encode_time);
    println!("    Throughput: {:.2} MB/s", for_throughput);

    println!("\n{}", "=".repeat(70));
    println!("All columnar compression tests passed! ✓");
    println!("{}", "=".repeat(70));
}
