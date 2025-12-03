use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use aviladb::{AvilaClient, Document};

async fn setup_test_data(client: &AvilaClient, count: usize) -> aviladb::Result<()> {
    let db = client.database("bench_db");
    let collection = db.collection("users");

    for i in 0..count {
        let doc = Document::new()
            .set("userId", format!("user_{}", i))
            .set("username", format!("TestUser{}", i))
            .set("level", (i % 100) as i64)
            .set("score", (i * 10) as i64)
            .set("active", i % 2 == 0);

        collection.insert(doc).await?;
    }

    Ok(())
}

fn benchmark_queries(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    let client = rt.block_on(async {
        AvilaClient::connect("http://localhost:8000").await
            .expect("Failed to connect")
    });

    // Setup test data
    rt.block_on(async {
        setup_test_data(&client, 10000).await
            .expect("Failed to setup test data");
    });

    let mut group = c.benchmark_group("query_performance");

    // Simple query
    group.bench_function("simple_query", |b| {
        b.to_async(&rt).iter(|| async {
            let db = client.database("bench_db");
            let collection = db.collection("users");

            let results = collection
                .query("SELECT * FROM users WHERE level > @min_level")
                .param("min_level", 50)
                .execute()
                .await
                .expect("Query failed");

            black_box(results);
        });
    });

    // Complex query with multiple conditions
    group.bench_function("complex_query", |b| {
        b.to_async(&rt).iter(|| async {
            let db = client.database("bench_db");
            let collection = db.collection("users");

            let results = collection
                .query("SELECT * FROM users WHERE level > @min AND score < @max AND active = @active")
                .param("min", 30)
                .param("max", 5000)
                .param("active", true)
                .execute()
                .await
                .expect("Query failed");

            black_box(results);
        });
    });

    // Query with ORDER BY
    group.bench_function("query_with_order", |b| {
        b.to_async(&rt).iter(|| async {
            let db = client.database("bench_db");
            let collection = db.collection("users");

            let results = collection
                .query("SELECT * FROM users ORDER BY score DESC LIMIT 100")
                .execute()
                .await
                .expect("Query failed");

            black_box(results);
        });
    });

    group.finish();
}

fn benchmark_cache(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    let client = rt.block_on(async {
        AvilaClient::connect("http://localhost:8000").await
            .expect("Failed to connect")
    });

    let mut group = c.benchmark_group("cache_performance");

    // First query (cold cache)
    group.bench_function("cold_cache", |b| {
        b.to_async(&rt).iter(|| async {
            let db = client.database("bench_db");
            let collection = db.collection("users");

            let results = collection
                .query("SELECT * FROM users WHERE level = @level")
                .param("level", 42)
                .execute()
                .await
                .expect("Query failed");

            black_box(results);
        });
    });

    // Warm up cache
    rt.block_on(async {
        let db = client.database("bench_db");
        let collection = db.collection("users");

        let _ = collection
            .query("SELECT * FROM users WHERE level = @level")
            .param("level", 42)
            .execute()
            .await;
    });

    // Cached query
    group.bench_function("hot_cache", |b| {
        b.to_async(&rt).iter(|| async {
            let db = client.database("bench_db");
            let collection = db.collection("users");

            let results = collection
                .query("SELECT * FROM users WHERE level = @level")
                .param("level", 42)
                .execute()
                .await
                .expect("Query failed");

            black_box(results);
        });
    });

    group.finish();
}

fn benchmark_throughput(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    let client = rt.block_on(async {
        AvilaClient::connect("http://localhost:8000").await
            .expect("Failed to connect")
    });

    let mut group = c.benchmark_group("throughput");

    for batch_size in [10, 100, 1000].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(batch_size),
            batch_size,
            |b, &size| {
                b.to_async(&rt).iter(|| async {
                    let db = client.database("bench_db");
                    let collection = db.collection("users");

                    for i in 0..size {
                        let doc = Document::new()
                            .set("userId", format!("batch_user_{}", i))
                            .set("batchId", i);

                        collection.insert(doc).await
                            .expect("Insert failed");
                    }
                });
            },
        );
    }

    group.finish();
}

criterion_group!(benches, benchmark_queries, benchmark_cache, benchmark_throughput);
criterion_main!(benches);
