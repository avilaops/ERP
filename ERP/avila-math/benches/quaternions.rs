use avila_math::geometry::{DualQuat, Quat3D, SO4Rotation};
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::f64::consts::PI;

fn bench_quaternion_ops(c: &mut Criterion) {
    let mut group = c.benchmark_group("quaternion_operations");

    let q1 = Quat3D::from_axis_angle([0.0, 0.0, 1.0], PI / 4.0);
    let q2 = Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 3.0);
    let v = [1.0, 2.0, 3.0];

    group.bench_function("multiply", |b| b.iter(|| black_box(q1.multiply(&q2))));

    group.bench_function("rotate_vector", |b| {
        b.iter(|| black_box(q1.rotate_vector(v)))
    });

    group.bench_function("normalize", |b| b.iter(|| black_box(q1.normalize())));

    group.bench_function("conjugate", |b| b.iter(|| black_box(q1.conjugate())));

    group.bench_function("inverse", |b| b.iter(|| black_box(q1.inverse())));

    group.finish();
}

fn bench_quaternion_slerp(c: &mut Criterion) {
    let mut group = c.benchmark_group("quaternion_slerp");

    let q1 = Quat3D::from_axis_angle([0.0, 0.0, 1.0], 0.0);
    let q2 = Quat3D::from_axis_angle([0.0, 0.0, 1.0], PI);

    for t in [0.0, 0.25, 0.5, 0.75, 1.0].iter() {
        group.bench_with_input(format!("slerp_t_{}", t), t, |b, &t| {
            b.iter(|| black_box(q1.slerp(&q2, t)))
        });
    }

    group.finish();
}

fn bench_dual_quaternions(c: &mut Criterion) {
    let mut group = c.benchmark_group("dual_quaternions");

    let q_real = Quat3D::from_axis_angle([0.0, 0.0, 1.0], PI / 4.0);
    let q_dual = Quat3D::new(0.0, 1.0, 2.0, 3.0);
    let dq = DualQuat::new(q_real, q_dual);
    let point = [1.0, 2.0, 3.0];

    group.bench_function("transform_point", |b| {
        b.iter(|| black_box(dq.transform_point(point)))
    });

    group.bench_function("normalize", |b| b.iter(|| black_box(dq.normalize())));

    group.finish();
}

fn bench_so4_rotation(c: &mut Criterion) {
    let mut group = c.benchmark_group("so4_rotation");

    let q_left = Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 6.0);
    let q_right = Quat3D::from_axis_angle([0.0, 1.0, 0.0], PI / 4.0);
    let so4 = SO4Rotation::from_quaternions(q_left, q_right);
    let v4 = [1.0, 0.0, 0.0, 0.0];

    group.bench_function("rotate_vector_4d", |b| {
        b.iter(|| black_box(so4.rotate_vector_4d(v4)))
    });

    group.bench_function("compose", |b| b.iter(|| black_box(so4.compose(&so4))));

    group.finish();
}

criterion_group!(
    benches,
    bench_quaternion_ops,
    bench_quaternion_slerp,
    bench_dual_quaternions,
    bench_so4_rotation
);
criterion_main!(benches);
