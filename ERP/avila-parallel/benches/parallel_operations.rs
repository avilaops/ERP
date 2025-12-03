use avila_parallel::prelude::*;
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

fn bench_map(c: &mut Criterion) {
    let mut group = c.benchmark_group("map");

    for size in [1_000, 10_000, 100_000, 1_000_000].iter() {
        group.throughput(Throughput::Elements(*size as u64));

        let data: Vec<i32> = (0..*size as i32).collect();

        group.bench_with_input(BenchmarkId::new("sequential", size), size, |b, _| {
            b.iter(|| {
                let result: Vec<_> = data.iter().map(|x| black_box(x * 2)).collect();
                black_box(result)
            });
        });

        group.bench_with_input(BenchmarkId::new("parallel", size), size, |b, _| {
            b.iter(|| {
                let result = data.par_vec().map(|x| black_box(x * 2)).collect();
                black_box(result)
            });
        });
    }

    group.finish();
}

fn bench_filter(c: &mut Criterion) {
    let mut group = c.benchmark_group("filter");

    for size in [1_000, 10_000, 100_000, 1_000_000].iter() {
        group.throughput(Throughput::Elements(*size as u64));

        let data: Vec<i32> = (0..*size as i32).collect();

        group.bench_with_input(BenchmarkId::new("sequential", size), size, |b, _| {
            b.iter(|| {
                let result: Vec<_> = data.iter().filter(|x| black_box(**x % 2 == 0)).collect();
                black_box(result)
            });
        });

        group.bench_with_input(BenchmarkId::new("parallel", size), size, |b, _| {
            b.iter(|| {
                let result: Vec<&i32> = data.par_iter().filter(|x| black_box(*x % 2 == 0)).collect();
                black_box(result)
            });
        });
    }

    group.finish();
}

fn bench_sum(c: &mut Criterion) {
    let mut group = c.benchmark_group("sum");

    for size in [1_000, 10_000, 100_000, 1_000_000].iter() {
        group.throughput(Throughput::Elements(*size as u64));

        let data: Vec<i32> = (0..*size as i32).collect();

        group.bench_with_input(BenchmarkId::new("sequential", size), size, |b, _| {
            b.iter(|| {
                let result: i32 = data.iter().sum();
                black_box(result)
            });
        });

        group.bench_with_input(BenchmarkId::new("parallel", size), size, |b, _| {
            b.iter(|| {
                let result: i32 = data.par_iter().sum();
                black_box(result)
            });
        });
    }

    group.finish();
}

fn bench_complex_computation(c: &mut Criterion) {
    let mut group = c.benchmark_group("complex_computation");
    group.sample_size(10); // Reduzir amostras para operações caras

    for size in [1_000, 10_000, 100_000].iter() {
        group.throughput(Throughput::Elements(*size as u64));

        let data: Vec<i32> = (0..*size as i32).collect();

        group.bench_with_input(BenchmarkId::new("sequential", size), size, |b, _| {
            b.iter(|| {
                let result: Vec<_> = data
                    .iter()
                    .map(|&x| {
                        let mut val = x;
                        for _ in 0..100 {
                            val = black_box((val.wrapping_mul(31) + 17) % 1_000_000);
                        }
                        val
                    })
                    .collect();
                black_box(result)
            });
        });

        group.bench_with_input(BenchmarkId::new("parallel", size), size, |b, _| {
            b.iter(|| {
                let result = data
                    .par_vec()
                    .map(|&x| {
                        let mut val = x;
                        for _ in 0..100 {
                            val = black_box((val.wrapping_mul(31) + 17) % 1_000_000);
                        }
                        val
                    })
                    .collect();
                black_box(result)
            });
        });
    }

    group.finish();
}

fn bench_count(c: &mut Criterion) {
    let mut group = c.benchmark_group("count");

    for size in [1_000, 10_000, 100_000, 1_000_000].iter() {
        group.throughput(Throughput::Elements(*size as u64));

        let data: Vec<i32> = (0..*size as i32).collect();

        group.bench_with_input(BenchmarkId::new("sequential", size), size, |b, _| {
            b.iter(|| {
                let result = data.iter().filter(|x| black_box(**x % 7 == 0)).count();
                black_box(result)
            });
        });

        group.bench_with_input(BenchmarkId::new("parallel", size), size, |b, _| {
            b.iter(|| {
                let result = data.par_iter().count(|x| black_box(*x % 7 == 0));
                black_box(result)
            });
        });
    }

    group.finish();
}

fn bench_find(c: &mut Criterion) {
    let mut group = c.benchmark_group("find");

    for size in [1_000, 10_000, 100_000, 1_000_000].iter() {
        group.throughput(Throughput::Elements(*size as u64));

        let data: Vec<i32> = (0..*size as i32).collect();
        let target = *size as i32 - 1; // Buscar último elemento (pior caso)

        group.bench_with_input(BenchmarkId::new("sequential", size), size, |b, _| {
            b.iter(|| {
                let result = data.iter().find(|&&x| black_box(x == target));
                black_box(result)
            });
        });

        group.bench_with_input(BenchmarkId::new("parallel", size), size, |b, _| {
            b.iter(|| {
                use avila_parallel::executor::parallel_find;
                let result = parallel_find(&data, |x| black_box(*x == target));
                black_box(result)
            });
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_map,
    bench_filter,
    bench_sum,
    bench_complex_computation,
    bench_count,
    bench_find
);
criterion_main!(benches);
