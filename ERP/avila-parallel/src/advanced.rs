//! Advanced parallel operations
//!
//! This module provides advanced parallel operations including sorting, chunking, and windowing.

use std::thread;
use std::sync::{Arc, Mutex};
use std::cmp::Ordering;
use crate::executor::{num_cpus, calculate_chunk_size};

/// Parallel merge sort implementation
pub fn parallel_sort<T>(items: &mut [T])
where
    T: Ord + Send,
{
    parallel_sort_by(items, |a, b| a.cmp(b));
}

/// Parallel merge sort with custom comparator
pub fn parallel_sort_by<T, F>(items: &mut [T], compare: F)
where
    T: Send,
    F: Fn(&T, &T) -> Ordering + Send + Sync + Copy,
{
    let len = items.len();
    if len <= 1 {
        return;
    }

    // For small arrays, use sequential sort
    if len < 10_000 {
        items.sort_by(compare);
        return;
    }

    parallel_merge_sort(items, compare);
}

fn parallel_merge_sort<T, F>(items: &mut [T], compare: F)
where
    T: Send,
    F: Fn(&T, &T) -> Ordering + Send + Sync + Copy,
{
    let len = items.len();
    if len <= 10_000 {
        items.sort_by(compare);
        return;
    }

    let mid = len / 2;
    let (left, right) = items.split_at_mut(mid);

    thread::scope(|s| {
        s.spawn(move || parallel_merge_sort(left, compare));
        parallel_merge_sort(right, compare);
    });

    merge(items, mid, compare);
}

fn merge<T, F>(items: &mut [T], mid: usize, compare: F)
where
    T: Send,
    F: Fn(&T, &T) -> Ordering,
{
    // In-place merge using rotation
    let len = items.len();
    let mut start = 0;

    while start < mid && mid < len {
        if compare(&items[start], &items[mid]) != Ordering::Greater {
            start += 1;
            continue;
        }

        // Find position to insert items[mid]
        let mut end = mid;
        while end < len && compare(&items[start], &items[end]) == Ordering::Greater {
            end += 1;
        }

        // Rotate to move items[mid..end] before items[start]
        items[start..end].rotate_right(end - mid);
        start += end - mid;
    }
}

/// Parallel partition - splits into two vectors based on predicate
pub fn parallel_partition_advanced<T, F>(items: &[T], predicate: F) -> (Vec<T>, Vec<T>)
where
    T: Clone + Send + Sync,
    F: Fn(&T) -> bool + Send + Sync,
{
    let len = items.len();
    if len == 0 {
        return (Vec::new(), Vec::new());
    }

    let num_threads = num_cpus();
    let chunk_size = calculate_chunk_size(len, num_threads);

    if chunk_size >= len {
        let (true_items, false_items): (Vec<_>, Vec<_>) = items.iter()
            .cloned()
            .partition(|item| predicate(item));
        return (true_items, false_items);
    }

    let predicate = Arc::new(predicate);
    let results = Arc::new(Mutex::new(Vec::new()));

    thread::scope(|s| {
        for (idx, chunk) in items.chunks(chunk_size).enumerate() {
            let predicate = Arc::clone(&predicate);
            let results = Arc::clone(&results);
            s.spawn(move || {
                let (true_items, false_items): (Vec<_>, Vec<_>) = chunk.iter()
                    .cloned()
                    .partition(|item| predicate(item));
                results.lock().unwrap().push((idx, true_items, false_items));
            });
        }
    });

    let mut collected = Arc::try_unwrap(results)
        .unwrap_or_else(|_| panic!("Failed to unwrap Arc"))
        .into_inner()
        .unwrap_or_else(|_| panic!("Failed to acquire lock"));

    collected.sort_by_key(|(idx, _, _)| *idx);

    let (all_true, all_false): (Vec<_>, Vec<_>) = collected
        .into_iter()
        .map(|(_, t, f)| (t, f))
        .unzip();

    (
        all_true.into_iter().flatten().collect(),
        all_false.into_iter().flatten().collect(),
    )
}

