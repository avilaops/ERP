//! Compression benchmarks for AvilaDB
//!
//! Run with: cargo bench --bench compression_bench

use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};
use aviladb::compression::{compress, decompress, CompressionLevel};

fn generate_test_data(size: usize, pattern: &str) -> Vec<u8> {
    match pattern {
        "random" => {
            use rand::Rng;
            let mut rng = rand::thread_rng();
            (0..size).map(|_| rng.gen()).collect()
        }
        "repetitive" => "ABCD".repeat(size / 4).into_bytes(),
        "json" => {
            let json = r#"{"userId":"user123","name":"João Silva","level":42,"active":true}"#;
            json.repeat(size / json.len()).into_bytes()
        }
        _ => vec![0u8; size],
    }
}

fn bench_compression(c: &mut Criterion) {
    let sizes = [1024, 10 * 1024, 100 * 1024, 1024 * 1024]; // 1KB, 10KB, 100KB, 1MB

    for &size in &sizes {
        let mut group = c.benchmark_group(format!("compress_{}", size));
        group.throughput(Throughput::Bytes(size as u64));

        // LZ4 compression (fast)
        let data = generate_test_data(size, "json");
        group.bench_function("lz4_fast", |b| {
            b.iter(|| compress(black_box(&data), CompressionLevel::Fast))
        });

        // LZ4 compression (balanced)
        group.bench_function("lz4_balanced", |b| {
            b.iter(|| compress(black_box(&data), CompressionLevel::Balanced))
        });

        // Zstd compression (best)
        group.bench_function("zstd_best", |b| {
            b.iter(|| compress(black_box(&data), CompressionLevel::Best))
        });

        group.finish();
    }
}

fn bench_decompression(c: &mut Criterion) {
    let size = 100 * 1024; // 100KB
    let data = generate_test_data(size, "json");

    let mut group = c.benchmark_group("decompress");
    group.throughput(Throughput::Bytes(size as u64));

    // Compress once
    let lz4_compressed = compress(&data, CompressionLevel::Fast).unwrap();
    let zstd_compressed = compress(&data, CompressionLevel::Best).unwrap();

    group.bench_function("lz4", |b| {
        b.iter(|| decompress(black_box(&lz4_compressed)))
    });

    group.bench_function("zstd", |b| {
        b.iter(|| decompress(black_box(&zstd_compressed)))
    });

    group.finish();
}

fn bench_compression_ratio(c: &mut Criterion) {
    let size = 100 * 1024; // 100KB

    let mut group = c.benchmark_group("compression_ratio");

    for pattern in &["random", "repetitive", "json"] {
        let data = generate_test_data(size, pattern);
        group.bench_function(pattern, |b| {
            b.iter(|| {
                let compressed = compress(black_box(&data), CompressionLevel::Balanced).unwrap();
                let ratio = data.len() as f64 / compressed.len() as f64;
                black_box(ratio)
            })
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_compression,
    bench_decompression,
    bench_compression_ratio
);
criterion_main!(benches);
