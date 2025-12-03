//! Parallel execution engine
//!
//! Core parallel execution primitives for distributing work across threads using scoped threads.

use std::thread;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

/// Minimum chunk size to avoid overhead (increased based on benchmarks)
/// Benchmarks showed best results with chunks >= 1024 for simple operations
const MIN_CHUNK_SIZE: usize = 1024;

/// Maximum number of chunks per thread (allows better distribution)
const MAX_CHUNKS_PER_THREAD: usize = 8;

/// Get number of CPUs
pub fn num_cpus() -> usize {
    thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
}

/// Get minimum chunk size (configurable via AVILA_MIN_CHUNK_SIZE env var)
pub fn get_min_chunk_size() -> usize {
    std::env::var("AVILA_MIN_CHUNK_SIZE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(MIN_CHUNK_SIZE)
}

/// Calculate optimal chunk size based on data length and CPU count
pub fn calculate_chunk_size(len: usize, num_threads: usize) -> usize {
    let min_chunk = get_min_chunk_size();
    let max_chunks = num_threads * MAX_CHUNKS_PER_THREAD;
    let chunk_size = (len + max_chunks - 1) / max_chunks;
    chunk_size.max(min_chunk)
}

/// Execute function on each item in parallel using scoped threads
pub fn parallel_for_each<T, F>(items: &[T], f: F)
where
    T: Sync,
    F: Fn(&T) + Sync + Send,
{
    let len = items.len();
    if len == 0 {
        return;
    }

    let num_threads = num_cpus();
    let chunk_size = calculate_chunk_size(len, num_threads);

    if chunk_size >= len {
        // Too small, run sequentially
        for item in items {
            f(item);
        }
        return;
    }

    // Wrap function in Arc to share across threads
    let f = Arc::new(f);

    // Use scoped threads to avoid lifetime issues
    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let f = Arc::clone(&f);
            s.spawn(move || {
                for item in chunk {
                    f(item);
                }
            });
        }
    });
}

/// Execute a map operation in parallel
pub fn parallel_map<T, R, F>(items: &[T], f: F) -> Vec<R>
where
    T: Sync,
    R: Send + 'static,
    F: Fn(&T) -> R + Sync + Send,
{
    let len = items.len();
    if len == 0 {
        return Vec::new();
    }

    let num_threads = num_cpus();
    let chunk_size = calculate_chunk_size(len, num_threads);

    if chunk_size >= len {
        // Too small, run sequentially
        return items.iter().map(&f).collect();
    }

    // Wrap function in Arc to share across threads
    let f = Arc::new(f);
    // Create vector to store (index, results) for each chunk
    let chunk_results = Arc::new(Mutex::new(Vec::new()));

    thread::scope(|s| {
        let mut start_idx = 0;
        for chunk in items.chunks(chunk_size) {
            let f = Arc::clone(&f);
            let chunk_results = Arc::clone(&chunk_results);
            let chunk_start = start_idx;
            start_idx += chunk.len();

            s.spawn(move || {
                let results: Vec<R> = chunk.iter().map(|item| f(item)).collect();
                chunk_results.lock().unwrap().push((chunk_start, results));
            });
        }
    });

    // Extract and sort results by chunk start index
    let mut sorted_chunks = Arc::try_unwrap(chunk_results)
        .unwrap_or_else(|_| panic!("Failed to unwrap Arc"))
        .into_inner()
        .unwrap_or_else(|_| panic!("Failed to acquire lock"));

    sorted_chunks.sort_by_key(|(idx, _)| *idx);

    // Flatten sorted chunks into final result
    let mut results = Vec::with_capacity(len);
    for (_, chunk) in sorted_chunks {
        results.extend(chunk);
    }
    results
}

/// Execute a filter operation in parallel
pub fn parallel_filter<T, F>(items: &[T], f: F) -> Vec<&T>
where
    T: Sync,
    F: Fn(&T) -> bool + Sync + Send,
{
    let len = items.len();
    if len == 0 {
        return Vec::new();
    }

    let num_threads = num_cpus();
    let chunk_size = calculate_chunk_size(len, num_threads);

    if chunk_size >= len {
        // Too small, run sequentially
        return items.iter().filter(|item| f(item)).collect();
    }

    // Wrap function in Arc to share across threads
    let f = Arc::new(f);
    // Shared result vector
    let results = Arc::new(Mutex::new(Vec::new()));

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let f = Arc::clone(&f);
            let results = Arc::clone(&results);
            s.spawn(move || {
                let chunk_results: Vec<&T> = chunk.iter().filter(|item| f(item)).collect();
                results.lock().unwrap().extend(chunk_results);
            });
        }
    });

    // Extract results from Arc<Mutex<>>
    Arc::try_unwrap(results)
        .unwrap_or_else(|_| panic!("Failed to unwrap Arc"))
        .into_inner()
        .unwrap_or_else(|_| panic!("Failed to acquire lock"))
}

