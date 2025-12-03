//! Benchmark comparativo de compressão
//!
//! Compara diferentes níveis e métodos de compressão

use avila_compress::{compress, decompress, compress_with_level, Level};
use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId, Throughput};

fn generate_test_data(size: usize, compressibility: f32) -> Vec<u8> {
    use rand::{Rng, SeedableRng};
    let mut rng = rand::rngs::StdRng::seed_from_u64(42);

    let mut data = Vec::with_capacity(size);
    let repeat_len = (compressibility * 256.0) as usize;

    for _ in 0..size {
        data.push(rng.gen::<u8>() % repeat_len as u8);
    }

    data
}

fn benchmark_compression_levels(c: &mut Criterion) {
    let sizes = [1024, 4096, 16384, 65536, 262144, 1048576]; // 1KB to 1MB

    for &size in &sizes {
        let data = generate_test_data(size, 0.7); // 70% compressibility

        let mut group = c.benchmark_group(format!("compress_{}_bytes", size));
        group.throughput(Throughput::Bytes(size as u64));

        // Fast
        group.bench_function("fast", |b| {
            b.iter(|| {
                let compressed = compress_with_level(black_box(&data), Level::Fast).unwrap();
                black_box(compressed);
            });
        });

        // Balanced
        group.bench_function("balanced", |b| {
            b.iter(|| {
                let compressed = compress_with_level(black_box(&data), Level::Balanced).unwrap();
                black_box(compressed);
            });
        });

        // Best
        group.bench_function("best", |b| {
            b.iter(|| {
                let compressed = compress_with_level(black_box(&data), Level::Best).unwrap();
                black_box(compressed);
            });
        });

        group.finish();
    }
}

fn benchmark_decompression(c: &mut Criterion) {
    let sizes = [1024, 16384, 262144, 1048576];

    for &size in &sizes {
        let data = generate_test_data(size, 0.7);
        let compressed = compress(&data).unwrap();

        let mut group = c.benchmark_group(format!("decompress_{}_bytes", size));
        group.throughput(Throughput::Bytes(size as u64));

        group.bench_function("decompress", |b| {
            b.iter(|| {
                let decompressed = decompress(black_box(&compressed)).unwrap();
                black_box(decompressed);
            });
        });

        group.finish();
    }
}

fn benchmark_compressibility(c: &mut Criterion) {
    let size = 65536; // 64 KB
    let ratios = [0.1, 0.3, 0.5, 0.7, 0.9];

    let mut group = c.benchmark_group("compressibility");
    group.throughput(Throughput::Bytes(size as u64));

    for &ratio in &ratios {
        let data = generate_test_data(size, ratio);

        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{}%", (ratio * 100.0) as u32)),
            &data,
            |b, data| {
                b.iter(|| {
                    let compressed = compress(black_box(data)).unwrap();
                    black_box(compressed);
                });
            },
        );
    }

    group.finish();
}

#[cfg(feature = "parallel")]
fn benchmark_parallel(c: &mut Criterion) {
    use avila_compress::parallel::{parallel_compress, parallel_decompress};

    let sizes = [1048576, 4194304, 16777216]; // 1MB, 4MB, 16MB

    for &size in &sizes {
        let data = generate_test_data(size, 0.7);

        let mut group = c.benchmark_group(format!("parallel_{}_bytes", size));
        group.throughput(Throughput::Bytes(size as u64));

        // Serial
        group.bench_function("serial", |b| {
            b.iter(|| {
                let compressed = compress(black_box(&data)).unwrap();
                black_box(compressed);
            });
        });

        // Parallel
        group.bench_function("parallel", |b| {
            b.iter(|| {
                let compressed = parallel_compress(black_box(&data), Level::Fast).unwrap();
                black_box(compressed);
            });
        });

        group.finish();
    }
}

fn benchmark_round_trip(c: &mut Criterion) {
    let sizes = [4096, 65536, 1048576];

    for &size in &sizes {
        let data = generate_test_data(size, 0.7);

        let mut group = c.benchmark_group(format!("round_trip_{}_bytes", size));
        group.throughput(Throughput::Bytes(size as u64));

        group.bench_function("compress+decompress", |b| {
            b.iter(|| {
                let compressed = compress(black_box(&data)).unwrap();
                let decompressed = decompress(&compressed).unwrap();
                black_box(decompressed);
            });
        });

        group.finish();
    }
}

#[cfg(feature = "parallel")]
criterion_group!(
    benches,
    benchmark_compression_levels,
    benchmark_decompression,
    benchmark_compressibility,
    benchmark_parallel,
    benchmark_round_trip
);

#[cfg(not(feature = "parallel"))]
criterion_group!(
    benches,
    benchmark_compression_levels,
    benchmark_decompression,
    benchmark_compressibility,
    benchmark_round_trip
);

criterion_main!(benches);
