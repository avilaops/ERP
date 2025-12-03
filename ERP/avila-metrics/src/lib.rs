//! # avila-metrics - Performance Metrics
//!
//! High-performance metrics collection with minimal overhead.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

use avila_sync::AtomicCounter;

/// Counter metric
pub struct Counter {
    value: AtomicCounter,
}

impl Counter {
    /// Creates new counter
    pub const fn new() -> Self {
        Self {
            value: AtomicCounter::new(0),
        }
    }

    /// Increments counter
    pub fn inc(&self) {
        self.value.increment();
    }

    /// Increments by amount
    pub fn add(&self, n: u64) {
        for _ in 0..n {
            self.value.increment();
        }
    }

    /// Gets current value
    pub fn get(&self) -> u64 {
        self.value.get()
    }

    /// Resets counter
    pub fn reset(&self) {
        self.value.set(0);
    }
}

impl Default for Counter {
    fn default() -> Self {
        Self::new()
    }
}

/// Gauge metric
pub struct Gauge {
    value: AtomicCounter,
}

impl Gauge {
    /// Creates new gauge
    pub const fn new() -> Self {
        Self {
            value: AtomicCounter::new(0),
        }
    }

    /// Sets gauge value
    pub fn set(&self, value: u64) {
        self.value.set(value);
    }

    /// Increments gauge
    pub fn inc(&self) {
        self.value.increment();
    }

    /// Decrements gauge
    pub fn dec(&self) {
        self.value.decrement();
    }

    /// Gets current value
    pub fn get(&self) -> u64 {
        self.value.get()
    }
}

impl Default for Gauge {
    fn default() -> Self {
        Self::new()
    }
}

/// Histogram metric (simplified)
pub struct Histogram {
    count: Counter,
    sum: AtomicCounter,
}

impl Histogram {
    /// Creates new histogram
    pub const fn new() -> Self {
        Self {
            count: Counter::new(),
            sum: AtomicCounter::new(0),
        }
    }

    /// Records a value
    pub fn observe(&self, value: u64) {
        self.count.inc();
        for _ in 0..value {
            self.sum.increment();
        }
    }

    /// Gets count
    pub fn count(&self) -> u64 {
        self.count.get()
    }

    /// Gets sum
    pub fn sum(&self) -> u64 {
        self.sum.get()
    }

    /// Gets average
    pub fn avg(&self) -> f64 {
        let count = self.count();
        if count == 0 {
            0.0
        } else {
            self.sum() as f64 / count as f64
        }
    }
}

impl Default for Histogram {
    fn default() -> Self {
        Self::new()
    }
}

/// Prelude
pub mod prelude {
    pub use crate::{Counter, Gauge, Histogram};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_counter() {
        let counter = Counter::new();
        counter.inc();
        counter.inc();
        counter.add(3);
        assert_eq!(counter.get(), 5);
    }

    #[test]
    fn test_gauge() {
        let gauge = Gauge::new();
        gauge.set(100);
        assert_eq!(gauge.get(), 100);
        gauge.inc();
        assert_eq!(gauge.get(), 101);
        gauge.dec();
        assert_eq!(gauge.get(), 100);
    }

    #[test]
    fn test_histogram() {
        let hist = Histogram::new();
        hist.observe(10);
        hist.observe(20);
        hist.observe(30);

        assert_eq!(hist.count(), 3);
        assert_eq!(hist.sum(), 60);
        assert_eq!(hist.avg(), 20.0);
    }
}
