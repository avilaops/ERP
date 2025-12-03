//! Example demonstrating streaming compression
//!
//! Shows how to compress data in chunks without loading everything into memory.
//!
//! Run with:
//! ```bash
//! cargo run --example streaming --release
//! ```

use avila_compress::stream::{Lz4Decoder, Lz4Encoder};

fn main() {
    println!("========================================");
    println!("Streaming Compression Example");
    println!("========================================\n");

    // Example 1: Compress data in chunks
    println!("1. Streaming Encoder:");
    let mut encoder = Lz4Encoder::new();

    let chunks = vec![
        b"Hello, World! ".as_slice(),
        b"This is streaming compression. ".as_slice(),
        b"We can process data in chunks. ".as_slice(),
        b"No need to load everything into memory!".as_slice(),
    ];

    for (i, chunk) in chunks.iter().enumerate() {
        println!("   Writing chunk {}: {} bytes", i + 1, chunk.len());
        let _output = encoder.write(chunk).expect("Compression failed");
    }

    let compressed = encoder.finish().expect("Finish failed");
    println!("   Final compressed size: {} bytes\n", compressed.len());

    // Verify by decompressing
    let decompressed = avila_compress::lz4::decompress(&compressed).expect("Decompression failed");
    let original: Vec<u8> = chunks.iter().flat_map(|c| c.iter()).copied().collect();
    assert_eq!(original, decompressed);
    println!("   ✓ Verified: decompressed matches original\n");

    // Example 2: Decompress in chunks
    println!("2. Streaming Decoder:");
    let mut decoder = Lz4Decoder::new();

    // Split compressed data into chunks to simulate streaming
    let chunk_size = compressed.len() / 3;
    let chunks: Vec<&[u8]> = vec![
        &compressed[..chunk_size],
        &compressed[chunk_size..chunk_size * 2],
        &compressed[chunk_size * 2..],
    ];

    for (i, chunk) in chunks.iter().enumerate() {
        println!("   Reading chunk {}: {} bytes", i + 1, chunk.len());
        let _output = decoder.write(chunk).expect("Decompression failed");
    }

    let final_output = decoder.finish().expect("Finish failed");
    assert_eq!(original, final_output);
    println!("   ✓ Verified: streaming decode matches original\n");

    // Example 3: Large data streaming
    println!("3. Large Data (1 MB):");
    let large_data = vec![b'X'; 1024 * 1024]; // 1 MB
    let mut encoder = Lz4Encoder::new();

    // Process in 64 KB chunks
    let chunk_size = 64 * 1024;
    let num_chunks = (large_data.len() + chunk_size - 1) / chunk_size;

    for i in 0..num_chunks {
        let start = i * chunk_size;
        let end = ((i + 1) * chunk_size).min(large_data.len());
        encoder.write(&large_data[start..end]).expect("Write failed");
    }

    let compressed_large = encoder.finish().expect("Finish failed");
    let ratio = (compressed_large.len() as f64 / large_data.len() as f64) * 100.0;

    println!("   Original: {} bytes", large_data.len());
    println!("   Compressed: {} bytes ({:.2}%)", compressed_large.len(), ratio);
    println!("   Processed in {} chunks of {} KB", num_chunks, chunk_size / 1024);

    // Verify
    let decompressed_large =
        avila_compress::lz4::decompress(&compressed_large).expect("Decompression failed");
    assert_eq!(large_data, decompressed_large);
    println!("   ✓ Verified\n");

    println!("========================================");
    println!("All streaming tests passed! ✓");
    println!("========================================");
}