/// Execute a reduce operation in parallel
pub fn parallel_reduce<T, F>(items: &[T], reduce_op: F) -> Option<T>
where
    T: Clone + Send + Sync,
    F: Fn(T, T) -> T + Sync + Send,
{
    let len = items.len();
    if len == 0 {
        return None;
    }

    let num_threads = num_cpus();
    let chunk_size = calculate_chunk_size(len, num_threads);

    if chunk_size >= len {
        // Too small, run sequentially
        return items.iter().cloned().reduce(|a, b| reduce_op(a, b));
    }

    // Wrap function in Arc to share across threads
    let reduce_op = Arc::new(reduce_op);
    // Collect partial results from each chunk
    let results = Arc::new(Mutex::new(Vec::new()));

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let reduce_op = Arc::clone(&reduce_op);
            let results = Arc::clone(&results);
            s.spawn(move || {
                if let Some(chunk_result) = chunk.iter().cloned().reduce(|a, b| reduce_op(a, b)) {
                    results.lock().unwrap().push(chunk_result);
                }
            });
        }
    });

    // Final reduce on partial results
    let final_results = Arc::try_unwrap(results)
        .unwrap_or_else(|_| panic!("Failed to unwrap Arc"))
        .into_inner()
        .unwrap_or_else(|_| panic!("Failed to acquire lock"));
    final_results.into_iter().reduce(|a, b| reduce_op(a, b))
}

/// Find first element that satisfies predicate (parallel with early termination)
pub fn parallel_find<T, F>(items: &[T], predicate: F) -> Option<T>
where
    T: Clone + Send + Sync,
    F: Fn(&T) -> bool + Sync + Send,
{
    let len = items.len();
    if len == 0 {
        return None;
    }

    let num_threads = num_cpus();
    let chunk_size = calculate_chunk_size(len, num_threads);

    if chunk_size >= len {
        // Too small, run sequentially
        return items.iter().find(|item| predicate(item)).cloned();
    }

    // Wrap function in Arc to share across threads
    let predicate = Arc::new(predicate);
    let result = Arc::new(Mutex::new(None));
    let found_flag = Arc::new(AtomicBool::new(false));  // Early termination flag

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let predicate = Arc::clone(&predicate);
            let result = Arc::clone(&result);
            let found_flag = Arc::clone(&found_flag);
            s.spawn(move || {
                // Early termination: skip if already found
                if found_flag.load(Ordering::Relaxed) {
                    return;
                }
                if let Some(found) = chunk.iter().find(|item| predicate(item)) {
                    found_flag.store(true, Ordering::Relaxed);
                    let mut res = result.lock().unwrap();
                    if res.is_none() {
                        *res = Some(found.clone());
                    }
                }
            });
        }
    });

    Arc::try_unwrap(result)
        .unwrap_or_else(|_| panic!("Failed to unwrap Arc"))
        .into_inner()
        .unwrap_or_else(|_| panic!("Failed to acquire lock"))
}

/// Count elements that satisfy predicate (parallel)
pub fn parallel_count<T, F>(items: &[T], predicate: F) -> usize
where
    T: Sync,
    F: Fn(&T) -> bool + Sync + Send,
{
    let len = items.len();
    if len == 0 {
        return 0;
    }

    let num_threads = num_cpus();
    let chunk_size = calculate_chunk_size(len, num_threads);

    if chunk_size >= len {
        // Too small, run sequentially
        return items.iter().filter(|item| predicate(item)).count();
    }

    // Wrap function in Arc to share across threads
    let predicate = Arc::new(predicate);
    let counts = Arc::new(Mutex::new(Vec::new()));

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let predicate = Arc::clone(&predicate);
            let counts = Arc::clone(&counts);
            s.spawn(move || {
                let count = chunk.iter().filter(|item| predicate(item)).count();
                counts.lock().unwrap().push(count);
            });
        }
    });

    Arc::try_unwrap(counts)
        .unwrap_or_else(|_| panic!("Failed to unwrap Arc"))
        .into_inner()
        .unwrap_or_else(|_| panic!("Failed to acquire lock"))
        .into_iter()
        .sum()
}