/// Parallel zip - combines two slices element-wise
pub fn parallel_zip<T, U, F, R>(left: &[T], right: &[U], f: F) -> Vec<R>
where
    T: Sync,
    U: Sync,
    R: Send,
    F: Fn(&T, &U) -> R + Send + Sync,
{
    let len = left.len().min(right.len());
    if len == 0 {
        return Vec::new();
    }

    let num_threads = num_cpus();
    let chunk_size = calculate_chunk_size(len, num_threads);

    if chunk_size >= len {
        return left.iter()
            .zip(right.iter())
            .map(|(l, r)| f(l, r))
            .collect();
    }

    let f = Arc::new(f);
    let results = Arc::new(Mutex::new(Vec::new()));

    thread::scope(|s| {
        for (idx, (left_chunk, right_chunk)) in left[..len].chunks(chunk_size)
            .zip(right[..len].chunks(chunk_size))
            .enumerate()
        {
            let f = Arc::clone(&f);
            let results = Arc::clone(&results);
            s.spawn(move || {
                let chunk_results: Vec<_> = left_chunk.iter()
                    .zip(right_chunk.iter())
                    .map(|(l, r)| f(l, r))
                    .collect();
                results.lock().unwrap().push((idx, chunk_results));
            });
        }
    });

    let mut collected = Arc::try_unwrap(results)
        .unwrap_or_else(|_| panic!("Failed to unwrap Arc"))
        .into_inner()
        .unwrap_or_else(|_| panic!("Failed to acquire lock"));

    collected.sort_by_key(|(idx, _)| *idx);
    collected.into_iter().flat_map(|(_, results)| results).collect()
}

/// Parallel chunks - process data in fixed-size chunks
pub fn parallel_chunks<T, F, R>(items: &[T], chunk_size: usize, f: F) -> Vec<Vec<R>>
where
    T: Sync,
    R: Send,
    F: Fn(&[T]) -> Vec<R> + Send + Sync,
{
    if items.is_empty() || chunk_size == 0 {
        return Vec::new();
    }

    let f = Arc::new(f);
    let results = Arc::new(Mutex::new(Vec::new()));

    thread::scope(|s| {
        for (idx, chunk) in items.chunks(chunk_size).enumerate() {
            let f = Arc::clone(&f);
            let results = Arc::clone(&results);
            s.spawn(move || {
                let chunk_result = f(chunk);
                results.lock().unwrap().push((idx, chunk_result));
            });
        }
    });

    let mut collected = Arc::try_unwrap(results)
        .unwrap_or_else(|_| panic!("Failed to unwrap Arc"))
        .into_inner()
        .unwrap_or_else(|_| panic!("Failed to acquire lock"));

    collected.sort_by_key(|(idx, _)| *idx);
    collected.into_iter().map(|(_, results)| results).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parallel_sort() {
        let mut data = vec![5, 2, 8, 1, 9, 3, 7, 4, 6];
        parallel_sort(&mut data);
        assert_eq!(data, vec![1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }

    #[test]
    fn test_parallel_sort_large() {
        let mut data: Vec<i32> = (0..100_000).rev().collect();
        parallel_sort(&mut data);
        for i in 0..data.len() - 1 {
            assert!(data[i] <= data[i + 1]);
        }
    }

    #[test]
    fn test_parallel_zip() {
        let left = vec![1, 2, 3, 4, 5];
        let right = vec![10, 20, 30, 40, 50];
        let result = parallel_zip(&left, &right, |a, b| a + b);
        assert_eq!(result, vec![11, 22, 33, 44, 55]);
    }

    #[test]
    fn test_parallel_chunks() {
        let data = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let results = parallel_chunks(&data, 3, |chunk| {
            chunk.iter().map(|x| x * 2).collect()
        });
        assert_eq!(results.len(), 4); // 10 items / 3 per chunk = 4 chunks
        assert_eq!(results[0], vec![2, 4, 6]);
        assert_eq!(results[1], vec![8, 10, 12]);
    }
}
