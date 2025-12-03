//! Parallel pipeline for chaining operations efficiently
//!
//! This module provides a high-performance pipeline for composing parallel operations

use std::marker::PhantomData;

/// A parallel pipeline stage
pub trait PipelineStage<T> {
    /// The output type of this pipeline stage
    type Output;
    /// Execute this pipeline stage on the given input
    fn execute(&self, input: T) -> Self::Output;
}

/// Pipeline builder for composing operations
pub struct Pipeline<T, F>
where
    F: Fn(T) -> T,
{
    stages: Vec<F>,
    _phantom: PhantomData<T>,
}

impl<T> Pipeline<T, fn(T) -> T> {
    /// Create a new empty pipeline
    pub fn new() -> Self {
        Self {
            stages: Vec::new(),
            _phantom: PhantomData,
        }
    }
}

impl<T, F> Pipeline<T, F>
where
    F: Fn(T) -> T,
{
    /// Add a stage to the pipeline
    pub fn add_stage(mut self, stage: F) -> Self {
        self.stages.push(stage);
        self
    }

    /// Execute the pipeline
    pub fn execute(&self, mut input: T) -> T {
        for stage in &self.stages {
            input = stage(input);
        }
        input
    }
}

/// Parallel map-reduce pipeline
pub struct MapReduce<T, M, R>
where
    M: Fn(&T) -> T,
    R: Fn(T, T) -> T,
{
    mapper: M,
    reducer: R,
    _phantom: PhantomData<T>,
}

impl<T, M, R> MapReduce<T, M, R>
where
    T: Send + Sync + Clone + 'static,
    M: Fn(&T) -> T + Send + Sync,
    R: Fn(T, T) -> T + Send + Sync,
{
    /// Create a new map-reduce pipeline
    pub fn new(mapper: M, reducer: R) -> Self {
        Self {
            mapper,
            reducer,
            _phantom: PhantomData,
        }
    }

    /// Execute map-reduce on data
    pub fn execute(&self, data: &[T]) -> Option<T> {
        use crate::executor::parallel_map;

        if data.is_empty() {
            return None;
        }

        let mapped = parallel_map(data, &self.mapper);

        // Parallel reduce
        let mut result = mapped.into_iter();
        let first = result.next()?;

        Some(result.fold(first, |acc, item| (self.reducer)(acc, item)))
    }
}

/// Batch processor for efficient bulk operations
pub struct BatchProcessor<T> {
    batch_size: usize,
    _phantom: PhantomData<T>,
}

impl<T> BatchProcessor<T> {
    /// Create a new batch processor
    pub fn new(batch_size: usize) -> Self {
        Self {
            batch_size,
            _phantom: PhantomData,
        }
    }

    /// Process data in batches
    pub fn process<F, R>(&self, data: &[T], processor: F) -> Vec<R>
    where
        T: Sync,
        R: Send,
        F: Fn(&[T]) -> Vec<R> + Send + Sync,
    {
        use crate::advanced::parallel_chunks;

        parallel_chunks(data, self.batch_size, processor)
            .into_iter()
            .flatten()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_reduce() {
        let data: Vec<i32> = vec![1, 2, 3, 4, 5];
        let mr = MapReduce::new(|x| x * 2, |a, b| a + b);
        let result = mr.execute(&data);
        assert_eq!(result, Some(30)); // (1+2+3+4+5)*2 = 30
    }

    #[test]
    fn test_batch_processor() {
        let data: Vec<i32> = (1..=100).collect();
        let processor = BatchProcessor::new(10);
        let results: Vec<i32> = processor.process(&data, |batch| {
            vec![batch.iter().copied().sum::<i32>()]
        });
        assert_eq!(results.len(), 10);
    }
}