/// Partition elements based on predicate (parallel)
pub fn parallel_partition<T, F>(items: &[T], predicate: F) -> (Vec<T>, Vec<T>)
where
    T: Clone + Send + Sync,
    F: Fn(&T) -> bool + Sync + Send,
{
    let len = items.len();
    if len == 0 {
        return (Vec::new(), Vec::new());
    }

    let num_threads = num_cpus();
    let chunk_size = calculate_chunk_size(len, num_threads);

    if chunk_size >= len {
        // Too small, run sequentially
        let mut true_vec = Vec::new();
        let mut false_vec = Vec::new();
        for item in items {
            if predicate(item) {
                true_vec.push(item.clone());
            } else {
                false_vec.push(item.clone());
            }
        }
        return (true_vec, false_vec);
    }

    // Wrap function in Arc to share across threads
    let predicate = Arc::new(predicate);
    let results = Arc::new(Mutex::new(Vec::new()));

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let predicate = Arc::clone(&predicate);
            let results = Arc::clone(&results);
            s.spawn(move || {
                let mut true_vec = Vec::new();
                let mut false_vec = Vec::new();
                for item in chunk {
                    if predicate(item) {
                        true_vec.push(item.clone());
                    } else {
                        false_vec.push(item.clone());
                    }
                }
                results.lock().unwrap().push((true_vec, false_vec));
            });
        }
    });

    let chunk_results = Arc::try_unwrap(results)
        .unwrap_or_else(|_| panic!("Failed to unwrap Arc"))
        .into_inner()
        .unwrap_or_else(|_| panic!("Failed to acquire lock"));

    let mut final_true = Vec::new();
    let mut final_false = Vec::new();
    for (true_vec, false_vec) in chunk_results {
        final_true.extend(true_vec);
        final_false.extend(false_vec);
    }
    (final_true, final_false)
}

/// Sum elements in parallel
pub fn parallel_sum<T>(items: &[T]) -> T
where
    T: Clone + Send + Sync + std::iter::Sum,
{
    let len = items.len();
    if len == 0 {
        panic!("Cannot sum empty collection");
    }

    let num_threads = num_cpus();
    let chunk_size = calculate_chunk_size(len, num_threads);

    if chunk_size >= len {
        // Too small, run sequentially
        return items.iter().cloned().sum();
    }

    // Collect partial sums from each chunk
    let results = Arc::new(Mutex::new(Vec::new()));

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let results = Arc::clone(&results);
            s.spawn(move || {
                let chunk_sum: T = chunk.iter().cloned().sum();
                results.lock().unwrap().push(chunk_sum);
            });
        }
    });

    // Sum the partial results
    Arc::try_unwrap(results)
        .unwrap_or_else(|_| panic!("Failed to unwrap Arc"))
        .into_inner()
        .unwrap_or_else(|_| panic!("Failed to acquire lock"))
        .into_iter()
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parallel_for_each() {
        let data = vec![1, 2, 3, 4, 5];
        let counter = Arc::new(Mutex::new(0));

        parallel_for_each(&data, |_| {
            *counter.lock().unwrap() += 1;
        });

        assert_eq!(*counter.lock().unwrap(), 5);
    }

    #[test]
    fn test_parallel_map() {
        let data = vec![1, 2, 3, 4, 5];
        let result = parallel_map(&data, |x| x * 2);

        let mut sorted_result = result;
        sorted_result.sort();
        assert_eq!(sorted_result, vec![2, 4, 6, 8, 10]);
    }

    #[test]
    fn test_parallel_filter() {
        let data = vec![1, 2, 3, 4, 5, 6];
        let result = parallel_filter(&data, |x| *x % 2 == 0);

        let mut values: Vec<i32> = result.into_iter().map(|x| *x).collect();
        values.sort();
        assert_eq!(values, vec![2, 4, 6]);
    }

    #[test]
    fn test_parallel_reduce() {
        let data = vec![1, 2, 3, 4, 5];
        let result = parallel_reduce(&data, |a, b| a + b);
        assert_eq!(result, Some(15));
    }

    #[test]
    fn test_parallel_sum() {
        let data = vec![1, 2, 3, 4, 5];
        let result = parallel_sum(&data);
        assert_eq!(result, 15);
    }

    #[test]
    fn test_parallel_find() {
        let data = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let result = parallel_find(&data, |x| *x > 5);
        assert!(result.is_some());
        assert!(result.unwrap() > 5);
    }

    #[test]
    fn test_parallel_count() {
        let data = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let count = parallel_count(&data, |x| *x % 2 == 0);
        assert_eq!(count, 5);
    }

    #[test]
    fn test_parallel_partition() {
        let data = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let (evens, odds) = parallel_partition(&data, |x| *x % 2 == 0);
        assert_eq!(evens.len(), 5);
        assert_eq!(odds.len(), 5);
        assert!(evens.iter().all(|x| x % 2 == 0));
        assert!(odds.iter().all(|x| x % 2 == 1));
    }
}
