use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use avila_arrow::compression::*;

fn bench_rle_encoding(c: &mut Criterion) {
    let mut group = c.benchmark_group("rle_encoding");

    for size in [100, 1_000, 10_000, 100_000].iter() {
        // Repeated values (best case for RLE)
        let repeated = vec![42u8; *size];

        group.bench_with_input(BenchmarkId::new("repeated", size), size, |b, _| {
            b.iter(|| {
                let encoded = rle::encode(black_box(&repeated)).unwrap();
                black_box(encoded);
            });
        });

        // Mixed values
        let mixed: Vec<u8> = (0..*size).map(|i| (i % 10) as u8).collect();

        group.bench_with_input(BenchmarkId::new("mixed", size), size, |b, _| {
            b.iter(|| {
                let encoded = rle::encode(black_box(&mixed)).unwrap();
                black_box(encoded);
            });
        });
    }

    group.finish();
}

fn bench_delta_encoding(c: &mut Criterion) {
    let mut group = c.benchmark_group("delta_encoding");

    for size in [100, 1_000, 10_000, 100_000].iter() {
        // Sequential integers (best case)
        let sequential: Vec<i64> = (0..*size as i64).collect();

        group.bench_with_input(BenchmarkId::new("sequential_i64", size), size, |b, _| {
            b.iter(|| {
                let encoded = delta::encode_i64(black_box(&sequential)).unwrap();
                black_box(encoded);
            });
        });

        // Timestamps (realistic)
        let base = 1700000000i64;
        let timestamps: Vec<i64> = (0..*size).map(|i| base + i as i64 * 1000).collect();

        group.bench_with_input(BenchmarkId::new("timestamps", size), size, |b, _| {
            b.iter(|| {
                let encoded = delta::encode_i64(black_box(&timestamps)).unwrap();
                black_box(encoded);
            });
        });

        // Float data
        let floats: Vec<f64> = (0..*size).map(|i| i as f64 * 0.1).collect();

        group.bench_with_input(BenchmarkId::new("floats", size), size, |b, _| {
            b.iter(|| {
                let encoded = delta::encode_f64(black_box(&floats)).unwrap();
                black_box(encoded);
            });
        });
    }

    group.finish();
}

fn bench_dictionary_encoding(c: &mut Criterion) {
    let mut group = c.benchmark_group("dictionary_encoding");

    for size in [100, 1_000, 10_000, 100_000].iter() {
        // Low cardinality bytes
        let low_card: Vec<u8> = (0..*size).map(|i| (i % 10) as u8).collect();

        group.bench_with_input(BenchmarkId::new("bytes", size), size, |b, _| {
            b.iter(|| {
                let encoded = dictionary::encode(black_box(&low_card)).unwrap();
                black_box(encoded);
            });
        });

        // Low cardinality i64
        let mut encoder = DictionaryEncoderI64::new();
        let values: Vec<i64> = (0..*size).map(|i| (i % 20) as i64).collect();

        group.bench_with_input(BenchmarkId::new("i64", size), size, |b, _| {
            b.iter(|| {
                let mut enc = DictionaryEncoderI64::new();
                for &v in black_box(&values) {
                    enc.encode(v);
                }
                black_box(enc.finish());
            });
        });
    }

    group.finish();
}

fn bench_bitpack_encoding(c: &mut Criterion) {
    let mut group = c.benchmark_group("bitpack_encoding");

    for size in [100, 1_000, 10_000, 100_000].iter() {
        // Small values (4 bits)
        let small: Vec<i64> = (0..*size).map(|i| (i % 16) as i64).collect();

        group.bench_with_input(BenchmarkId::new("4bit", size), size, |b, _| {
            b.iter(|| {
                let bit_width = bitpack::detect_bit_width(black_box(&small));
                let packed = bitpack::pack(black_box(&small), bit_width).unwrap();
                black_box(packed);
            });
        });

        // Medium values (8 bits)
        let medium: Vec<i64> = (0..*size).map(|i| (i % 256) as i64).collect();

        group.bench_with_input(BenchmarkId::new("8bit", size), size, |b, _| {
            b.iter(|| {
                let bit_width = bitpack::detect_bit_width(black_box(&medium));
                let packed = bitpack::pack(black_box(&medium), bit_width).unwrap();
                black_box(packed);
            });
        });
    }

    group.finish();
}

fn bench_compression_ratio(c: &mut Criterion) {
    let mut group = c.benchmark_group("compression_ratio");

    let size = 10_000;

    // Test different data patterns
    let patterns = vec![
        ("repeated", vec![42u8; size]),
        ("sequential", (0..size).map(|i| (i % 256) as u8).collect()),
        ("random", (0..size).map(|i| ((i * 31) % 256) as u8).collect()),
    ];

    for (name, data) in patterns {
        let original_size = data.len();

        // RLE
        let rle_encoded = rle::encode(&data).unwrap();
        let rle_ratio = original_size as f64 / rle_encoded.len() as f64;
        println!("{} - RLE ratio: {:.2}x ({} -> {} bytes)",
                 name, rle_ratio, original_size, rle_encoded.len());

        // Dictionary
        let dict_encoded = dictionary::encode(&data).unwrap();
        let dict_ratio = original_size as f64 / dict_encoded.len() as f64;
        println!("{} - Dictionary ratio: {:.2}x ({} -> {} bytes)",
                 name, dict_ratio, original_size, dict_encoded.len());
    }

    group.finish();
}

fn bench_roundtrip(c: &mut Criterion) {
    let mut group = c.benchmark_group("roundtrip");

    let size = 10_000;
    let data: Vec<i64> = (0..size).collect();

    // Delta roundtrip
    group.bench_function("delta_i64", |b| {
        b.iter(|| {
            let encoded = delta::encode_i64(black_box(&data)).unwrap();
            let decoded = delta::decode_i64(black_box(&encoded)).unwrap();
            black_box(decoded);
        });
    });

    // Dictionary roundtrip
    let bytes: Vec<u8> = (0..size).map(|i| (i % 10) as u8).collect();
    group.bench_function("dictionary", |b| {
        b.iter(|| {
            let encoded = dictionary::encode(black_box(&bytes)).unwrap();
            let decoded = dictionary::decode(black_box(&encoded)).unwrap();
            black_box(decoded);
        });
    });

    // Bitpack roundtrip
    group.bench_function("bitpack", |b| {
        b.iter(|| {
            let bit_width = bitpack::detect_bit_width(black_box(&data));
            let packed = bitpack::pack(black_box(&data), bit_width).unwrap();
            let unpacked = bitpack::unpack(black_box(&packed), bit_width, data.len()).unwrap();
            black_box(unpacked);
        });
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_rle_encoding,
    bench_delta_encoding,
    bench_dictionary_encoding,
    bench_bitpack_encoding,
    bench_compression_ratio,
    bench_roundtrip
);
criterion_main!(benches);
