//! Advanced parallel operations example
//!
//! Demonstrates all advanced features including sorting, zipping, chunking, and partitioning

use avila_parallel::prelude::*;
use avila_parallel::executor::*;
use avila_parallel::{parallel_sort, parallel_zip, parallel_chunks, parallel_partition_advanced};

fn main() {
    println!("=== Advanced Parallel Operations ===\n");

    // PART 1: Basic Operations (find, count, partition)
    println!("PART 1: Basic Operations\n");

    let data: Vec<i32> = (1..=100_000).collect();

    println!("1. Finding first number > 99,000 divisible by 7:");
    let found = parallel_find(&data, |x| *x > 99_000 && *x % 7 == 0);
    if let Some(n) = found {
        println!("   Found: {}\n", n);
    }

    println!("2. Counting even numbers:");
    let count = parallel_count(&data, |x| *x % 2 == 0);
    println!("   Count: {} even numbers\n", count);

    println!("3. Partitioning into evens/odds (first 100):");
    let (evens, odds) = parallel_partition(&data[0..100], |x| *x % 2 == 0);
    println!("   Evens: {}, Odds: {}\n", evens.len(), odds.len());

    // PART 2: Advanced Operations (sort, zip, chunks)
    println!("PART 2: Advanced Operations\n");

    println!("4. Parallel Sort:");
    let mut sort_data: Vec<i32> = (0..100_000).rev().collect();
    let start = std::time::Instant::now();
    parallel_sort(&mut sort_data);
    let elapsed = start.elapsed();
    println!("   Sorted {} elements in {:?}", sort_data.len(), elapsed);
    println!("   First 5: {:?}\n", &sort_data[..5]);

    println!("5. Parallel Zip:");
    let a: Vec<i32> = (0..10_000).collect();
    let b: Vec<i32> = (0..10_000).map(|x| x * 2).collect();
    let result = parallel_zip(&a, &b, |x, y| x + y);
    println!("   Zipped {} pairs", result.len());
    println!("   First 5: {:?}\n", &result[..5]);

    println!("6. Parallel Chunks:");
    let chunk_data: Vec<i32> = (1..=10_000).collect();
    let chunk_results = parallel_chunks(&chunk_data, 1_000, |chunk| {
        vec![chunk.iter().sum::<i32>() / chunk.len() as i32]
    });
    println!("   Processed {} chunks", chunk_results.len());
    println!("   Averages: {:?}\n", chunk_results);

    println!("7. Advanced Partition (with complex predicate):");
    let (evens, odds) = parallel_partition_advanced(&data[0..1000], |x| x % 2 == 0);
    println!("   Evens: {}, Odds: {}\n", evens.len(), odds.len());

    // PART 3: Performance Comparison
    println!("PART 3: Performance Comparison\n");

    println!("8. Sort Performance:");
    let size = 1_000_000;

    let mut seq_data: Vec<i32> = (0..size).rev().collect();
    let start = std::time::Instant::now();
    seq_data.sort();
    let seq_time = start.elapsed();

    let mut par_data: Vec<i32> = (0..size).rev().collect();
    let start = std::time::Instant::now();
    parallel_sort(&mut par_data);
    let par_time = start.elapsed();

    println!("   Sequential: {:?}", seq_time);
    println!("   Parallel: {:?}", par_time);
    println!("   Speedup: {:.2}x\n", seq_time.as_secs_f64() / par_time.as_secs_f64());

    // PART 4: Real-world Use Case
    println!("PART 4: Real-world Statistical Analysis\n");

    let stats_data: Vec<f64> = (1..=1_000_000).map(|x| x as f64 * 0.5).collect();

    let start = std::time::Instant::now();
    let sum: f64 = stats_data.par_iter().sum();
    let mean = sum / stats_data.len() as f64;

    let variance: f64 = stats_data.par_iter()
        .map(|x| (x - mean).powi(2))
        .sum();
    let std_dev = (variance / stats_data.len() as f64).sqrt();
    let elapsed = start.elapsed();

    println!("   Dataset: {} elements", stats_data.len());
    println!("   Mean: {:.2}", mean);
    println!("   Std Dev: {:.2}", std_dev);
    println!("   Computed in {:?}\n", elapsed);

    println!("=== All Advanced Operations Completed ===");
}
