//! Benchmark for SIMD operations

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use avila_arrow::simd::*;

fn benchmark_sum(c: &mut Criterion) {
    let mut group = c.benchmark_group("sum_f64");

    for size in [100, 1000, 10000, 100000].iter() {
        let data: Vec<f64> = (0..*size).map(|i| i as f64).collect();

        group.bench_with_input(BenchmarkId::new("simd", size), &data, |b, d| {
            b.iter(|| unsafe { sum_f64_simd(black_box(d)) });
        });

        group.bench_with_input(BenchmarkId::new("scalar", size), &data, |b, d| {
            b.iter(|| d.iter().sum::<f64>());
        });
    }

    group.finish();
}

fn benchmark_add(c: &mut Criterion) {
    let mut group = c.benchmark_group("add_f64");

    for size in [100, 1000, 10000].iter() {
        let left: Vec<f64> = (0..*size).map(|i| i as f64).collect();
        let right: Vec<f64> = (0..*size).map(|i| i as f64 * 2.0).collect();
        let mut result = vec![0.0; *size];

        group.bench_with_input(BenchmarkId::new("simd", size), size, |b, _| {
            b.iter(|| unsafe {
                add_f64_simd(black_box(&left), black_box(&right), black_box(&mut result))
            });
        });

        group.bench_with_input(BenchmarkId::new("scalar", size), size, |b, _| {
            b.iter(|| {
                for i in 0..*size {
                    result[i] = left[i] + right[i];
                }
            });
        });
    }

    group.finish();
}

fn benchmark_mul(c: &mut Criterion) {
    let mut group = c.benchmark_group("mul_f64");

    for size in [100, 1000, 10000].iter() {
        let left: Vec<f64> = (0..*size).map(|i| i as f64).collect();
        let right: Vec<f64> = (0..*size).map(|i| i as f64 * 2.0).collect();
        let mut result = vec![0.0; *size];

        group.bench_with_input(BenchmarkId::new("simd", size), size, |b, _| {
            b.iter(|| unsafe {
                mul_f64_simd(black_box(&left), black_box(&right), black_box(&mut result))
            });
        });

        group.bench_with_input(BenchmarkId::new("scalar", size), size, |b, _| {
            b.iter(|| {
                for i in 0..*size {
                    result[i] = left[i] * right[i];
                }
            });
        });
    }

    group.finish();
}

criterion_group!(benches, benchmark_sum, benchmark_add, benchmark_mul);
criterion_main!(benches);
