//! Performance comparison: Sequential vs Parallel
//!
//! This example demonstrates the performance difference between
//! sequential and parallel execution.

use avila_parallel::prelude::*;
use std::time::Instant;

fn sequential_sum(data: &[i32]) -> i32 {
    data.iter().sum()
}

fn sequential_map_sum(data: &[i32]) -> i32 {
    data.iter().map(|&x| x * x).sum()
}

fn main() {
    println!("=== Performance Comparison: Sequential vs Parallel ===\n");

    // Test with different data sizes
    for size in [10_000, 100_000, 1_000_000, 10_000_000] {
        println!("Data size: {} elements", size);
        let data: Vec<i32> = (1..=size).map(|x| x as i32).collect();

        // Test 1: Simple sum
        println!("\n1. Simple Sum:");

        let start = Instant::now();
        let seq_result = sequential_sum(&data);
        let seq_time = start.elapsed();
        println!("   Sequential: {:?} - Result: {}", seq_time, seq_result);

        let start = Instant::now();
        let par_result = data.par_vec().sum();
        let par_time = start.elapsed();
        println!("   Parallel:   {:?} - Result: {}", par_time, par_result);

        if par_time.as_nanos() > 0 {
            let speedup = seq_time.as_nanos() as f64 / par_time.as_nanos() as f64;
            println!("   Speedup: {:.2}x", speedup);
        }

        // Test 2: Map then sum
        println!("\n2. Map (x²) then Sum:");

        let start = Instant::now();
        let seq_result = sequential_map_sum(&data);
        let seq_time = start.elapsed();
        println!("   Sequential: {:?} - Result: {}", seq_time, seq_result);

        let start = Instant::now();
        let par_result: i32 = data.par_vec().map(|&x| x * x).sum();
        let par_time = start.elapsed();
        println!("   Parallel:   {:?} - Result: {}", par_time, par_result);

        if par_time.as_nanos() > 0 {
            let speedup = seq_time.as_nanos() as f64 / par_time.as_nanos() as f64;
            println!("   Speedup: {:.2}x", speedup);
        }

        // Test 3: Filter even numbers
        println!("\n3. Filter (even numbers):");

        let start = Instant::now();
        let seq_result: Vec<_> = data.iter().filter(|&&x| x % 2 == 0).collect();
        let seq_time = start.elapsed();
        println!("   Sequential: {:?} - Count: {}", seq_time, seq_result.len());

        let start = Instant::now();
        let par_result = data.par_vec().filter(|&x| x % 2 == 0).collect();
        let par_time = start.elapsed();
        println!("   Parallel:   {:?} - Count: {}", par_time, par_result.len());

        if par_time.as_nanos() > 0 {
            let speedup = seq_time.as_nanos() as f64 / par_time.as_nanos() as f64;
            println!("   Speedup: {:.2}x", speedup);
        }

        // Test 4: Complex computation
        println!("\n4. Complex Computation (multiple operations):");

        let start = Instant::now();
        let seq_result: i32 = data.iter()
            .filter(|&&x| x % 3 == 0)
            .map(|&x| {
                let mut result = x;
                for _ in 0..10 {
                    result = (result * 13 + 7) % 1000000;
                }
                result
            })
            .sum();
        let seq_time = start.elapsed();
        println!("   Sequential: {:?} - Result: {}", seq_time, seq_result);

        let start = Instant::now();
        let par_result: i32 = data.par_vec()
            .filter(|&x| x % 3 == 0)
            .map(|&x| {
                let mut result = x;
                for _ in 0..10 {
                    result = (result * 13 + 7) % 1000000;
                }
                result
            })
            .into_iter()
            .sum();
        let par_time = start.elapsed();
        println!("   Parallel:   {:?} - Result: {}", par_time, par_result);

        if par_time.as_nanos() > 0 {
            let speedup = seq_time.as_nanos() as f64 / par_time.as_nanos() as f64;
            println!("   Speedup: {:.2}x", speedup);
        }

        println!("\n{}", "=".repeat(60));
    }

    println!("\n=== Comparison Complete ===");
    println!("\nNotes:");
    println!("- Parallel execution shows benefits with large datasets");
    println!("- Small datasets may run faster sequentially due to overhead");
    println!("- Complex computations benefit more from parallelism");
    println!("- Thread pool size: {} threads", avila_parallel::thread_pool::num_cpus());
}
