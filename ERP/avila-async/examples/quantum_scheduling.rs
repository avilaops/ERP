//! Example: Quantum-Inspired Scheduling
//!
//! Demonstrates quantum computing concepts for task optimization

use avila_async::{Runtime, QuantumScheduler, sleep};
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.spawn(async {
        println!("⚛️  Quantum-Inspired Task Scheduling");
        println!("=====================================\n");

        let num_tasks = 8;
        let num_threads = 4;

        // Create quantum scheduler
        let scheduler = QuantumScheduler::new(num_tasks);
        println!("✅ Initialized {} qubits for task scheduling\n", num_tasks);

        // Apply quantum rotations (adjust priorities)
        println!("🔄 Applying quantum rotations...\n");
        for task_id in 0..num_tasks {
            let theta = (task_id as f64 * 0.3) % std::f64::consts::PI;
            scheduler.rotate(task_id, theta);
            println!("  Task {}: θ = {:.2}π", task_id, theta / std::f64::consts::PI);
        }

        // Create entanglement between related tasks
        println!("\n🔗 Creating quantum entanglement...\n");
        scheduler.entangle(0, 1, 0.8);
        scheduler.entangle(2, 3, 0.9);
        scheduler.entangle(4, 5, 0.7);
        println!("  Tasks 0-1: entanglement = 0.8");
        println!("  Tasks 2-3: entanglement = 0.9");
        println!("  Tasks 4-5: entanglement = 0.7");

        sleep(Duration::from_millis(200)).await;

        // Measure and schedule tasks
        println!("\n📊 Measuring quantum states and scheduling...\n");
        for task_id in 0..num_tasks {
            if let Some(decision) = scheduler.measure(task_id, num_threads) {
                println!("  {}", decision);
            }
        }

        // Calculate interference patterns
        println!("\n🌊 Quantum interference patterns:\n");
        for i in 0..3 {
            let j = i + 1;
            let interference = scheduler.interference(i, j);
            println!("  Tasks {} ↔ {}: interference = {:.3}", i, j, interference);
        }

        // Quantum annealing for optimal ordering
        println!("\n❄️  Quantum annealing (temperature = 1.0):\n");
        let optimal = scheduler.anneal(1.0);
        println!("  Optimal task order: {:?}", optimal);

        // Show statistics
        let stats = scheduler.stats();
        println!("\n📈 Quantum Statistics:");
        println!("  {}", stats);

        // Demonstrate temperature effects
        println!("\n🌡️  Temperature comparison:\n");
        for temp in [0.1, 0.5, 1.0, 2.0, 5.0] {
            let order = scheduler.anneal(temp);
            println!("  T={:.1}: {:?}", temp, order);
        }

        println!("\n✅ Quantum scheduling demo complete!");
        println!("\n💡 Note: Lower energy states have higher priority");
    });

    rt.run();
}
