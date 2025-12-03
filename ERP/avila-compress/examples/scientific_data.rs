//! Example demonstrating compression of scientific data
//!
//! Shows realistic use cases for scientific computing and AvilaDB:
//! - Time series data (sensor readings)
//! - Telemetry data (LIGO/LISA gravitational waves)
//! - Columnar data (scientific datasets)
//!
//! Run with:
//! ```bash
//! cargo run --example scientific_data --release
//! ```

use avila_compress::{checksum, lz4, Level};
use std::time::Instant;

fn main() {
    println!("========================================");
    println!("Scientific Data Compression Examples");
    println!("========================================\n");

    // Example 1: Time Series Data (Sensor Readings)
    time_series_example();

    // Example 2: Gravitational Wave Data (LIGO/LISA)
    gravitational_wave_example();

    // Example 3: Columnar Scientific Data
    columnar_data_example();

    // Example 4: Real-time Telemetry
    telemetry_example();

    println!("\n========================================");
    println!("All scientific data examples completed! ✓");
    println!("========================================");
}

fn time_series_example() {
    println!("1. Time Series Data (Temperature Sensors):");
    println!("   Simulating 1 hour of temperature readings (1 Hz)");

    // Simulate 3600 readings (1 hour at 1 Hz)
    // Temperature: 20.0°C to 25.0°C with small variations
    let mut readings = Vec::with_capacity(3600 * 8); // 8 bytes per f64

    for i in 0..3600 {
        let temp = 22.5 + (i as f64 / 100.0).sin() * 2.5;
        readings.extend_from_slice(&temp.to_le_bytes());
    }

    let original_size = readings.len();
    println!("   Original size: {} bytes ({} KB)", original_size, original_size / 1024);

    // Compress with Best level (good for archival)
    let start = Instant::now();
    let compressed = lz4::compress_with_level(&readings, Level::Best).unwrap();
    let compress_time = start.elapsed();

    let ratio = (compressed.len() as f64 / original_size as f64) * 100.0;
    println!("   Compressed: {} bytes ({} KB) - {:.2}%",
             compressed.len(), compressed.len() / 1024, ratio);
    println!("   Compression time: {:?}", compress_time);

    // Add checksum for integrity
    let hash = checksum::xxhash64(&readings, 0);
    println!("   Checksum: 0x{:016x}", hash);

    // Simulate decompression
    let start = Instant::now();
    let decompressed = lz4::decompress(&compressed).unwrap();
    let decompress_time = start.elapsed();
    println!("   Decompression time: {:?}", decompress_time);

    assert_eq!(readings, decompressed);
    assert!(checksum::verify_xxhash64(&decompressed, hash));
    println!("   ✓ Verified: data integrity confirmed\n");
}

fn gravitational_wave_example() {
    println!("2. Gravitational Wave Data (LIGO/LISA):");
    println!("   Simulating strain data (h(t)) at 16 kHz");

    // Simulate 1 second of strain data at 16 kHz
    let sample_rate = 16000;
    let mut strain_data = Vec::with_capacity(sample_rate * 8);

    for i in 0..sample_rate {
        // Simulate strain: noise + potential signal
        let t = i as f64 / sample_rate as f64;
        let noise = (t * 1000.0).sin() * 1e-21;
        let signal = if t > 0.3 && t < 0.5 {
            1e-20 * (t * 100.0).sin()
        } else {
            0.0
        };
        let strain = noise + signal;
        strain_data.extend_from_slice(&strain.to_le_bytes());
    }

    let original_size = strain_data.len();
    println!("   Original size: {} bytes ({} KB)", original_size, original_size / 1024);
    println!("   Data points: {}", sample_rate);

    // Fast compression for real-time processing
    let start = Instant::now();
    let compressed = lz4::compress_with_level(&strain_data, Level::Fast).unwrap();
    let compress_time = start.elapsed();

    let ratio = (compressed.len() as f64 / original_size as f64) * 100.0;
    let throughput = (original_size as f64 / compress_time.as_secs_f64()) / (1024.0 * 1024.0);

    println!("   Compressed: {} bytes ({} KB) - {:.2}%",
             compressed.len(), compressed.len() / 1024, ratio);
    println!("   Throughput: {:.2} MB/s", throughput);
    println!("   ✓ Fast mode: suitable for real-time streaming\n");
}

