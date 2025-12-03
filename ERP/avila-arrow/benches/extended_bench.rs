use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use avila_arrow::simd::*;

fn benchmark_sub(c: &mut Criterion) {
    let mut group = c.benchmark_group("sub_f64");

    for size in [100, 1_000, 10_000, 100_000, 1_000_000].iter() {
        let left: Vec<f64> = (0..*size).map(|i| i as f64 * 1.5).collect();
        let right: Vec<f64> = (0..*size).map(|i| i as f64 * 0.5).collect();
        let mut result = vec![0.0; *size];

        group.bench_with_input(BenchmarkId::new("simd", size), size, |b, _| {
            b.iter(|| {
                unsafe { sub_f64_simd(black_box(&left), black_box(&right), black_box(&mut result)) }
            });
        });

        group.bench_with_input(BenchmarkId::new("scalar", size), size, |b, _| {
            b.iter(|| {
                for i in 0..*size {
                    result[i] = left[i] - right[i];
                }
                black_box(&result);
            });
        });
    }

    group.finish();
}

fn benchmark_div(c: &mut Criterion) {
    let mut group = c.benchmark_group("div_f64");

    for size in [100, 1_000, 10_000, 100_000, 1_000_000].iter() {
        let left: Vec<f64> = (0..*size).map(|i| (i + 1) as f64 * 100.0).collect();
        let right: Vec<f64> = (0..*size).map(|i| (i + 1) as f64 * 2.0).collect();
        let mut result = vec![0.0; *size];

        group.bench_with_input(BenchmarkId::new("simd", size), size, |b, _| {
            b.iter(|| {
                unsafe { div_f64_simd(black_box(&left), black_box(&right), black_box(&mut result)) }
            });
        });

        group.bench_with_input(BenchmarkId::new("scalar", size), size, |b, _| {
            b.iter(|| {
                for i in 0..*size {
                    result[i] = left[i] / right[i];
                }
                black_box(&result);
            });
        });
    }

    group.finish();
}

fn benchmark_sqrt(c: &mut Criterion) {
    let mut group = c.benchmark_group("sqrt_f64");

    for size in [100, 1_000, 10_000, 100_000, 1_000_000].iter() {
        let data: Vec<f64> = (0..*size).map(|i| (i + 1) as f64).collect();
        let mut result = vec![0.0; *size];

        group.bench_with_input(BenchmarkId::new("simd", size), size, |b, _| {
            b.iter(|| {
                unsafe { sqrt_f64_simd(black_box(&data), black_box(&mut result)) }
            });
        });

        group.bench_with_input(BenchmarkId::new("scalar", size), size, |b, _| {
            b.iter(|| {
                for i in 0..*size {
                    result[i] = data[i].sqrt();
                }
                black_box(&result);
            });
        });
    }

    group.finish();
}

fn benchmark_fma(c: &mut Criterion) {
    let mut group = c.benchmark_group("fma_f64");

    for size in [100, 1_000, 10_000, 100_000, 1_000_000].iter() {
        let a: Vec<f64> = (0..*size).map(|i| i as f64 * 2.0).collect();
        let b: Vec<f64> = (0..*size).map(|i| i as f64 * 3.0).collect();
        let c: Vec<f64> = (0..*size).map(|i| i as f64 * 0.5).collect();
        let mut result = vec![0.0; *size];

        group.bench_with_input(BenchmarkId::new("simd", size), size, |b_bench, _| {
            b_bench.iter(|| {
                unsafe { fma_f64_simd(black_box(&a), black_box(&b), black_box(&c), black_box(&mut result)) }
            });
        });

        group.bench_with_input(BenchmarkId::new("scalar", size), size, |b_bench, _| {
            b_bench.iter(|| {
                for i in 0..*size {
                    result[i] = a[i] * b[i] + c[i];
                }
                black_box(&result);
            });
        });
    }

    group.finish();
}

