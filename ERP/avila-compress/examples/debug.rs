//! Debug compression

use avila_compress::{lz4, Level};

fn main() {
    let test_data = include_str!("../src/lib.rs");

    println!("Testing with {} bytes of source code", test_data.len());

    for (name, level) in [
        ("Fast", Level::Fast),
        ("Balanced", Level::Balanced),
        ("Best", Level::Best),
    ] {
        println!("\nTesting {} level...", name);

        match lz4::compress_with_level(test_data.as_bytes(), level) {
            Ok(compressed) => {
                println!("  Compressed: {} bytes", compressed.len());

                match lz4::decompress(&compressed) {
                    Ok(decompressed) => {
                        if test_data.as_bytes() == &decompressed[..] {
                            println!("  ✓ Decompression successful!");
                        } else {
                            println!("  ✗ Data mismatch!");
                        }
                    }
                    Err(e) => {
                        println!("  ✗ Decompression failed: {:?}", e);

                        // Print first few bytes of compressed data
                        println!("  First 50 bytes: {:?}", &compressed[..50.min(compressed.len())]);
                    }
                }
            }
            Err(e) => {
                println!("  ✗ Compression failed: {:?}", e);
            }
        }
    }
}
