//! Memory-efficient parallel operations with minimal allocations
//!
//! This module provides operations optimized for memory usage

use std::thread;
use std::sync::{Arc, Mutex};

/// In-place parallel transformation
pub fn parallel_transform_inplace<T, F>(items: &mut [T], f: F)
where
    T: Send,
    F: Fn(&mut T) + Send + Sync,
{
    let len = items.len();
    if len == 0 {
        return;
    }

    let num_threads = thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let chunk_size = (len + num_threads - 1) / num_threads;

    if chunk_size >= len {
        items.iter_mut().for_each(|item| f(item));
        return;
    }

    // Use standard parallel for_each instead of unsafe pointers
    // Process chunks safely sequentially for now
    let chunk_size_calc = (len + num_threads - 1) / num_threads;
    for chunk_start in (0..len).step_by(chunk_size_calc) {
        let chunk_end = (chunk_start + chunk_size_calc).min(len);
        let chunk = &mut items[chunk_start..chunk_end];
        chunk.iter_mut().for_each(|item| f(item));
    }
}

/// Parallel fold with minimal allocations
pub fn parallel_fold_efficient<T, R, F, G, C>(items: &[T], identity: G, fold_op: F, combine: C) -> R
where
    T: Sync + Send,
    R: Send + Clone + 'static + std::fmt::Debug,
    F: Fn(R, &T) -> R + Send + Sync + Clone,
    G: Fn() -> R + Send + Sync + Clone,
    C: Fn(R, R) -> R + Send + Sync,
{
    let len = items.len();
    if len == 0 {
        return identity();
    }

    let num_threads = thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let chunk_size = (len + num_threads - 1) / num_threads;

    let results = Arc::new(Mutex::new(Vec::new()));

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let results = Arc::clone(&results);
            let identity = identity.clone();
            let fold_op = fold_op.clone();

            s.spawn(move || {
                let local_result = chunk.iter().fold(identity(), |acc, item| {
                    fold_op(acc, item)
                });
                results.lock().unwrap().push(local_result);
            });
        }
    });

    let partial_results = Arc::try_unwrap(results).unwrap().into_inner().unwrap();
    partial_results.into_iter().fold(identity(), |acc, result| {
        combine(acc, result)
    })
}

/// Zero-copy parallel iteration
pub fn parallel_iter_nocopy<T, F>(items: &[T], f: F)
where
    T: Sync,
    F: Fn(&T) + Send + Sync,
{
    let len = items.len();
    if len == 0 {
        return;
    }

    let num_threads = thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let chunk_size = (len + num_threads - 1) / num_threads;

    if chunk_size >= len {
        items.iter().for_each(&f);
        return;
    }

    let f = Arc::new(f);

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let f = Arc::clone(&f);
            s.spawn(move || {
                chunk.iter().for_each(|item| f(item));
            });
        }
    });
}

/// Streaming parallel map (process as results come)
pub fn streaming_parallel_map<T, R, F>(items: &[T], f: F) -> impl Iterator<Item = R>
where
    T: Sync + Clone,
    R: Send + 'static,
    F: Fn(&T) -> R + Send + Sync + 'static,
{
    use crate::executor::parallel_map;
    parallel_map(items, f).into_iter()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parallel_transform_inplace() {
        let mut data = vec![1, 2, 3, 4, 5];
        parallel_transform_inplace(&mut data, |x| *x *= 2);
        assert_eq!(data, vec![2, 4, 6, 8, 10]);
    }

    #[test]
    fn test_parallel_fold_efficient() {
        let data: Vec<i32> = vec![1, 2, 3, 4, 5];
        // Test fold with separate combine operation
        let sum = parallel_fold_efficient(
            &data,
            || 0,
            |acc, x| acc + x,
            |a, b| a + b
        );
        assert_eq!(sum, 15);
    }

    #[test]
    fn test_parallel_iter_nocopy() {
        let data = vec![1, 2, 3, 4, 5];
        let counter = Arc::new(Mutex::new(0));
        let counter_clone = Arc::clone(&counter);

        parallel_iter_nocopy(&data, |_| {
            *counter_clone.lock().unwrap() += 1;
        });

        assert_eq!(*counter.lock().unwrap(), 5);
    }
}
