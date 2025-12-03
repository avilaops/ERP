use avila_math::tensor::{conv4d, Conv4DConfig, Conv4DLayer, Tensor6D};
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};

fn bench_conv4d_forward(c: &mut Criterion) {
    let mut group = c.benchmark_group("conv4d_forward");

    let configs = vec![
        ("small_3x3x3x3", 1, 8, 16, [8, 8, 8, 8], [3, 3, 3, 3]),
        ("medium_3x3x3x3", 1, 16, 32, [12, 12, 12, 12], [3, 3, 3, 3]),
        ("large_kernel", 1, 8, 16, [16, 16, 16, 16], [5, 5, 5, 5]),
    ];

    for (name, batch, in_ch, out_ch, input_size, kernel_size) in configs {
        let input = Tensor6D::zeros([
            batch,
            in_ch,
            input_size[0],
            input_size[1],
            input_size[2],
            input_size[3],
        ]);
        let kernel = Tensor6D::zeros([
            out_ch,
            in_ch,
            kernel_size[0],
            kernel_size[1],
            kernel_size[2],
            kernel_size[3],
        ]);
        let config = Conv4DConfig::default();

        group.bench_with_input(BenchmarkId::new("forward", name), &name, |b, _| {
            b.iter(|| black_box(conv4d(&input, &kernel, None, &config).unwrap()))
        });
    }

    group.finish();
}

fn bench_conv4d_layer(c: &mut Criterion) {
    let mut group = c.benchmark_group("conv4d_layer");

    let input = Tensor6D::zeros([2, 8, 10, 10, 10, 10]);
    let mut layer = Conv4DLayer::new(8, 16, [3, 3, 3, 3], Conv4DConfig::default());
    layer.init_xavier();

    group.bench_function("forward_pass", |b| {
        b.iter(|| black_box(layer.forward(&input).unwrap()))
    });

    let output = layer.forward(&input).unwrap();
    let grad_output = Tensor6D::filled(output.shape, 0.1);

    group.bench_function("backward_pass", |b| {
        b.iter(|| black_box(layer.backward(&input, &grad_output).unwrap()))
    });

    group.finish();
}

fn bench_conv4d_pooling(c: &mut Criterion) {
    use avila_math::tensor::{avg_pool4d, max_pool4d};

    let mut group = c.benchmark_group("conv4d_pooling");

    let input = Tensor6D::zeros([1, 16, 16, 16, 16, 16]);
    let kernel_size = [2, 2, 2, 2];

    group.bench_function("max_pool4d", |b| {
        b.iter(|| black_box(max_pool4d(&input, kernel_size, None).unwrap()))
    });

    group.bench_function("avg_pool4d", |b| {
        b.iter(|| black_box(avg_pool4d(&input, kernel_size, None).unwrap()))
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_conv4d_forward,
    bench_conv4d_layer,
    bench_conv4d_pooling
);
criterion_main!(benches);
