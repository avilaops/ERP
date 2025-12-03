use avila_async::{Runtime, RuntimeConfig, ScalingConfig, ResourceLimits};
use std::time::Duration;

fn main() {
    let scaling_config = ScalingConfig {
        min_threads: 2,
        max_threads: 12,
        target_queue_length: 100,
        scale_up_threshold: 0.75,
        scale_down_threshold: 0.25,
        cooldown_period: Duration::from_secs(3),
    };

    let resource_limits = ResourceLimits {
        max_queue_size: Some(500),
        max_task_duration: Some(Duration::from_secs(60)),
        ..Default::default()
    };

    let config = RuntimeConfig {
        num_threads: Some(4),
        enable_autoscaling: true,
        scaling_config,
        resource_limits,
    };

    let rt = Runtime::with_config(config);

    println!("⚙️  Auto-Scaling Demonstration - Industry 4.0");
    println!("============================================\n");

    rt.block_on(async move {
        println!("📊 Monitoring workload and scaling decisions...\n");

        // Phase 1: Light load
        println!("Phase 1: Light Load (10 tasks)");
        println!("-------------------------------");
        spawn_tasks(&rt, 10, Duration::from_millis(100));
        monitor_for_seconds(&rt, 2).await;

        // Phase 2: Medium load
        println!("\nPhase 2: Medium Load (50 tasks)");
        println!("--------------------------------");
        spawn_tasks(&rt, 50, Duration::from_millis(150));
        monitor_for_seconds(&rt, 3).await;

        // Phase 3: Heavy load
        println!("\nPhase 3: Heavy Load (200 tasks)");
        println!("--------------------------------");
        spawn_tasks(&rt, 200, Duration::from_millis(100));
        monitor_for_seconds(&rt, 4).await;

        // Phase 4: Cool down
        println!("\nPhase 4: Cool Down");
        println!("------------------");
        monitor_for_seconds(&rt, 5).await;

        println!("\n📈 Final Performance Report");
        println!("==========================");
        let final_metrics = rt.metrics().snapshot();
        println!("Total tasks spawned: {}", final_metrics.tasks_spawned);
        println!("Total tasks completed: {}", final_metrics.tasks_completed);
        println!("Tasks failed: {}", final_metrics.tasks_failed);
        println!("Peak queue length: {}", final_metrics.max_queue_length);
        println!("Average execution time: {:?}", final_metrics.avg_execution_time);
        println!("P95 execution time: {:?}", final_metrics.p95_execution_time);
        println!("P99 execution time: {:?}", final_metrics.p99_execution_time);
        println!("Final throughput: {} tasks/sec", final_metrics.tasks_per_second);
    });
}

fn spawn_tasks(rt: &Runtime, count: usize, delay: Duration) {
    for i in 0..count {
        rt.spawn(async move {
            avila_async::sleep(delay).await;
            // Simulate CPU work
            let mut sum = 0u64;
            for j in 0..1000 {
                sum = sum.wrapping_add(j);
            }
        });
    }
}

async fn monitor_for_seconds(rt: &Runtime, seconds: u64) {
    let end_time = std::time::Instant::now() + Duration::from_secs(seconds);

    while std::time::Instant::now() < end_time {
        avila_async::sleep(Duration::from_millis(500)).await;

        let snapshot = rt.metrics().snapshot();
        let active_tasks = snapshot.tasks_spawned - snapshot.tasks_completed;

        println!(
            "  [{}s] Tasks: {} active, {} queued | Threads: {} active, {} idle | TPS: {}",
            (seconds - (end_time - std::time::Instant::now()).as_secs()),
            active_tasks,
            snapshot.queue_length,
            snapshot.active_threads,
            snapshot.idle_threads,
            snapshot.tasks_per_second
        );
    }
}