fn benchmark_comprehensive_pipeline(c: &mut Criterion) {
    let mut group = c.benchmark_group("comprehensive_pipeline");

    for size in [10_000, 100_000, 1_000_000].iter() {
        let data1: Vec<f64> = (0..*size).map(|i| i as f64 * 1.5).collect();
        let data2: Vec<f64> = (0..*size).map(|i| i as f64 * 2.0).collect();
        let data3: Vec<f64> = (0..*size).map(|i| i as f64 * 0.5).collect();
        let mut temp1 = vec![0.0; *size];
        let mut temp2 = vec![0.0; *size];
        let mut result = vec![0.0; *size];

        group.bench_with_input(BenchmarkId::new("simd_pipeline", size), size, |b, _| {
            b.iter(|| {
                unsafe {
                    // Pipeline: add -> mul -> fma
                    add_f64_simd(black_box(&data1), black_box(&data2), black_box(&mut temp1));
                    mul_f64_simd(black_box(&temp1), black_box(&data3), black_box(&mut temp2));
                    fma_f64_simd(black_box(&temp2), black_box(&data1), black_box(&data2), black_box(&mut result));
                }
            });
        });

        group.bench_with_input(BenchmarkId::new("scalar_pipeline", size), size, |b, _| {
            b.iter(|| {
                for i in 0..*size {
                    temp1[i] = data1[i] + data2[i];
                }
                for i in 0..*size {
                    temp2[i] = temp1[i] * data3[i];
                }
                for i in 0..*size {
                    result[i] = temp2[i] * data1[i] + data2[i];
                }
                black_box(&result);
            });
        });
    }

    group.finish();
}

fn benchmark_scientific_workload(c: &mut Criterion) {
    let mut group = c.benchmark_group("scientific_workload");

    for size in [10_000, 100_000, 1_000_000].iter() {
        let x: Vec<f64> = (0..*size).map(|i| (i as f64) / 100.0).collect();
        let y: Vec<f64> = (0..*size).map(|i| (i as f64) / 50.0).collect();
        let mut distances = vec![0.0; *size];
        let mut normalized = vec![0.0; *size];
        let mut temp1 = vec![0.0; *size];
        let mut temp2 = vec![0.0; *size];

        group.bench_with_input(BenchmarkId::new("simd_euclidean", size), size, |b, _| {
            b.iter(|| {
                unsafe {
                    // Calculate Euclidean distances: sqrt(x^2 + y^2)
                    mul_f64_simd(black_box(&x), black_box(&x), black_box(&mut temp1));
                    mul_f64_simd(black_box(&y), black_box(&y), black_box(&mut temp2));
                    add_f64_simd(black_box(&temp1), black_box(&temp2), black_box(&mut distances));
                    sqrt_f64_simd(black_box(&distances), black_box(&mut normalized));
                }
            });
        });

        group.bench_with_input(BenchmarkId::new("scalar_euclidean", size), size, |b, _| {
            b.iter(|| {
                for i in 0..*size {
                    distances[i] = (x[i] * x[i] + y[i] * y[i]).sqrt();
                }
                black_box(&distances);
            });
        });
    }

    group.finish();
}

fn benchmark_memory_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("memory_throughput");

    for size in [100_000, 1_000_000, 10_000_000].iter() {
        let data: Vec<f64> = (0..*size).map(|i| i as f64).collect();

        group.bench_with_input(BenchmarkId::new("simd_sum", size), size, |b, _| {
            b.iter(|| {
                let result = unsafe { sum_f64_simd(black_box(&data)) };
                black_box(result);
            });
        });

        group.bench_with_input(BenchmarkId::new("scalar_sum", size), size, |b, _| {
            b.iter(|| {
                let result: f64 = data.iter().sum();
                black_box(result);
            });
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    benchmark_sub,
    benchmark_div,
    benchmark_sqrt,
    benchmark_fma,
    benchmark_comprehensive_pipeline,
    benchmark_scientific_workload,
    benchmark_memory_throughput
);
criterion_main!(benches);