fn columnar_data_example() {
    println!("3. Columnar Scientific Data:");
    println!("   Simulating particle physics experiment data");

    // Simulate columnar data: energy, momentum, charge
    let num_events = 10000;

    // Energy column (f64)
    let mut energy_data = Vec::with_capacity(num_events * 8);
    for i in 0..num_events {
        let energy = 100.0 + (i as f64 * 0.1) % 50.0;
        energy_data.extend_from_slice(&energy.to_le_bytes());
    }

    // Momentum column (f64)
    let mut momentum_data = Vec::with_capacity(num_events * 8);
    for i in 0..num_events {
        let momentum = 50.0 + (i as f64 * 0.05) % 25.0;
        momentum_data.extend_from_slice(&momentum.to_le_bytes());
    }

    // Charge column (i32) - highly repetitive!
    let mut charge_data = Vec::with_capacity(num_events * 4);
    for i in 0..num_events {
        let charge = if i % 2 == 0 { 1i32 } else { -1i32 };
        charge_data.extend_from_slice(&charge.to_le_bytes());
    }

    // Compress each column separately
    let energy_compressed = lz4::compress(&energy_data).unwrap();
    let momentum_compressed = lz4::compress(&momentum_data).unwrap();
    let charge_compressed = lz4::compress(&charge_data).unwrap();

    let original_total = energy_data.len() + momentum_data.len() + charge_data.len();
    let compressed_total = energy_compressed.len() + momentum_compressed.len() + charge_compressed.len();

    println!("   Events: {}", num_events);
    println!("   Original total: {} bytes ({} KB)", original_total, original_total / 1024);
    println!("   Compressed total: {} bytes ({} KB)", compressed_total, compressed_total / 1024);
    println!("   Overall ratio: {:.2}%", (compressed_total as f64 / original_total as f64) * 100.0);
    println!();
    println!("   Column breakdown:");
    println!("     Energy:   {} → {} bytes ({:.2}%)",
             energy_data.len(), energy_compressed.len(),
             (energy_compressed.len() as f64 / energy_data.len() as f64) * 100.0);
    println!("     Momentum: {} → {} bytes ({:.2}%)",
             momentum_data.len(), momentum_compressed.len(),
             (momentum_compressed.len() as f64 / momentum_data.len() as f64) * 100.0);
    println!("     Charge:   {} → {} bytes ({:.2}%)",
             charge_data.len(), charge_compressed.len(),
             (charge_compressed.len() as f64 / charge_data.len() as f64) * 100.0);
    println!("   ✓ Charge column: highly repetitive, excellent compression!\n");
}

fn telemetry_example() {
    println!("4. Real-time Telemetry Streaming:");
    println!("   Simulating satellite telemetry data");

    use avila_compress::stream::Lz4Encoder;

    let mut encoder = Lz4Encoder::new();
    let mut total_original = 0;

    println!("   Processing telemetry packets:");

    // Simulate 10 telemetry packets
    for i in 0..10 {
        // Each packet: timestamp (u64) + 20 sensor readings (f32)
        let mut packet = Vec::with_capacity(8 + 20 * 4);

        // Timestamp
        let timestamp = 1700000000u64 + i * 100;
        packet.extend_from_slice(&timestamp.to_le_bytes());

        // Sensor readings
        for j in 0..20 {
            let reading = 25.0 + (j as f32 * 0.5).sin() * 5.0;
            packet.extend_from_slice(&reading.to_le_bytes());
        }

        total_original += packet.len();

        // Stream compress
        encoder.write(&packet).unwrap();

        if i % 3 == 0 {
            print!("     Packet {} processed", i + 1);
            if i > 0 {
                print!(" (batched)");
            }
            println!();
        }
    }

    let compressed = encoder.finish().unwrap();

    println!("   Total original: {} bytes", total_original);
    println!("   Total compressed: {} bytes", compressed.len());
    println!("   Streaming ratio: {:.2}%",
             (compressed.len() as f64 / total_original as f64) * 100.0);
    println!("   ✓ Suitable for real-time satellite data transmission\n");
}
