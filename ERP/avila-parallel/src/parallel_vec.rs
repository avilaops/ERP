//! High-performance parallel iterators with true parallelism
//!
//! This module provides parallel iterator implementations that actually
//! execute in parallel using the thread pool.

use crate::executor;
use std::marker::PhantomData;

/// A parallel iterator that executes operations in parallel
pub struct ParallelVec<'a, T: Sync> {
    data: &'a [T],
}

impl<'a, T: Sync> ParallelVec<'a, T> {
    /// Create a new parallel vector iterator
    pub fn new(data: &'a [T]) -> Self {
        Self { data }
    }

    /// Map operation in parallel
    pub fn map<R, F>(self, f: F) -> ParallelMap<'a, T, R, F>
    where
        R: Send,
        F: Fn(&T) -> R + Send + Sync,
    {
        ParallelMap {
            data: self.data,
            f,
            _phantom: PhantomData,
        }
    }

    /// Filter operation in parallel
    pub fn filter<F>(self, f: F) -> ParallelFilter<'a, T, F>
    where
        F: Fn(&T) -> bool + Send + Sync,
    {
        ParallelFilter {
            data: self.data,
            f,
        }
    }

    /// For each operation in parallel
    pub fn for_each<F>(self, f: F)
    where
        F: Fn(&T) + Send + Sync,
    {
        executor::parallel_for_each(self.data, f);
    }

    /// Sum operation in parallel
    pub fn sum(self) -> T
    where
        T: Clone + Send + std::iter::Sum,
    {
        executor::parallel_sum(self.data)
    }

    /// Reduce operation in parallel
    pub fn reduce<F>(self, f: F) -> Option<T>
    where
        T: Clone + Send,
        F: Fn(T, T) -> T + Send + Sync,
    {
        executor::parallel_reduce(self.data, f)
    }

    /// Collect into a Vec
    pub fn collect(self) -> Vec<&'a T> {
        self.data.iter().collect()
    }
}

/// Parallel map operation
pub struct ParallelMap<'a, T, R, F> {
    data: &'a [T],
    f: F,
    _phantom: PhantomData<R>,
}

impl<'a, T, R, F> ParallelMap<'a, T, R, F>
where
    T: Sync,
    R: Send + 'static,
    F: Fn(&T) -> R + Send + Sync,
{
    /// Collect the mapped results
    pub fn collect(self) -> Vec<R> {
        executor::parallel_map(self.data, self.f)
    }

    /// Sum the mapped results
    pub fn sum(self) -> R
    where
        R: std::iter::Sum,
    {
        let results = self.collect();
        results.into_iter().sum()
    }
}

/// Parallel filter operation
pub struct ParallelFilter<'a, T, F> {
    data: &'a [T],
    f: F,
}

impl<'a, T, F> ParallelFilter<'a, T, F>
where
    T: Sync,
    F: Fn(&T) -> bool + Send + Sync,
{
    /// Collect the filtered results
    pub fn collect(self) -> Vec<&'a T> {
        executor::parallel_filter(self.data, self.f)
    }

    /// Map the filtered results
    pub fn map<R, F2>(self, f2: F2) -> Vec<R>
    where
        R: Send + 'static,
        F2: Fn(&T) -> R + Send + Sync,
    {
        let filtered = self.collect();
        executor::parallel_map(&filtered, |&item| f2(item))
    }
}

/// Extension trait to enable parallel iteration
pub trait IntoParallelVec<T: Sync> {
    /// Convert into a parallel vector iterator
    fn par_vec(&self) -> ParallelVec<'_, T>;
}

impl<T: Sync> IntoParallelVec<T> for Vec<T> {
    fn par_vec(&self) -> ParallelVec<'_, T> {
        ParallelVec::new(self)
    }
}

impl<T: Sync> IntoParallelVec<T> for [T] {
    fn par_vec(&self) -> ParallelVec<'_, T> {
        ParallelVec::new(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parallel_vec_map() {
        let data: Vec<i32> = (0..10000).collect();
        let results = data.par_vec().map(|&x| x * 2).collect();

        assert_eq!(results.len(), 10000);
        assert_eq!(results[0], 0);
        assert_eq!(results[9999], 19998);
    }

    #[test]
    fn test_parallel_vec_filter() {
        let data: Vec<i32> = (0..10000).collect();
        let results = data.par_vec().filter(|&x| x % 2 == 0).collect();

        assert_eq!(results.len(), 5000);
    }

    #[test]
    fn test_parallel_vec_sum() {
        let data: Vec<i32> = (1..=100).collect();
        let result = data.par_vec().sum();

        assert_eq!(result, 5050);
    }

    #[test]
    fn test_parallel_vec_reduce() {
        let data: Vec<i32> = (1..=10).collect();
        let result = data.par_vec().reduce(|a, b| a + b);

        assert_eq!(result, Some(55));
    }

    #[test]
    fn test_parallel_vec_chain() {
        let data: Vec<i32> = (0..1000).collect();
        let result: i32 = data.par_vec()
            .map(|&x| x * 2)
            .sum();

        let expected: i32 = (0..1000).map(|x| x * 2).sum();
        assert_eq!(result, expected);
    }
}
