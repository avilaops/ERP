use avila_async::{Runtime, RuntimeConfig, ScalingConfig, HealthStatus};
use std::time::Duration;

fn main() {
    let scaling_config = ScalingConfig {
        min_threads: 2,
        max_threads: 8,
        target_queue_length: 50,
        scale_up_threshold: 0.7,
        scale_down_threshold: 0.3,
        cooldown_period: Duration::from_secs(2),
    };

    let config = RuntimeConfig {
        num_threads: Some(4),
        enable_autoscaling: true,
        scaling_config,
        ..Default::default()
    };

    let rt = Runtime::with_config(config);

    println!("🏥 Health Monitoring System - Industry 4.0");
    println!("=========================================\n");

    rt.block_on(async move {
        // Simulate various workload conditions
        println!("📊 Phase 1: Normal Operation");
        println!("---------------------------");

        for i in 0..10 {
            rt.spawn(async move {
                avila_async::sleep(Duration::from_millis(100)).await;
            });
        }

        avila_async::sleep(Duration::from_millis(500)).await;
        print_health_status(&rt);

        println!("\n📊 Phase 2: High Load");
        println!("--------------------");

        for i in 0..50 {
            rt.spawn(async move {
                avila_async::sleep(Duration::from_millis(200)).await;
            });
        }

        avila_async::sleep(Duration::from_millis(300)).await;
        print_health_status(&rt);

        // Simulate a degraded state
        println!("\n⚠️  Phase 3: Degraded Service");
        println!("---------------------------");

        rt.health().add_check(
            "database_connection",
            HealthStatus::Degraded,
            "Connection pool at 85% capacity"
        );

        rt.health().add_check(
            "cache_latency",
            HealthStatus::Degraded,
            "Cache response time > 100ms"
        );

        print_health_status(&rt);

        // Simulate recovery
        println!("\n✅ Phase 4: Recovery");
        println!("------------------");

        rt.health().clear_checks();

        // Wait for queue to drain
        while rt.task_count() > 0 {
            avila_async::sleep(Duration::from_millis(100)).await;
        }

        print_health_status(&rt);

        println!("\n📤 Health Check JSON Export");
        println!("==========================");
        let report = rt.health().get_report();
        println!("{}", report.to_json());
    });
}

fn print_health_status(rt: &Runtime) {
    let metrics = rt.metrics().snapshot();
    let health = rt.health().get_report();

    println!("Status: {} | Ready: {} | Alive: {}",
        health.status, health.ready, health.alive);
    println!("Tasks: {} active | Queue: {} items",
        metrics.tasks_spawned - metrics.tasks_completed,
        metrics.queue_length);
    println!("Threads: {} active, {} idle",
        metrics.active_threads, metrics.idle_threads);

    if !health.checks.is_empty() {
        println!("Health Checks:");
        for check in &health.checks {
            println!("  - {} [{}]: {}", check.name, check.status, check.message);
        }
    }
}
