//! # avila-parallel
//!
//! Data parallelism library for AVL Platform.
//!
//! ## Features
//!
//! - Thread pool with work stealing
//! - Parallel iterators
//! - Scoped threads
//! - Zero overhead abstractions
//!
//! ## Quick Start
//!
//! ```rust
//! use avila_parallel::prelude::*;
//!
//! let numbers: Vec<i32> = (0..1000).collect();
//! let sum: i32 = numbers.par_iter().sum();
//! ```

#![warn(missing_docs)]
#![warn(clippy::all)]

pub mod thread_pool;
pub mod parallel;
pub mod scope;
pub mod executor;
pub mod parallel_vec;
pub mod advanced;
pub mod work_stealing;
pub mod simd;
pub mod config;
pub mod lockfree;
pub mod pipeline;
pub mod adaptive;
pub mod memory;

pub use thread_pool::ThreadPool;
pub use parallel::{ParallelIterator, IntoParallelIterator};
pub use parallel_vec::{ParallelVec, IntoParallelVec};
pub use advanced::{parallel_sort, parallel_sort_by, parallel_zip, parallel_chunks, parallel_partition_advanced};
pub use work_stealing::{WorkStealingPool, work_stealing_map};
pub use config::{ThreadPoolConfig, set_global_config, get_global_config};
pub use lockfree::{lockfree_count, lockfree_any, lockfree_all, AtomicCounter};
pub use pipeline::{MapReduce, BatchProcessor};
pub use adaptive::{AdaptiveExecutor, speculative_execute, hierarchical_map, cache_aware_map};
pub use memory::{parallel_transform_inplace, parallel_fold_efficient, parallel_iter_nocopy};

/// Prelude module for convenient imports
pub mod prelude {
    pub use crate::parallel::{ParallelIterator, IntoParallelIterator, ParallelSlice, ParallelSliceMut};
    pub use crate::parallel_vec::{ParallelVec, IntoParallelVec};
    pub use crate::lockfree::{lockfree_count, lockfree_any, lockfree_all};
    pub use crate::adaptive::{AdaptiveExecutor, speculative_execute};
    pub use crate::memory::{parallel_transform_inplace, parallel_iter_nocopy};
    // Re-export std::thread::scope for convenience
    pub use std::thread::scope;
}

/// Version information
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

// Re-export std::thread::scope directly
pub use std::thread::scope;

#[cfg(test)]
mod tests {
    use super::prelude::*;
    use super::ThreadPool;

    #[test]
    fn test_parallel_sum() {
        let numbers: Vec<i32> = (0..100).collect();
        let sum: i32 = numbers.par_iter().sum();
        assert_eq!(sum, 4950);
    }

    #[test]
    fn test_parallel_map() {
        let numbers: Vec<i32> = vec![1, 2, 3, 4, 5];
        let doubled: Vec<i32> = numbers
            .par_iter()
            .map(|&x| x * 2)
            .collect();
        assert_eq!(doubled, vec![2, 4, 6, 8, 10]);
    }

    #[test]
    fn test_thread_pool() {
        let pool = ThreadPool::new(2);

        for i in 0..10 {
            pool.execute(move || {
                let _result = i * i;
                // Thread pool executes jobs without returning values
            });
        }

        pool.wait();
    }

    #[test]
    fn test_parallel_filter() {
        let numbers: Vec<i32> = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let evens: Vec<i32> = numbers
            .par_iter()
            .filter(|&x| x % 2 == 0)
            .cloned()
            .collect();
        assert_eq!(evens, vec![2, 4, 6, 8, 10]);
    }

    #[test]
    fn test_parallel_fold() {
        let numbers: Vec<i32> = vec![1, 2, 3, 4, 5];
        let result: Vec<i32> = numbers
            .par_iter()
            .fold(|| 0, |acc, &x| acc + x)
            .collect();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], 15);
    }

    #[test]
    fn test_parallel_reduce() {
        let numbers: Vec<i32> = vec![1, 2, 3, 4, 5];
        let result = numbers
            .par_iter()
            .cloned()
            .reduce(|a, b| a + b);
        assert_eq!(result, Some(15));
    }

    #[test]
    fn test_parallel_find_any() {
        let numbers: Vec<i32> = vec![1, 2, 3, 4, 5];
        let found = numbers
            .par_iter()
            .find_any(|&&x| x > 3);
        assert!(found.is_some());
        assert!(*found.unwrap() > 3);
    }

    #[test]
    fn test_parallel_all() {
        let numbers: Vec<i32> = vec![2, 4, 6, 8, 10];
        let all_even = numbers
            .par_iter()
            .all(|&x| x % 2 == 0);
        assert!(all_even);
    }

    #[test]
    fn test_parallel_any() {
        let numbers: Vec<i32> = vec![1, 3, 5, 7, 8];
        let has_even = numbers
            .par_iter()
            .any(|&x| x % 2 == 0);
        assert!(has_even);
    }

    #[test]
    fn test_parallel_cloned() {
        let numbers: Vec<i32> = vec![1, 2, 3, 4, 5];
        let doubled: Vec<i32> = numbers
            .par_iter()
            .cloned()
            .map(|x| x * 2)
            .collect();
        assert_eq!(doubled, vec![2, 4, 6, 8, 10]);
    }

    #[test]
    fn test_parallel_iter_mut() {
        let mut numbers: Vec<i32> = vec![1, 2, 3, 4, 5];
        numbers
            .par_iter_mut()
            .for_each(|x| *x *= 2);
        assert_eq!(numbers, vec![2, 4, 6, 8, 10]);
    }
}
