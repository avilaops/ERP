//! Query performance benchmarks for AvilaDB
//!
//! Run with: cargo bench --bench query_bench

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use aviladb::{AvilaClient, Document};

fn bench_document_creation(c: &mut Criterion) {
    let mut group = c.benchmark_group("document_creation");

    group.bench_function("simple", |b| {
        b.iter(|| {
            Document::new()
                .set("id", "test123")
                .set("value", 42)
        })
    });

    group.bench_function("complex", |b| {
        b.iter(|| {
            Document::new()
                .set("userId", "user123")
                .set("name", "João Silva")
                .set("level", 42)
                .set("inventory", vec!["sword", "shield", "potion"])
                .set("stats", serde_json::json!({
                    "hp": 100,
                    "mp": 50,
                    "attack": 25
                }))
        })
    });

    group.finish();
}

fn bench_document_serialization(c: &mut Criterion) {
    let doc = Document::new()
        .set("userId", "user123")
        .set("name", "João Silva")
        .set("level", 42)
        .set("active", true);

    let mut group = c.benchmark_group("serialization");

    group.bench_function("to_json", |b| {
        b.iter(|| doc.to_json())
    });

    group.bench_function("size_bytes", |b| {
        b.iter(|| doc.size_bytes())
    });

    group.finish();
}

fn bench_batch_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("batch_operations");

    for size in [10, 100, 1000] {
        group.bench_with_input(BenchmarkId::from_parameter(size), &size, |b, &size| {
            b.iter(|| {
                let docs: Vec<Document> = (0..size)
                    .map(|i| {
                        Document::new()
                            .set("id", format!("doc_{}", i))
                            .set("value", i)
                    })
                    .collect();
                black_box(docs)
            })
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_document_creation,
    bench_document_serialization,
    bench_batch_operations
);
criterion_main!(benches);
