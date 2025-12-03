use avila_compress::lz4;

#[test]
fn debug_all_zeros() {
    let data = vec![0u8; 100];

    println!("Compressing {} bytes of zeros...", data.len());
    let compressed = lz4::compress(&data).unwrap();

    println!("Compressed size: {} bytes", compressed.len());
    println!("Compressed data (first 50 bytes): {:?}", &compressed[..compressed.len().min(50)]);

    // Try to decompress
    match lz4::decompress(&compressed) {
        Ok(decompressed) => {
            println!("Decompressed successfully: {} bytes", decompressed.len());
            assert_eq!(data, decompressed);
        }
        Err(e) => {
            println!("Decompression failed: {:?}", e);
            panic!("Failed to decompress");
        }
    }
}
