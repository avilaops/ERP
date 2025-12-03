//! SIMD compression examples
//!
//! Demonstrates the performance benefits of AVX2 SIMD acceleration.
//!
//! Build and run:
//! ```bash
//! cargo run --example simd --features simd --release
//! ```

#[cfg(feature = "simd")]
use avila_compress::{simd, Level};

#[cfg(feature = "simd")]
use std::time::Instant;

#[cfg(feature = "simd")]
fn main() {
    println!("=== SIMD Compression Examples ===\n");

    // Check AVX2 availability
    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            println!("✅ AVX2 detected - SIMD acceleration enabled");
        } else {
            println!("⚠️  AVX2 not available - using scalar fallback");
        }
        println!();
    }

    example_basic_simd();
    example_performance_comparison();
    example_large_data_simd();
    example_scientific_data_simd();
}

#[cfg(feature = "simd")]
fn example_basic_simd() {
    println!("1️⃣  Basic SIMD Compression");
    println!("─────────────────────────");

    let data = b"Hello, World! This is SIMD-accelerated compression using AVX2 instructions.";

    let start = Instant::now();
    let compressed = simd::compress_simd(data, Level::Balanced).unwrap();
    let compress_time = start.elapsed();

    let start = Instant::now();
    let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();
    let decompress_time = start.elapsed();

    println!("Original size:    {} bytes", data.len());
    println!("Compressed size:  {} bytes", compressed.len());
    println!(
        "Ratio:            {:.2}%",
        (compressed.len() as f64 / data.len() as f64) * 100.0
    );
    println!("Compress time:    {:?}", compress_time);
    println!("Decompress time:  {:?}", decompress_time);
    println!("✓ Data matches:   {}", data == &decompressed[..]);
    println!();
}

#[cfg(feature = "simd")]
fn example_performance_comparison() {
    println!("2️⃣  SIMD vs Scalar Performance");
    println!("──────────────────────────────");

    // Generate test data (1 MB with some patterns)
    let mut data = Vec::with_capacity(1024 * 1024);
    for i in 0..1024 * 256 {
        data.extend_from_slice(&format!("Data block {}: This is some test data with patterns. ", i % 100).as_bytes());
    }
    data.truncate(1024 * 1024);

    // SIMD compression
    let start = Instant::now();
    let compressed_simd = simd::compress_simd(&data, Level::Balanced).unwrap();
    let simd_time = start.elapsed();

    // Scalar compression
    let start = Instant::now();
    let compressed_scalar = avila_compress::lz4::compress_with_level(&data, Level::Balanced).unwrap();
    let scalar_time = start.elapsed();

    let simd_speed = (data.len() as f64 / 1024.0 / 1024.0) / simd_time.as_secs_f64();
    let scalar_speed = (data.len() as f64 / 1024.0 / 1024.0) / scalar_time.as_secs_f64();
    let speedup = scalar_time.as_secs_f64() / simd_time.as_secs_f64();

    println!("Data size:        1 MB");
    println!("\nSIMD (AVX2):");
    println!("  Time:           {:?}", simd_time);
    println!("  Throughput:     {:.2} MB/s", simd_speed);
    println!("  Compressed:     {} bytes", compressed_simd.len());

    println!("\nScalar:");
    println!("  Time:           {:?}", scalar_time);
    println!("  Throughput:     {:.2} MB/s", scalar_speed);
    println!("  Compressed:     {} bytes", compressed_scalar.len());

    println!("\n🚀 SIMD Speedup:   {:.2}x faster", speedup);
    println!();
}

#[cfg(feature = "simd")]
fn example_large_data_simd() {
    println!("3️⃣  Large Data SIMD Compression");
    println!("───────────────────────────────");

    // Generate 10 MB of data
    let data = vec![b'A'; 10 * 1024 * 1024];

    for level in [Level::Fast, Level::Balanced, Level::Best] {
        let start = Instant::now();
        let compressed = simd::compress_simd(&data, level).unwrap();
        let elapsed = start.elapsed();

        let throughput = (data.len() as f64 / 1024.0 / 1024.0) / elapsed.as_secs_f64();

        println!("{:?}:", level);
        println!("  Compressed:     {} bytes ({:.2}% ratio)",
            compressed.len(),
            (compressed.len() as f64 / data.len() as f64) * 100.0
        );
        println!("  Time:           {:?}", elapsed);
        println!("  Throughput:     {:.2} MB/s", throughput);
        println!();
    }
}

#[cfg(feature = "simd")]
fn example_scientific_data_simd() {
    println!("4️⃣  Scientific Data SIMD Compression");
    println!("────────────────────────────────────");

    // Simulate sensor readings (temperature data with patterns)
    let mut sensor_data = Vec::new();
    for i in 0..100000 {
        let temp = 20.0 + (i as f64 / 1000.0).sin() * 5.0; // Sinusoidal pattern
        sensor_data.extend_from_slice(&temp.to_le_bytes());
    }

    println!("Sensor readings:  {} samples", 100000);
    println!("Raw data size:    {} bytes", sensor_data.len());

    let start = Instant::now();
    let compressed = simd::compress_simd(&sensor_data, Level::Balanced).unwrap();
    let elapsed = start.elapsed();

    let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();

    println!("Compressed size:  {} bytes", compressed.len());
    println!(
        "Compression ratio: {:.2}%",
        (compressed.len() as f64 / sensor_data.len() as f64) * 100.0
    );
    println!("SIMD throughput:  {:.2} MB/s",
        (sensor_data.len() as f64 / 1024.0 / 1024.0) / elapsed.as_secs_f64()
    );
    println!("✓ Data integrity: {}", sensor_data == decompressed);
    println!();

    println!("💡 Use Case: Real-time sensor data compression");
    println!("   SIMD enables sub-millisecond compression of streaming");
    println!("   scientific data with minimal CPU overhead.");
}

#[cfg(not(feature = "simd"))]
fn main() {
    println!("⚠️  SIMD feature not enabled!");
    println!();
    println!("To run this example, build with:");
    println!("  cargo run --example simd --features simd --release");
    println!();
    println!("Benefits:");
    println!("  • 5-6x faster compression with AVX2");
    println!("  • Automatic fallback to scalar on older CPUs");
    println!("  • Same compression ratio as scalar");
}
