use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use avila_arrow::scientific::{Quaternion, Complex64, Tensor4D};

fn bench_quaternion_ops(c: &mut Criterion) {
    let q1 = Quaternion::new(0.707, 0.707, 0.0, 0.0);
    let q2 = Quaternion::new(0.707, 0.0, 0.707, 0.0);

    c.bench_function("quaternion_multiply", |b| {
        b.iter(|| {
            black_box(q1 * q2)
        });
    });

    c.bench_function("quaternion_normalize", |b| {
        b.iter(|| {
            black_box(q1.normalize())
        });
    });

    let vector = [1.0, 2.0, 3.0];
    c.bench_function("quaternion_rotate_vector", |b| {
        b.iter(|| {
            black_box(q1.rotate_vector(vector))
        });
    });
}

fn bench_complex_ops(c: &mut Criterion) {
    let c1 = Complex64::new(3.0, 4.0);
    let c2 = Complex64::new(5.0, 6.0);

    c.bench_function("complex_multiply", |b| {
        b.iter(|| {
            black_box(c1 * c2)
        });
    });

    c.bench_function("complex_magnitude", |b| {
        b.iter(|| {
            black_box(c1.magnitude())
        });
    });

    c.bench_function("complex_phase", |b| {
        b.iter(|| {
            black_box(c1.phase())
        });
    });
}

fn bench_tensor4d_ops(c: &mut Criterion) {
    c.bench_function("tensor4d_minkowski", |b| {
        b.iter(|| {
            black_box(Tensor4D::minkowski())
        });
    });

    c.bench_function("tensor4d_schwarzschild", |b| {
        b.iter(|| {
            black_box(Tensor4D::schwarzschild_metric(1.0, 10.0))
        });
    });

    let tensor = Tensor4D::minkowski();
    c.bench_function("tensor4d_determinant", |b| {
        b.iter(|| {
            black_box(tensor.determinant())
        });
    });
}

fn bench_array_sizes(c: &mut Criterion) {
    let mut group = c.benchmark_group("quaternion_array_ops");

    for size in [100, 1000, 10000].iter() {
        group.bench_with_input(BenchmarkId::from_parameter(size), size, |b, &size| {
            let quaternions: Vec<Quaternion> = (0..size)
                .map(|i| {
                    let angle = (i as f64) * 0.01;
                    Quaternion::from_axis_angle([0.0, 0.0, 1.0], angle)
                })
                .collect();

            b.iter(|| {
                let sum: f64 = quaternions
                    .iter()
                    .map(|q| black_box(q.magnitude()))
                    .sum();
                black_box(sum)
            });
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_quaternion_ops,
    bench_complex_ops,
    bench_tensor4d_ops,
    bench_array_sizes
);
criterion_main!(benches);
