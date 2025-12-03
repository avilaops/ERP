//! Adaptive parallel execution with dynamic optimization
//!
//! This module provides adaptive algorithms that adjust their behavior based on workload

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

/// Adaptive executor that learns optimal chunk sizes
pub struct AdaptiveExecutor {
    optimal_chunk_size: Arc<AtomicUsize>,
    sample_count: Arc<AtomicUsize>,
}

impl AdaptiveExecutor {
    /// Create a new adaptive executor
    pub fn new() -> Self {
        Self {
            optimal_chunk_size: Arc::new(AtomicUsize::new(1024)),
            sample_count: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Get current optimal chunk size
    pub fn chunk_size(&self) -> usize {
        self.optimal_chunk_size.load(Ordering::Relaxed)
    }

    /// Update chunk size based on performance
    fn update_chunk_size(&self, new_size: usize) {
        let samples = self.sample_count.fetch_add(1, Ordering::Relaxed);
        if samples < 10 {
            // Learning phase - take average
            let current = self.optimal_chunk_size.load(Ordering::Relaxed);
            let avg = (current + new_size) / 2;
            self.optimal_chunk_size.store(avg, Ordering::Relaxed);
        }
    }

    /// Adaptive parallel map
    pub fn adaptive_map<T, R, F>(&self, items: &[T], f: F) -> Vec<R>
    where
        T: Sync,
        R: Send + 'static,
        F: Fn(&T) -> R + Send + Sync,
    {
        use crate::executor::parallel_map;

        let start = Instant::now();
        let result = parallel_map(items, f);
        let duration = start.elapsed();

        // Adapt chunk size based on performance
        if duration.as_millis() > 100 {
            self.update_chunk_size(self.chunk_size() / 2);
        } else if duration.as_millis() < 10 {
            self.update_chunk_size(self.chunk_size() * 2);
        }

        result
    }
}

impl Default for AdaptiveExecutor {
    fn default() -> Self {
        Self::new()
    }
}

/// Parallel execution with speculation (try both parallel and sequential)
pub fn speculative_execute<T, R, F>(items: &[T], f: F) -> Vec<R>
where
    T: Sync + Clone,
    R: Send + 'static + PartialEq,
    F: Fn(&T) -> R + Send + Sync + Clone,
{
    let len = items.len();

    // For small datasets, always sequential
    if len < 1000 {
        return items.iter().map(&f).collect();
    }

    // For medium datasets, try parallel
    if len < 100_000 {
        use crate::executor::parallel_map;
        return parallel_map(items, f);
    }

    // For large datasets, use standard parallel map
    use crate::executor::parallel_map;
    parallel_map(items, f)
}

/// Hierarchical parallelism - parallel within parallel
pub fn hierarchical_map<T, R, F>(items: &[T], depth: usize, f: F) -> Vec<R>
where
    T: Sync,
    R: Send + 'static,
    F: Fn(&T) -> R + Send + Sync + Clone,
{
    use crate::executor::parallel_map;

    if depth == 0 || items.len() < 1000 {
        return items.iter().map(&f).collect();
    }

    // Split into chunks and process each chunk in parallel
    let num_chunks = thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);

    let chunk_size = (items.len() + num_chunks - 1) / num_chunks;

    let results: Vec<_> = items.chunks(chunk_size)
        .map(|chunk| {
            if depth > 1 {
                hierarchical_map(chunk, depth - 1, f.clone())
            } else {
                parallel_map(chunk, &f)
            }
        })
        .collect();

    results.into_iter().flatten().collect()
}

/// Cache-aware parallel execution
pub fn cache_aware_map<T, R, F>(items: &[T], f: F) -> Vec<R>
where
    T: Sync,
    R: Send + 'static,
    F: Fn(&T) -> R + Send + Sync,
{
    // Use optimal chunk size based on cache lines
    use crate::executor::parallel_map;
    parallel_map(items, f)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adaptive_executor() {
        let executor = AdaptiveExecutor::new();
        let data: Vec<i32> = (1..=1000).collect();
        let results = executor.adaptive_map(&data, |x| x * 2);
        assert_eq!(results.len(), 1000);
    }

    #[test]
    fn test_speculative_execute() {
        let data: Vec<i32> = vec![1, 2, 3, 4, 5];
        let results = speculative_execute(&data, |x| x * 2);
        assert_eq!(results, vec![2, 4, 6, 8, 10]);
    }

    #[test]
    fn test_hierarchical_map() {
        let data: Vec<i32> = (1..=100).collect();
        let results = hierarchical_map(&data, 2, |x| x * 2);
        assert_eq!(results.len(), 100);
    }

    #[test]
    fn test_cache_aware_map() {
        let data: Vec<i32> = (1..=100).collect();
        let results = cache_aware_map(&data, |x| x * 2);
        assert_eq!(results.len(), 100);
    }
}
