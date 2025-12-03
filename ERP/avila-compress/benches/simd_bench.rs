use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use avila_compress::{Level};

#[cfg(feature = "simd")]
use avila_compress::simd;

fn generate_test_data(size: usize, pattern: &str) -> Vec<u8> {
    match pattern {
        "random" => (0..size).map(|i| ((i * 137 + 42) as u8)).collect(),
        "repetitive" => vec![b'A'; size],
        "text" => {
            let text = b"The quick brown fox jumps over the lazy dog. ";
            text.iter()
                .cycle()
                .take(size)
                .copied()
                .collect()
        }
        "binary" => {
            let mut data = Vec::with_capacity(size);
            for i in 0..(size / 8) {
                let value = (i as f64 * 0.1).sin();
                data.extend_from_slice(&value.to_le_bytes());
            }
            data.truncate(size);
            data
        }
        _ => vec![0u8; size],
    }
}

fn bench_scalar_vs_simd(c: &mut Criterion) {
    let mut group = c.benchmark_group("scalar_vs_simd");

    let sizes = vec![
        1024,           // 1 KB
        10 * 1024,      // 10 KB
        100 * 1024,     // 100 KB
        1024 * 1024,    // 1 MB
    ];

    for size in sizes {
        let data = generate_test_data(size, "text");
        group.throughput(Throughput::Bytes(size as u64));

        // Scalar benchmark
        group.bench_with_input(
            BenchmarkId::new("scalar", size),
            &data,
            |b, data| {
                b.iter(|| {
                    avila_compress::lz4::compress_with_level(
                        black_box(data),
                        black_box(Level::Balanced),
                    )
                })
            },
        );

        // SIMD benchmark (if enabled)
        #[cfg(feature = "simd")]
        group.bench_with_input(
            BenchmarkId::new("simd", size),
            &data,
            |b, data| {
                b.iter(|| {
                    simd::compress_simd(
                        black_box(data),
                        black_box(Level::Balanced),
                    )
                })
            },
        );
    }

    group.finish();
}

fn bench_simd_data_types(c: &mut Criterion) {
    #[cfg(feature = "simd")]
    {
        let mut group = c.benchmark_group("simd_data_types");
        let size = 1024 * 1024; // 1 MB

        for pattern in &["random", "repetitive", "text", "binary"] {
            let data = generate_test_data(size, pattern);
            group.throughput(Throughput::Bytes(size as u64));

            group.bench_with_input(
                BenchmarkId::new("simd", pattern),
                &data,
                |b, data| {
                    b.iter(|| {
                        simd::compress_simd(
                            black_box(data),
                            black_box(Level::Balanced),
                        )
                    })
                },
            );
        }

        group.finish();
    }
}

fn bench_simd_levels(c: &mut Criterion) {
    #[cfg(feature = "simd")]
    {
        let mut group = c.benchmark_group("simd_levels");
        let data = generate_test_data(1024 * 1024, "text");
        group.throughput(Throughput::Bytes(data.len() as u64));

        for level in [Level::Fast, Level::Balanced, Level::Best] {
            group.bench_with_input(
                BenchmarkId::new("simd", format!("{:?}", level)),
                &data,
                |b, data| {
                    b.iter(|| {
                        simd::compress_simd(
                            black_box(data),
                            black_box(level),
                        )
                    })
                },
            );
        }

        group.finish();
    }
}

criterion_group!(
    benches,
    bench_scalar_vs_simd,
    bench_simd_data_types,
    bench_simd_levels
);
criterion_main!(benches);
