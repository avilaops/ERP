use avila_async::{Runtime, TraceContext};
use std::time::Duration;

async fn process_order(ctx: &TraceContext, order_id: u64) {
    let mut span = ctx.child_span("process_order");
    span.set_attribute("order_id", order_id.to_string());
    span.add_event("order_received");

    // Simulate order validation
    avila_async::sleep(Duration::from_millis(50)).await;
    span.add_event("order_validated");

    // Simulate payment processing
    avila_async::sleep(Duration::from_millis(100)).await;
    span.add_event("payment_processed");

    // Simulate fulfillment
    avila_async::sleep(Duration::from_millis(75)).await;
    span.add_event("order_fulfilled");

    println!("✅ Order {} processed", order_id);

    let completed_span = span.end();
    println!("   {}", completed_span);
}

async fn process_batch(ctx: &TraceContext, batch_id: u64, orders: Vec<u64>) {
    let mut span = ctx.child_span(format!("process_batch_{}", batch_id));
    span.set_attribute("batch_id", batch_id.to_string());
    span.set_attribute("order_count", orders.len().to_string());

    for order_id in orders {
        process_order(ctx, order_id).await;
    }

    let completed_span = span.end();
    println!("📦 Batch {} completed: {}", batch_id, completed_span);
}

fn main() {
    let rt = Runtime::new();

    println!("🔍 Distributed Tracing Demo - Industry 4.0");
    println!("=========================================\n");

    rt.block_on(async move {
        let ctx = TraceContext::new("order-processing-service");

        println!("Trace ID: {:016x}", ctx.trace_id);
        println!("Starting order processing...\n");

        // Process multiple batches
        let batch1 = vec![1001, 1002, 1003];
        let batch2 = vec![2001, 2002];

        process_batch(&ctx, 1, batch1).await;
        println!();
        process_batch(&ctx, 2, batch2).await;
        println!();

        // Export trace data
        println!("📤 Jaeger Trace Export");
        println!("=====================");
        println!("{}", rt.tracer().to_jaeger_json());
    });
}
