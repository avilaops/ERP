//! Lock-free parallel operations using atomic operations
//!
//! This module provides lock-free implementations for maximum performance

use std::sync::atomic::{AtomicUsize, AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

/// Lock-free counter for parallel counting operations
pub struct AtomicCounter {
    count: AtomicUsize,
}

impl AtomicCounter {
    /// Create a new atomic counter
    pub fn new() -> Self {
        Self {
            count: AtomicUsize::new(0),
        }
    }

    /// Increment the counter
    #[inline]
    pub fn increment(&self) {
        self.count.fetch_add(1, Ordering::Relaxed);
    }

    /// Add a value to the counter
    #[inline]
    pub fn add(&self, value: usize) {
        self.count.fetch_add(value, Ordering::Relaxed);
    }

    /// Get the current count
    #[inline]
    pub fn get(&self) -> usize {
        self.count.load(Ordering::Acquire)
    }
}

/// Lock-free parallel count with atomic operations
pub fn lockfree_count<T, F>(items: &[T], predicate: F) -> usize
where
    T: Sync,
    F: Fn(&T) -> bool + Send + Sync,
{
    let len = items.len();
    if len == 0 {
        return 0;
    }

    let num_threads = thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let chunk_size = (len + num_threads - 1) / num_threads;

    if chunk_size >= len {
        return items.iter().filter(|item| predicate(item)).count();
    }

    let counter = Arc::new(AtomicCounter::new());
    let predicate = Arc::new(predicate);

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let counter = Arc::clone(&counter);
            let predicate = Arc::clone(&predicate);
            s.spawn(move || {
                let local_count = chunk.iter().filter(|item| predicate(item)).count();
                counter.add(local_count);
            });
        }
    });

    counter.get()
}

/// Lock-free parallel sum using atomic operations
pub fn lockfree_sum_i32(items: &[i32]) -> i32 {
    let len = items.len();
    if len == 0 {
        return 0;
    }

    let num_threads = thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let chunk_size = (len + num_threads - 1) / num_threads;

    if chunk_size >= len {
        return items.iter().sum();
    }

    let counter = Arc::new(AtomicCounter::new());

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let counter = Arc::clone(&counter);
            s.spawn(move || {
                let local_sum: i32 = chunk.iter().sum();
                // Use transmute to convert i32 to usize safely
                counter.add(local_sum as usize);
            });
        }
    });

    counter.get() as i32
}

/// Lock-free parallel any operation
pub fn lockfree_any<T, F>(items: &[T], predicate: F) -> bool
where
    T: Sync,
    F: Fn(&T) -> bool + Send + Sync,
{
    let len = items.len();
    if len == 0 {
        return false;
    }

    let num_threads = thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let chunk_size = (len + num_threads - 1) / num_threads;

    if chunk_size >= len {
        return items.iter().any(|item| predicate(item));
    }

    let found = Arc::new(AtomicBool::new(false));
    let predicate = Arc::new(predicate);

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let found = Arc::clone(&found);
            let predicate = Arc::clone(&predicate);
            s.spawn(move || {
                if found.load(Ordering::Relaxed) {
                    return; // Early exit if already found
                }
                if chunk.iter().any(|item| predicate(item)) {
                    found.store(true, Ordering::Release);
                }
            });
        }
    });

    found.load(Ordering::Acquire)
}

/// Lock-free parallel all operation
pub fn lockfree_all<T, F>(items: &[T], predicate: F) -> bool
where
    T: Sync,
    F: Fn(&T) -> bool + Send + Sync,
{
    let len = items.len();
    if len == 0 {
        return true;
    }

    let num_threads = thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let chunk_size = (len + num_threads - 1) / num_threads;

    if chunk_size >= len {
        return items.iter().all(|item| predicate(item));
    }

    let all_true = Arc::new(AtomicBool::new(true));
    let predicate = Arc::new(predicate);

    thread::scope(|s| {
        for chunk in items.chunks(chunk_size) {
            let all_true = Arc::clone(&all_true);
            let predicate = Arc::clone(&predicate);
            s.spawn(move || {
                if !all_true.load(Ordering::Relaxed) {
                    return; // Early exit if already false
                }
                if !chunk.iter().all(|item| predicate(item)) {
                    all_true.store(false, Ordering::Release);
                }
            });
        }
    });

    all_true.load(Ordering::Acquire)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_atomic_counter() {
        let counter = AtomicCounter::new();
        counter.increment();
        counter.add(5);
        assert_eq!(counter.get(), 6);
    }

    #[test]
    fn test_lockfree_count() {
        let data: Vec<i32> = (1..=10000).collect();
        let count = lockfree_count(&data, |x| x % 2 == 0);
        assert_eq!(count, 5000);
    }

    #[test]
    fn test_lockfree_any() {
        let data: Vec<i32> = (1..=1000).collect();
        assert!(lockfree_any(&data, |x| *x == 500));
        assert!(!lockfree_any(&data, |x| *x > 1000));
    }

    #[test]
    fn test_lockfree_all() {
        let data: Vec<i32> = vec![2, 4, 6, 8, 10];
        assert!(lockfree_all(&data, |x| x % 2 == 0));
        assert!(!lockfree_all(&data, |x| *x > 5));
    }
}
