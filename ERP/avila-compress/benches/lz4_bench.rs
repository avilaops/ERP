//! Comprehensive benchmark suite for avila-compress
//!
//! Run with:
//! ```bash
//! cargo bench
//! ```
//!
//! View results:
//! ```bash
//! open target/criterion/report/index.html
//! ```

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId, Throughput};
use avila_compress::{lz4, Level};

#[cfg(feature = "parallel")]
use avila_compress::parallel;

fn compress_benchmark(c: &mut Criterion) {
    let mut group = c.benchmark_group("lz4_compress");

    // Different data sizes
    for size in [1_000, 10_000, 100_000, 1_000_000].iter() {
        group.throughput(Throughput::Bytes(*size as u64));

        // Repetitive data (compresses well)
        let repetitive = vec![b'A'; *size];
        group.bench_with_input(
            BenchmarkId::new("repetitive", size),
            &repetitive,
            |b, data| {
                b.iter(|| lz4::compress(black_box(data)).unwrap());
            },
        );

        // Random data (compresses poorly)
        let random: Vec<u8> = (0..*size).map(|i| ((i * 17) % 256) as u8).collect();
        group.bench_with_input(
            BenchmarkId::new("random", size),
            &random,
            |b, data| {
                b.iter(|| lz4::compress(black_box(data)).unwrap());
            },
        );

        // Text-like data (realistic)
        let text = "The quick brown fox jumps over the lazy dog. ".repeat(*size / 46);
        group.bench_with_input(
            BenchmarkId::new("text", size),
            &text.as_bytes(),
            |b, data| {
                b.iter(|| lz4::compress(black_box(data)).unwrap());
            },
        );
    }

    group.finish();
}

fn compress_levels_benchmark(c: &mut Criterion) {
    let mut group = c.benchmark_group("lz4_compression_levels");

    let size = 100_000;
    group.throughput(Throughput::Bytes(size as u64));

    let data = "The quick brown fox jumps over the lazy dog. ".repeat(size / 46);
    let data_bytes = data.as_bytes();

    group.bench_function("fast", |b| {
        b.iter(|| lz4::compress_with_level(black_box(data_bytes), Level::Fast).unwrap());
    });

    group.bench_function("balanced", |b| {
        b.iter(|| lz4::compress_with_level(black_box(data_bytes), Level::Balanced).unwrap());
    });

    group.bench_function("best", |b| {
        b.iter(|| lz4::compress_with_level(black_box(data_bytes), Level::Best).unwrap());
    });

    group.finish();
}

fn decompress_benchmark(c: &mut Criterion) {
    let mut group = c.benchmark_group("lz4_decompress");

    for size in [1_000, 10_000, 100_000, 1_000_000].iter() {
        group.throughput(Throughput::Bytes(*size as u64));

        // Prepare compressed data
        let data = vec![b'A'; *size];
        let compressed = lz4::compress(&data).unwrap();

        group.bench_with_input(
            BenchmarkId::new("repetitive", size),
            &compressed,
            |b, data| {
                b.iter(|| lz4::decompress(black_box(data)).unwrap());
            },
        );

        // Random data
        let random: Vec<u8> = (0..*size).map(|i| ((i * 17) % 256) as u8).collect();
        let compressed = lz4::compress(&random).unwrap();
        group.bench_with_input(
            BenchmarkId::new("random", size),
            &compressed,
            |b, data| {
                b.iter(|| lz4::decompress(black_box(data)).unwrap());
            },
        );
    }

    group.finish();
}

#[cfg(feature = "parallel")]
fn parallel_benchmark(c: &mut Criterion) {
    let mut group = c.benchmark_group("parallel_compression");

    let size = 1_000_000; // 1 MB
    group.throughput(Throughput::Bytes(size as u64));

    let data = vec![b'X'; size];

    // Compare thread counts
    for threads in [1, 2, 4, 8] {
        group.bench_with_input(
            BenchmarkId::new("compress", threads),
            &threads,
            |b, &threads| {
                b.iter(|| parallel::compress_parallel(black_box(&data), threads).unwrap());
            },
        );
    }

    // Prepare compressed data for decompression benchmark
    let compressed = parallel::compress_parallel(&data, 8).unwrap();

    for threads in [1, 2, 4, 8] {
        group.bench_with_input(
            BenchmarkId::new("decompress", threads),
            &threads,
            |b, &threads| {
                b.iter(|| parallel::decompress_parallel(black_box(&compressed), threads).unwrap());
            },
        );
    }

    group.finish();
}

fn round_trip_benchmark(c: &mut Criterion) {
    let mut group = c.benchmark_group("lz4_round_trip");

    for size in [1_000, 10_000, 100_000].iter() {
        group.throughput(Throughput::Bytes(*size as u64));

        let data = vec![b'A'; *size];
        group.bench_with_input(
            BenchmarkId::new("compress_decompress", size),
            &data,
            |b, data| {
                b.iter(|| {
                    let compressed = lz4::compress(black_box(data)).unwrap();
                    lz4::decompress(black_box(&compressed)).unwrap()
                });
            },
        );
    }

    group.finish();
}

fn checksum_benchmark(c: &mut Criterion) {
    use avila_compress::checksum;

    let mut group = c.benchmark_group("checksums");

    for size in [1_000, 10_000, 100_000, 1_000_000].iter() {
        group.throughput(Throughput::Bytes(*size as u64));

        let data = vec![b'X'; *size];

        group.bench_with_input(
            BenchmarkId::new("xxhash64", size),
            &data,
            |b, data| {
                b.iter(|| checksum::xxhash64(black_box(data), 0));
            },
        );

        group.bench_with_input(
            BenchmarkId::new("crc32", size),
            &data,
            |b, data| {
                b.iter(|| checksum::crc32(black_box(data)));
            },
        );
    }

    group.finish();
}

#[cfg(feature = "parallel")]
criterion_group!(
    benches,
    compress_benchmark,
    compress_levels_benchmark,
    decompress_benchmark,
    parallel_benchmark,
    round_trip_benchmark,
    checksum_benchmark
);

#[cfg(not(feature = "parallel"))]
criterion_group!(
    benches,
    compress_benchmark,
    compress_levels_benchmark,
    decompress_benchmark,
    round_trip_benchmark,
    checksum_benchmark
);

criterion_main!(benches);
