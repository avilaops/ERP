use avila_math::tensor::{Matrix, Tensor, Vector};
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};

fn bench_vector_ops(c: &mut Criterion) {
    let mut group = c.benchmark_group("vector_operations");

    for size in [100, 1000, 10000].iter() {
        let v1 = Vector::from_data([*size], vec![1.0; *size]).unwrap();
        let v2 = Vector::from_data([*size], vec![2.0; *size]).unwrap();

        group.bench_with_input(BenchmarkId::new("dot_product", size), size, |b, _| {
            b.iter(|| black_box(v1.dot(&v2).unwrap()))
        });

        group.bench_with_input(BenchmarkId::new("add", size), size, |b, _| {
            b.iter(|| black_box(v1.add_elementwise(&v2).unwrap()))
        });

        group.bench_with_input(BenchmarkId::new("scale", size), size, |b, _| {
            b.iter(|| black_box(v1.scale(2.5)))
        });
    }

    group.finish();
}

fn bench_matrix_ops(c: &mut Criterion) {
    let mut group = c.benchmark_group("matrix_operations");

    for size in [10, 50, 100].iter() {
        let m1 = Matrix::from_data([*size, *size], vec![1.0; size * size]).unwrap();
        let m2 = Matrix::from_data([*size, *size], vec![2.0; size * size]).unwrap();

        group.bench_with_input(BenchmarkId::new("matmul", size), size, |b, _| {
            b.iter(|| black_box(m1.matmul(&m2).unwrap()))
        });

        group.bench_with_input(BenchmarkId::new("transpose", size), size, |b, _| {
            b.iter(|| black_box(m1.transpose()))
        });

        if *size <= 50 {
            group.bench_with_input(BenchmarkId::new("hadamard", size), size, |b, _| {
                b.iter(|| black_box(m1.hadamard(&m2).unwrap()))
            });
        }
    }

    group.finish();
}

fn bench_tensor_creation(c: &mut Criterion) {
    let mut group = c.benchmark_group("tensor_creation");

    for size in [10, 50, 100].iter() {
        group.bench_with_input(BenchmarkId::new("zeros_3d", size), size, |b, _| {
            b.iter(|| black_box(Tensor::<3>::zeros([*size, *size, *size])))
        });

        group.bench_with_input(BenchmarkId::new("filled_3d", size), size, |b, _| {
            b.iter(|| black_box(Tensor::<3>::filled([*size, *size, *size], 3.14)))
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_vector_ops,
    bench_matrix_ops,
    bench_tensor_creation
);
criterion_main!(benches);
