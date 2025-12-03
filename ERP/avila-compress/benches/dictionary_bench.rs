//! Benchmark for dictionary compression

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

#[cfg(feature = "dictionary")]
use avila_compress::dictionary::Dictionary;

#[cfg(feature = "dictionary")]
fn generate_similar_data(count: usize) -> Vec<Vec<u8>> {
    (0..count)
        .map(|i| {
            format!(
                "{{\"user_id\":{},\"action\":\"login\",\"timestamp\":\"2024-01-01T12:00:00Z\",\"ip\":\"192.168.1.{}\"}}",
                i,
                i % 255
            )
            .into_bytes()
        })
        .collect()
}

#[cfg(feature = "dictionary")]
fn bench_dictionary_training(c: &mut Criterion) {
    let mut group = c.benchmark_group("dictionary_training");

    for sample_count in [10, 50, 100, 500].iter() {
        let samples = generate_similar_data(*sample_count);
        let sample_refs: Vec<&[u8]> = samples.iter().map(|s| s.as_slice()).collect();

        group.throughput(Throughput::Elements(*sample_count as u64));
        group.bench_with_input(
            BenchmarkId::from_parameter(sample_count),
            sample_count,
            |b, _| {
                b.iter(|| {
                    Dictionary::train(sample_refs.iter().copied(), black_box(4096)).unwrap()
                });
            },
        );
    }

    group.finish();
}

#[cfg(feature = "dictionary")]
fn bench_dictionary_compression(c: &mut Criterion) {
    let mut group = c.benchmark_group("dictionary_compression");

    // Train dictionary
    let samples = generate_similar_data(100);
    let sample_refs: Vec<&[u8]> = samples.iter().map(|s| s.as_slice()).collect();
    let dict = Dictionary::train(sample_refs.iter().copied(), 4096).unwrap();

    let test_data = br#"{"user_id":999,"action":"login","timestamp":"2024-01-01T13:00:00Z","ip":"192.168.1.100"}"#;

    group.throughput(Throughput::Bytes(test_data.len() as u64));
    group.bench_function("compress_with_dict", |b| {
        b.iter(|| dict.compress(black_box(test_data)).unwrap());
    });

    let compressed = dict.compress(test_data).unwrap();
    group.throughput(Throughput::Bytes(compressed.len() as u64));
    group.bench_function("decompress_with_dict", |b| {
        b.iter(|| dict.decompress(black_box(&compressed)).unwrap());
    });

    group.finish();
}

#[cfg(feature = "dictionary")]
fn bench_dictionary_sizes(c: &mut Criterion) {
    let mut group = c.benchmark_group("dictionary_sizes");

    let samples = generate_similar_data(100);
    let sample_refs: Vec<&[u8]> = samples.iter().map(|s| s.as_slice()).collect();

    for dict_size in [512, 1024, 2048, 4096, 8192].iter() {
        let dict = Dictionary::train(sample_refs.iter().copied(), *dict_size).unwrap();
        let test_data = br#"{"user_id":999,"action":"login","timestamp":"2024-01-01T13:00:00Z"}"#;

        group.throughput(Throughput::Bytes(test_data.len() as u64));
        group.bench_with_input(
            BenchmarkId::from_parameter(dict_size),
            dict_size,
            |b, _| {
                b.iter(|| dict.compress(black_box(test_data)).unwrap());
            },
        );
    }

    group.finish();
}

#[cfg(feature = "dictionary")]
fn bench_game_logs(c: &mut Criterion) {
    let mut group = c.benchmark_group("game_logs");

    // Realistic game log samples
    let log_samples = vec![
        b"[INFO] Player#12345 joined lobby #42 from IP 192.168.1.100".as_slice(),
        b"[INFO] Player#67890 joined lobby #42 from IP 192.168.1.101".as_slice(),
        b"[WARN] Player#12345 connection timeout retry 1 at 10:30:45".as_slice(),
        b"[WARN] Player#67890 connection timeout retry 1 at 10:31:12".as_slice(),
        b"[INFO] Game lobby #42 match started with 8 players at 10:35:00".as_slice(),
    ];

    let dict = Dictionary::train(log_samples.into_iter(), 4096).unwrap();

    let test_log = b"[INFO] Player#99999 joined lobby #43 from IP 192.168.1.150";

    group.throughput(Throughput::Bytes(test_log.len() as u64));
    group.bench_function("compress_game_log", |b| {
        b.iter(|| dict.compress(black_box(test_log)).unwrap());
    });

    group.finish();
}

#[cfg(feature = "dictionary")]
fn bench_sql_queries(c: &mut Criterion) {
    let mut group = c.benchmark_group("sql_queries");

    let query_samples = vec![
        b"SELECT * FROM users WHERE user_id = 12345 AND active = true".as_slice(),
        b"SELECT * FROM users WHERE user_id = 67890 AND active = true".as_slice(),
        b"SELECT username, level FROM users WHERE region = 'BR' LIMIT 100".as_slice(),
        b"UPDATE users SET last_login = NOW() WHERE user_id = 12345".as_slice(),
    ];

    let dict = Dictionary::train(query_samples.into_iter(), 8192).unwrap();

    let test_query = b"SELECT * FROM users WHERE user_id = 99999 AND active = true";

    group.throughput(Throughput::Bytes(test_query.len() as u64));
    group.bench_function("compress_sql_query", |b| {
        b.iter(|| dict.compress(black_box(test_query)).unwrap());
    });

    group.finish();
}

#[cfg(not(feature = "dictionary"))]
fn bench_dictionary_training(_c: &mut Criterion) {}

#[cfg(not(feature = "dictionary"))]
fn bench_dictionary_compression(_c: &mut Criterion) {}

#[cfg(not(feature = "dictionary"))]
fn bench_dictionary_sizes(_c: &mut Criterion) {}

#[cfg(not(feature = "dictionary"))]
fn bench_game_logs(_c: &mut Criterion) {}

#[cfg(not(feature = "dictionary"))]
fn bench_sql_queries(_c: &mut Criterion) {}

criterion_group!(
    benches,
    bench_dictionary_training,
    bench_dictionary_compression,
    bench_dictionary_sizes,
    bench_game_logs,
    bench_sql_queries
);
criterion_main!(benches);
