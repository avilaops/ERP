//! Example: Genetic Algorithm Optimization
//!
//! Demonstrates evolutionary algorithms for runtime tuning

use avila_async::{Runtime, GeneticOptimizer, sleep};
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.spawn(async {
        println!("🧬 Genetic Algorithm Optimization");
        println!("===================================\n");

        // Create genetic optimizer
        // Genes: [thread_count_ratio, queue_size_ratio, timeout_ms, batch_size]
        let optimizer = GeneticOptimizer::new(20, 4, 0.1);
        println!("✅ Initialized genetic optimizer");
        println!("  Population: 20 genomes");
        println!("  Genes per genome: 4");
        println!("  Mutation rate: 10%\n");

        // Fitness function (simulates runtime performance)
        let fitness_fn = |genes: &[f64]| -> f64 {
            let thread_ratio = genes[0];
            let queue_ratio = genes[1];
            let timeout = genes[2];
            let batch_size = genes[3];

            // Optimal values: threads=0.5, queue=0.7, timeout=0.3, batch=0.6
            let thread_score = 1.0 - (thread_ratio - 0.5).abs();
            let queue_score = 1.0 - (queue_ratio - 0.7).abs();
            let timeout_score = 1.0 - (timeout - 0.3).abs();
            let batch_score = 1.0 - (batch_size - 0.6).abs();

            (thread_score + queue_score + timeout_score + batch_score) / 4.0
        };

        // Evolution loop
        println!("🔬 Starting evolution...\n");

        for generation in 0..10 {
            // Evaluate fitness
            optimizer.evaluate(&fitness_fn);

            // Show stats
            let stats = optimizer.stats();
            println!("  {}", stats);

            // Show best genome every 3 generations
            if generation % 3 == 0 {
                if let Some(best) = optimizer.best() {
                    println!("    Best: {:?}", best.genes.iter()
                        .map(|g| format!("{:.3}", g))
                        .collect::<Vec<_>>());
                }
            }

            // Evolve to next generation
            optimizer.evolve();

            sleep(Duration::from_millis(150)).await;
        }

        // Final evaluation
        optimizer.evaluate(&fitness_fn);

        println!("\n🏆 Evolution Complete!\n");

        if let Some(best) = optimizer.best() {
            println!("📈 Best Genome Found:");
            println!("  Thread Count Ratio: {:.3}", best.genes[0]);
            println!("  Queue Size Ratio: {:.3}", best.genes[1]);
            println!("  Timeout (normalized): {:.3}", best.genes[2]);
            println!("  Batch Size (normalized): {:.3}", best.genes[3]);
            println!("  Fitness Score: {:.3}", best.fitness);
        }

        // Convert to actual runtime parameters
        println!("\n⚙️  Recommended Runtime Configuration:");
        if let Some(best) = optimizer.best() {
            let threads = (best.genes[0] * 32.0).round() as usize;
            let queue_size = (best.genes[1] * 1000.0).round() as usize;
            let timeout_ms = (best.genes[2] * 1000.0).round() as u64;
            let batch_size = (best.genes[3] * 100.0).round() as usize;

            println!("  Threads: {}", threads);
            println!("  Queue Size: {}", queue_size);
            println!("  Timeout: {}ms", timeout_ms);
            println!("  Batch Size: {}", batch_size);
        }

        let final_stats = optimizer.stats();
        println!("\n📊 Final Statistics:");
        println!("  Generation: {}", final_stats.generation);
        println!("  Average Fitness: {:.3}", final_stats.avg_fitness);
        println!("  Best Fitness: {:.3}", final_stats.best_fitness);

        println!("\n✅ Genetic optimization demo complete!");
        println!("\n💡 Evolutionary algorithms find optimal configurations automatically");
    });

    rt.run();
}
