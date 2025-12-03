//! Exemplos de uso das features avançadas v0.4.0
//!
//! Este exemplo demonstra os 4 novos módulos:
//! - Lock-free operations
//! - Adaptive execution
//! - Memory-efficient operations

use avila_parallel::prelude::*;
use avila_parallel::adaptive::{AdaptiveExecutor, speculative_execute, cache_aware_map};
use avila_parallel::memory::{parallel_transform_inplace, parallel_fold_efficient, parallel_iter_nocopy};

fn main() {
    println!("=== Avila-Parallel v0.4.0 - Advanced Features Demo ===\n");

    // 1. Lock-Free Operations
    demo_lockfree();

    // 2. Adaptive Execution
    demo_adaptive();

    // 3. Memory-Efficient Operations
    demo_memory_efficient();
}

fn demo_lockfree() {
    println!("1. LOCK-FREE OPERATIONS (Zero Contention)");
    println!("   Using only atomics, no mutexes\n");

    let data: Vec<i32> = (1..=1_000_000).collect();

    // Count with atomics
    let count = lockfree_count(&data, |x| x % 2 == 0);
    println!("   Even numbers (lock-free): {}", count);

    // Search with atomic early exit
    let has_large = lockfree_any(&data, |x| x > &999_000);
    println!("   Has number > 999000: {}", has_large);

    // Verify all with atomics
    let all_positive = lockfree_all(&data, |x| x > &0);
    println!("   All positive: {}", all_positive);

    println!("   ✓ Zero locks used!\n");
}

fn demo_adaptive() {
    println!("2. ADAPTIVE EXECUTION (Self-Optimizing)");
    println!("   Learns optimal parameters automatically\n");

    let data: Vec<i32> = (1..=10_000).collect();

    // Adaptive executor learns over time
    let executor = AdaptiveExecutor::new();

    println!("   First run (learning)...");
    let result1 = executor.adaptive_map(&data, |x| x * 2);
    println!("   Result length: {}", result1.len());

    println!("   Second run (optimized with learned params)...");
    let result2 = executor.adaptive_map(&data, |x| x * 2);
    println!("   Result length: {}", result2.len());

    // Speculative execution (auto-choose parallel vs sequential)
    let small_data = vec![1, 2, 3, 4, 5];
    let result = speculative_execute(&small_data, |x| x * x);
    println!("   Speculative result (auto-chose): {:?}", result);

    // Cache-aware operations
    let cache_result: Vec<i32> = cache_aware_map(&data[..100], |x| x * 3);
    println!("   Cache-aware transform (first 10): {:?}", &cache_result[..10]);
    println!("   ✓ Self-optimization active!\n");
}

fn demo_memory_efficient() {
    println!("3. MEMORY-EFFICIENT OPERATIONS (Zero Allocation)");
    println!("   In-place transforms and minimal copying\n");

    // In-place transformation (ZERO allocations)
    let mut data = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    println!("   Before in-place: {:?}", data);

    parallel_transform_inplace(&mut data, |x| *x *= 2);
    println!("   After in-place:  {:?}", data);
    println!("   ✓ Zero allocations!");

    // Efficient fold with custom combiner
    let sum = parallel_fold_efficient(
        &data,
        || 0,                      // Identity
        |acc, x| acc + x,          // Fold operation
        |a, b| a + b               // Combine results
    );
    println!("   Efficient fold sum: {}", sum);

    // Zero-copy iteration
    println!("   Zero-copy iteration (no clones):");
    parallel_iter_nocopy(&data, |_x| {
        // This closure sees references, no copying
    });
    println!("   ✓ No data copied during iteration!");

    println!("   ✓ Memory pressure minimized!\n");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_v4_features() {
        // Quick validation that all v0.4.0 features work
        let data = vec![1, 2, 3, 4, 5];

        // Lock-free
        assert_eq!(lockfree_count(&data, |x| x > &2), 3);

        // Adaptive
        let mut exec = AdaptiveExecutor::new();
        let result = exec.adaptive_map(&data, |x| x * 2);
        assert_eq!(result.len(), 5);

        // Memory-efficient
        let mut data_mut = data.clone();
        parallel_transform_inplace(&mut data_mut, |x| *x *= 2);
        assert_eq!(data_mut, vec![2, 4, 6, 8, 10]);
    }
}
