//! Example: Digital Twin Runtime Monitoring
//!
//! Demonstrates digital twin capabilities for runtime state modeling

use avila_async::{Runtime, DigitalTwin, TwinUpdate, sleep};
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.spawn(async {
        println!("🔷 Digital Twin Runtime Monitoring");
        println!("====================================\n");

        // Create digital twin
        let twin = DigitalTwin::new("runtime-001");
        println!("✅ Created digital twin: runtime-001\n");

        // Simulate runtime state updates
        println!("📊 Simulating runtime activity...\n");

        for cycle in 0..5 {
            // Simulate task spawning
            let tasks_spawned = 100 + (cycle * 20);
            let tasks_completed = 80 + (cycle * 18);
            let active_tasks = tasks_spawned - tasks_completed;
            let queue_depth = active_tasks / 2;
            let throughput = 15.0 + (cycle as f64 * 2.0);

            // Update digital twin
            twin.update(TwinUpdate {
                tasks_spawned: Some(tasks_spawned as u64),
                tasks_completed: Some(tasks_completed as u64),
                active_tasks: Some(active_tasks as usize),
                queue_depth: Some(queue_depth as usize),
                thread_count: Some(8),
                throughput: Some(throughput),
                avg_latency: Some(Duration::from_millis(50 + cycle * 5)),
                health_status: Some("Healthy".to_string()),
                is_ready: Some(true),
                is_alive: Some(true),
            });

            // Display snapshot
            let snapshot = twin.snapshot();
            println!("Cycle {}: {}", cycle + 1, snapshot);

            // Set custom attributes
            twin.set_attribute(
                format!("cycle_{}", cycle),
                format!("throughput={:.1}tps", throughput),
            );

            sleep(Duration::from_millis(500)).await;
        }

        // Display JSON export
        println!("\n📄 Digital Twin JSON Export:");
        println!("{}", twin.to_json());

        // Show historical data
        println!("\n📈 Historical Snapshots:");
        for (i, snapshot) in twin.history().iter().enumerate() {
            println!("  [{}] uptime={:?}, tasks={}, tps={:.1}",
                i + 1,
                snapshot.uptime,
                snapshot.tasks_completed,
                snapshot.throughput
            );
        }

        println!("\n✅ Digital twin monitoring complete!");
    });

    rt.run();
}
