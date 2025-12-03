//! Basic LZ4 compression example

use avila_compress::lz4;

fn main() {
    println!("🗜️  avila-compress - LZ4 Example\n");

    // Example 1: Simple text
    let text = "Hello, World! This is a test of LZ4 compression in Rust.";
    println!("Original: \"{}\"", text);
    println!("Size: {} bytes\n", text.len());

    let compressed = lz4::compress(text.as_bytes()).expect("Compression failed");
    println!("Compressed: {} bytes", compressed.len());
    println!(
        "Ratio: {:.2}%\n",
        (compressed.len() as f64 / text.len() as f64) * 100.0
    );

    let decompressed = lz4::decompress(&compressed).expect("Decompression failed");
    println!(
        "Decompressed: \"{}\"",
        String::from_utf8_lossy(&decompressed)
    );
    println!("Match: {}\n", text.as_bytes() == &decompressed[..]);

    // Example 2: Repetitive data (compresses well)
    println!("{}", "─".repeat(50));
    let repetitive = "AAAA".repeat(100);
    println!("\nRepetitive data: {} bytes", repetitive.len());
    let compressed = lz4::compress(repetitive.as_bytes()).expect("Compression failed");
    println!("Compressed: {} bytes", compressed.len());
    println!(
        "Ratio: {:.2}% (excellent compression!)\n",
        (compressed.len() as f64 / repetitive.len() as f64) * 100.0
    );

    // Example 3: Random data (doesn't compress well)
    println!("{}", "─".repeat(50));
    let random: Vec<u8> = (0..1000).map(|i| (i * 17 + 42) as u8).collect();
    println!("\nRandom-ish data: {} bytes", random.len());
    let compressed = lz4::compress(&random).expect("Compression failed");
    println!("Compressed: {} bytes", compressed.len());
    println!(
        "Ratio: {:.2}% (random data is hard to compress)\n",
        (compressed.len() as f64 / random.len() as f64) * 100.0
    );

    println!("✅ All examples completed successfully!");
}
