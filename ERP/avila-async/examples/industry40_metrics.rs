use avila_async::{Runtime, RuntimeConfig};
use std::time::Duration;

fn main() {
    // Create runtime with Industry 4.0 features
    let config = RuntimeConfig {
        num_threads: Some(4),
        enable_autoscaling: false,
        ..Default::default()
    };

    let rt = Runtime::with_config(config);

    println!("🏭 Industry 4.0 Metrics Dashboard");
    println!("================================\n");

    rt.block_on(async move {
        // Spawn multiple tasks to generate metrics
        for i in 0..20 {
            rt.spawn(async move {
                avila_async::sleep(Duration::from_millis(50 * (i % 5) as u64)).await;
                // Simulate work
            });
        }

        // Monitor metrics in real-time
        for iteration in 0..5 {
            avila_async::sleep(Duration::from_millis(200)).await;

            let snapshot = rt.metrics().snapshot();
            let health = rt.health().get_report();

            println!("📊 Iteration {}", iteration + 1);
            println!("   {}", snapshot);
            println!("   Health: {} | Ready: {} | Alive: {}",
                health.status, health.ready, health.alive);
            println!();
        }

        // Wait for all tasks to complete
        while rt.task_count() > 0 {
            avila_async::sleep(Duration::from_millis(50)).await;
        }

        println!("📈 Final Metrics Report");
        println!("=====================");
        let final_snapshot = rt.metrics().snapshot();
        println!("{}", final_snapshot);
        println!();

        println!("🏥 Health Check Report");
        println!("====================");
        let health_report = rt.health().get_report();
        println!("{}", health_report);
        println!();

        println!("📤 Prometheus Export");
        println!("===================");
        println!("{}", rt.metrics().to_prometheus());
    });
}
