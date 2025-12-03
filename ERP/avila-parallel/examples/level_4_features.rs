//! Work Stealing and Advanced Features Demo

use avila_parallel::prelude::*;
use avila_parallel::{
    work_stealing_map, WorkStealingPool,
    ThreadPoolConfig, set_global_config,
    simd,
};
use std::time::Instant;

fn main() {
    println!("=== Advanced Features Level 4.0 ===\n");

    // 1. Work Stealing Pool
    println!("1. Work Stealing Pool:");
    let pool = WorkStealingPool::new(4);
    let counter = std::sync::Arc::new(std::sync::Mutex::new(0));

    let tasks: Vec<_> = (0..20)
        .map(|i| {
            let counter = counter.clone();
            move || {
                *counter.lock().unwrap() += i;
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
        })
        .collect();

    let start = Instant::now();
    pool.execute(tasks);
    let elapsed = start.elapsed();

    println!("   Processed 20 tasks with work stealing");
    println!("   Result: {}", *counter.lock().unwrap());
    println!("   Time: {:?}\n", elapsed);

    // 2. Work Stealing Map
    println!("2. Work Stealing Map:");
    let data: Vec<i32> = (1..=10_000).collect();

    let start = Instant::now();
    let results = work_stealing_map(&data, |x| x * x);
    let elapsed = start.elapsed();

    println!("   Mapped {} elements", results.len());
    println!("   First 5: {:?}", &results[..5]);
    println!("   Time: {:?}\n", elapsed);

    // 3. Thread Pool Configuration
    println!("3. Custom Thread Pool Configuration:");
    let config = ThreadPoolConfig::new()
        .num_threads(8)
        .min_chunk_size(2048)
        .thread_name("custom-worker");

    set_global_config(config.clone());
    println!("   Threads: {}", config.num_threads);
    println!("   Min chunk size: {:?}", config.min_chunk_size);
    println!("   Thread name: {:?}\n", config.thread_name);

    // 4. SIMD Operations
    println!("4. SIMD-Accelerated Operations:");
    let data_i32: Vec<i32> = (1..=100_000).collect();
    let data_f32: Vec<f32> = (1..=100_000).map(|x| x as f32).collect();

    let start = Instant::now();
    let sum_i32 = simd::parallel_simd_sum_i32(&data_i32);
    let elapsed_i32 = start.elapsed();

    let start = Instant::now();
    let sum_f32 = simd::parallel_simd_sum_f32(&data_f32);
    let elapsed_f32 = start.elapsed();

    println!("   i32 sum: {} in {:?}", sum_i32, elapsed_i32);
    println!("   f32 sum: {} in {:?}\n", sum_f32, elapsed_f32);

    // 5. SIMD Dot Product
    println!("5. SIMD Dot Product:");
    let a: Vec<f32> = (1..=10_000).map(|x| x as f32).collect();
    let b: Vec<f32> = (1..=10_000).map(|x| (x * 2) as f32).collect();

    let start = Instant::now();
    let dot = simd::simd_dot_f32(&a, &b);
    let elapsed = start.elapsed();

    println!("   Dot product of 10K vectors: {}", dot);
    println!("   Time: {:?}\n", elapsed);

    // 6. Combined Pipeline
    println!("6. Complex Pipeline with Advanced Features:");
    let data: Vec<i32> = (1..=100_000).collect();

    let start = Instant::now();

    // Parallel operations with work stealing
    let squared = work_stealing_map(&data, |x| x * x);
    let filtered: Vec<_> = squared.par_iter()
        .filter(|&&x| x % 2 == 0)
        .collect();
    let sum: i32 = filtered.par_iter().map(|&&x| x).sum();

    let elapsed = start.elapsed();

    println!("   Squared {} elements", squared.len());
    println!("   Filtered to {} even squares", filtered.len());
    println!("   Sum: {}", sum);
    println!("   Total time: {:?}\n", elapsed);

    // 7. Performance Comparison
    println!("7. Performance Comparison (1M elements):");
    let large_data: Vec<i32> = (1..=1_000_000).collect();

    // Sequential
    let start = Instant::now();
    let seq_sum: i32 = large_data.iter().sum();
    let seq_time = start.elapsed();

    // Parallel SIMD
    let start = Instant::now();
    let par_sum = simd::parallel_simd_sum_i32(&large_data);
    let par_time = start.elapsed();

    println!("   Sequential: {} in {:?}", seq_sum, seq_time);
    println!("   Parallel SIMD: {} in {:?}", par_sum, par_time);

    if par_time.as_nanos() > 0 {
        let speedup = seq_time.as_secs_f64() / par_time.as_secs_f64();
        println!("   Speedup: {:.2}x\n", speedup);
    }

    println!("=== All Advanced Features Demonstrated ===");
}
