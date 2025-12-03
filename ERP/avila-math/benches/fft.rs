use avila_math::signal::{fft_1d, fft_2d, fft_3d, fft_4d, ifft_1d};
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};

fn bench_fft_1d(c: &mut Criterion) {
    let mut group = c.benchmark_group("fft_1d");

    for size in [128, 256, 512, 1024, 2048].iter() {
        let signal = vec![1.0; *size];

        group.bench_with_input(BenchmarkId::new("forward", size), size, |b, _| {
            b.iter(|| black_box(fft_1d(&signal)))
        });

        let spectrum = fft_1d(&signal);
        group.bench_with_input(BenchmarkId::new("inverse", size), size, |b, _| {
            b.iter(|| black_box(ifft_1d(&spectrum)))
        });
    }

    group.finish();
}

fn bench_fft_2d(c: &mut Criterion) {
    let mut group = c.benchmark_group("fft_2d");

    for size in [32, 64, 128].iter() {
        let signal = vec![vec![1.0; *size]; *size];

        group.bench_with_input(BenchmarkId::new("forward", size), size, |b, _| {
            b.iter(|| black_box(fft_2d(&signal)))
        });
    }

    group.finish();
}

fn bench_fft_3d(c: &mut Criterion) {
    let mut group = c.benchmark_group("fft_3d");

    for size in [16, 32, 64].iter() {
        let signal = vec![vec![vec![1.0; *size]; *size]; *size];

        group.bench_with_input(BenchmarkId::new("forward", size), size, |b, _| {
            b.iter(|| black_box(fft_3d(&signal)))
        });
    }

    group.finish();
}

fn bench_fft_4d(c: &mut Criterion) {
    let mut group = c.benchmark_group("fft_4d");

    for size in [8, 16, 32].iter() {
        let signal = vec![vec![vec![vec![1.0; *size]; *size]; *size]; *size];

        group.bench_with_input(BenchmarkId::new("forward", size), size, |b, _| {
            b.iter(|| black_box(fft_4d(&signal)))
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_fft_1d,
    bench_fft_2d,
    bench_fft_3d,
    bench_fft_4d
);
criterion_main!(benches);
