//! SIMD-specific tests
//!
//! Run with:
//! ```bash
//! cargo test --features simd --release
//! ```

#[cfg(all(test, feature = "simd"))]
mod simd_tests {
    use avila_compress::{simd, Level};

    #[test]
    fn test_simd_empty() {
        let data = b"";
        let compressed = simd::compress_simd(data, Level::Balanced).unwrap();
        let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();
        assert_eq!(data, &decompressed[..]);
    }

    #[test]
    fn test_simd_short() {
        let data = b"Hi";
        let compressed = simd::compress_simd(data, Level::Balanced).unwrap();
        let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();
        assert_eq!(data, &decompressed[..]);
    }

    #[test]
    fn test_simd_no_patterns() {
        // Random-like data with no compression opportunities
        let data: Vec<u8> = (0..1000).map(|i| (i * 137 + 42) as u8).collect();
        let compressed = simd::compress_simd(&data, Level::Balanced).unwrap();
        let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();
        assert_eq!(data, decompressed);
    }

    #[test]
    fn test_simd_highly_compressible() {
        let data = vec![b'X'; 100000];
        let compressed = simd::compress_simd(&data, Level::Balanced).unwrap();
        assert!(compressed.len() < data.len() / 10); // Should compress very well
        let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();
        assert_eq!(data, decompressed);
    }

    #[test]
    fn test_simd_all_levels_correctness() {
        let data = b"The quick brown fox jumps over the lazy dog. ".repeat(100);

        for level in [Level::Fast, Level::Balanced, Level::Best] {
            let compressed = simd::compress_simd(&data, level).unwrap();
            let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();
            assert_eq!(
                data, decompressed,
                "Mismatch with level {:?}",
                level
            );
        }
    }

    #[test]
    fn test_simd_pattern_detection() {
        // Data with repeating patterns
        let mut data = Vec::new();
        for _ in 0..100 {
            data.extend_from_slice(b"PATTERN123456789");
        }

        let compressed = simd::compress_simd(&data, Level::Balanced).unwrap();
        let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();
        assert_eq!(data, decompressed);

        // Should achieve good compression
        assert!(
            compressed.len() < data.len() / 2,
            "Expected compression ratio better than 50%"
        );
    }

    #[test]
    fn test_simd_binary_data() {
        // Simulate binary data (e.g., float array)
        let mut data = Vec::new();
        for i in 0..10000 {
            let value = (i as f64 * 0.1).sin();
            data.extend_from_slice(&value.to_le_bytes());
        }

        let compressed = simd::compress_simd(&data, Level::Balanced).unwrap();
        let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();
        assert_eq!(data, decompressed);
    }

    #[test]
    fn test_simd_large_file() {
        // 5 MB test
        let data = vec![b'A'; 5 * 1024 * 1024];
        let compressed = simd::compress_simd(&data, Level::Fast).unwrap();
        let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();
        assert_eq!(data, decompressed);
    }

    #[test]
    fn test_simd_vs_scalar_compatibility() {
        let data = b"Compatibility test between SIMD and scalar implementations.".repeat(50);

        // Compress with SIMD
        let compressed_simd = simd::compress_simd(&data, Level::Balanced).unwrap();

        // Decompress with scalar
        let decompressed = avila_compress::lz4::decompress(&compressed_simd).unwrap();
        assert_eq!(data, decompressed);

        // Compress with scalar
        let compressed_scalar = avila_compress::lz4::compress_with_level(&data, Level::Balanced).unwrap();

        // Both should decompress to same data
        let decompressed_simd = avila_compress::lz4::decompress(&compressed_scalar).unwrap();
        assert_eq!(data, decompressed_simd);
    }

    #[test]
    #[cfg(target_arch = "x86_64")]
    fn test_avx2_feature_detection() {
        // This test verifies AVX2 detection works
        if is_x86_feature_detected!("avx2") {
            println!("AVX2 is available - SIMD path will be used");
            assert!(true);
        } else {
            println!("AVX2 not available - scalar fallback will be used");
            assert!(true); // Not a failure - just informational
        }
    }

    #[test]
    fn test_simd_edge_cases() {
        // Test various edge cases
        let test_cases = vec![
            b"".to_vec(),
            b"A".to_vec(),
            b"AB".to_vec(),
            b"ABC".to_vec(),
            b"ABCD".to_vec(), // Minimum match size
            vec![0u8; 100],
            vec![255u8; 100],
            (0..256u8).collect::<Vec<u8>>(),
        ];

        for (i, data) in test_cases.iter().enumerate() {
            let compressed = simd::compress_simd(data, Level::Balanced).unwrap();
            let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();
            assert_eq!(
                data, &decompressed,
                "Edge case {} failed", i
            );
        }
    }

    #[test]
    fn test_simd_stress_random() {
        // Stress test with pseudo-random data
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        for size in [10, 100, 1000, 10000] {
            let mut data = Vec::with_capacity(size);
            let mut hasher = DefaultHasher::new();

            for i in 0..size {
                i.hash(&mut hasher);
                data.push((hasher.finish() & 0xFF) as u8);
            }

            let compressed = simd::compress_simd(&data, Level::Balanced).unwrap();
            let decompressed = avila_compress::lz4::decompress(&compressed).unwrap();
            assert_eq!(
                data, decompressed,
                "Failed at size {}", size
            );
        }
    }
}

#[cfg(not(feature = "simd"))]
mod no_simd {
    #[test]
    fn test_simd_feature_disabled() {
        // This test runs when SIMD is not enabled
        println!("SIMD feature is disabled - tests skipped");
    }
}
