//! Example: Edge Computing Task Distribution
//!
//! Demonstrates distributed task execution across edge nodes

use avila_async::{Runtime, EdgeManager, EdgeNode, DistributionStrategy, sleep};
use std::time::{Duration, Instant};

fn main() {
    let rt = Runtime::new();

    rt.spawn(async {
        println!("🌐 Edge Computing Task Distribution");
        println!("====================================\n");

        // Create edge manager
        let manager = EdgeManager::new("edge-001", "us-east");
        println!("✅ Created local edge node: edge-001 (us-east)\n");

        // Register remote edge nodes
        println!("📡 Registering remote edge nodes...\n");

        manager.register_node(EdgeNode {
            node_id: "edge-002".to_string(),
            region: "us-west".to_string(),
            location: "San Francisco".to_string(),
            last_seen: Instant::now(),
            latency_ms: 80,
            is_healthy: true,
            max_threads: 8,
            available_threads: 6,
            queue_capacity: 1024,
            current_load: 0.3,
            tasks_processed: 1250,
            total_uptime: Duration::from_secs(3600),
            avg_response_time: Duration::from_millis(15),
        });

        manager.register_node(EdgeNode {
            node_id: "edge-003".to_string(),
            region: "eu-west".to_string(),
            location: "London".to_string(),
            last_seen: Instant::now(),
            latency_ms: 120,
            is_healthy: true,
            max_threads: 16,
            available_threads: 10,
            queue_capacity: 2048,
            current_load: 0.5,
            tasks_processed: 3400,
            total_uptime: Duration::from_secs(7200),
            avg_response_time: Duration::from_millis(20),
        });

        manager.register_node(EdgeNode {
            node_id: "edge-004".to_string(),
            region: "ap-south".to_string(),
            location: "Singapore".to_string(),
            last_seen: Instant::now(),
            latency_ms: 200,
            is_healthy: true,
            max_threads: 12,
            available_threads: 9,
            queue_capacity: 1536,
            current_load: 0.2,
            tasks_processed: 890,
            total_uptime: Duration::from_secs(1800),
            avg_response_time: Duration::from_millis(25),
        });

        // Display healthy nodes
        println!("🟢 Healthy Edge Nodes:");
        for node in manager.healthy_nodes() {
            println!("  {}", node);
        }

        // Test different distribution strategies
        println!("\n📊 Distribution Strategies:\n");

        let task_count = 1000;

        // Strategy 1: Latency-Based
        if let Some(best_node) = manager.find_best_node(DistributionStrategy::LatencyBased) {
            println!("🎯 Latency-Based: Best node is '{}'", best_node);
        }

        // Strategy 2: Load-Based
        if let Some(best_node) = manager.find_best_node(DistributionStrategy::LoadBased) {
            println!("⚖️  Load-Based: Best node is '{}'", best_node);
        }

        // Strategy 3: Round-Robin Distribution
        let distribution = manager.distribute_tasks(task_count, DistributionStrategy::RoundRobin);
        println!("\n🔄 Round-Robin Distribution of {} tasks:", task_count);
        println!("  Local: {} tasks", distribution.local_tasks);
        for remote in &distribution.remote_tasks {
            println!("  {}: {} tasks ({})",
                remote.node_id,
                remote.task_count,
                remote.reason
            );
        }

        // Strategy 4: Load-Based Distribution
        let distribution = manager.distribute_tasks(task_count, DistributionStrategy::LoadBased);
        println!("\n⚖️  Load-Based Distribution of {} tasks:", task_count);
        println!("  Local: {} tasks", distribution.local_tasks);
        for remote in &distribution.remote_tasks {
            println!("  {}: {} tasks ({})",
                remote.node_id,
                remote.task_count,
                remote.reason
            );
        }

        // Simulate load changes
        println!("\n📈 Simulating load changes...\n");
        manager.update_node_load("edge-002", 0.8);
        manager.update_node_load("edge-003", 0.9);
        manager.update_node_load("edge-004", 0.1);

        sleep(Duration::from_millis(100)).await;

        // Re-evaluate after load change
        let distribution = manager.distribute_tasks(task_count, DistributionStrategy::LoadBased);
        println!("📊 Updated Load-Based Distribution:");
        println!("  Local: {} tasks", distribution.local_tasks);
        for remote in &distribution.remote_tasks {
            println!("  {}: {} tasks ({})",
                remote.node_id,
                remote.task_count,
                remote.reason
            );
        }

        // Export topology
        println!("\n📄 Edge Topology JSON:");
        println!("{}", manager.to_json());

        println!("\n✅ Edge computing demo complete!");
    });

    rt.run();
}
