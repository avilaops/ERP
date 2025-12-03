//! # avila-pool - Generic Object Pooling
//!
//! Connection and resource management with object pools.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

extern crate alloc;
use alloc::vec::Vec;
use avila_error::{Error, ErrorKind, Result};
use avila_sync::AtomicCounter;

/// Pool trait
pub trait Pool<T> {
    /// Acquires resource from pool
    fn acquire(&mut self) -> Result<T>;

    /// Returns resource to pool
    fn release(&mut self, item: T);

    /// Current pool size
    fn size(&self) -> usize;
}

/// Simple fixed-size pool
pub struct SimplePool<T, F: FnMut() -> T> {
    items: Vec<Option<T>>,
    factory: F,
    capacity: usize,
    active: AtomicCounter,
}

impl<T, F: FnMut() -> T> SimplePool<T, F> {
    /// Creates new pool
    pub fn new(capacity: usize, factory: F) -> Self {
        let mut items = Vec::with_capacity(capacity);
        for _ in 0..capacity {
            items.push(None);
        }

        Self {
            items,
            factory,
            capacity,
            active: AtomicCounter::new(0),
        }
    }

    /// Gets available count
    pub fn available(&self) -> usize {
        self.capacity.saturating_sub(self.active.get() as usize)
    }
}

impl<T, F: FnMut() -> T> Pool<T> for SimplePool<T, F> {
    fn acquire(&mut self) -> Result<T> {
        // Try to reuse existing
        for item in &mut self.items {
            if let Some(value) = item.take() {
                self.active.increment();
                return Ok(value);
            }
        }

        // Check capacity
        if self.active.get() >= self.capacity as u64 {
            return Err(Error::new(ErrorKind::InvalidState, "Pool exhausted"));
        }

        // Create new
        self.active.increment();
        Ok((self.factory)())
    }

    fn release(&mut self, item: T) {
        // Find empty slot
        for slot in &mut self.items {
            if slot.is_none() {
                *slot = Some(item);
                self.active.decrement();
                return;
            }
        }

        // Pool full, drop item
        self.active.decrement();
    }

    fn size(&self) -> usize {
        self.active.get() as usize
    }
}

/// Pooled resource handle
pub struct Pooled<T> {
    item: Option<T>,
}

impl<T> Pooled<T> {
    /// Creates new pooled resource
    pub fn new(item: T) -> Self {
        Self { item: Some(item) }
    }

    /// Takes the inner value
    pub fn take(&mut self) -> Option<T> {
        self.item.take()
    }
}

/// Prelude
pub mod prelude {
    pub use crate::{Pool, SimplePool, Pooled};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pool_acquire() {
        let mut pool = SimplePool::new(10, || 42u32);
        let item = pool.acquire().unwrap();
        assert_eq!(item, 42);
        assert_eq!(pool.size(), 1);
    }

    #[test]
    fn test_pool_release() {
        let mut pool = SimplePool::new(10, || 42u32);
        let item = pool.acquire().unwrap();
        pool.release(item);
        assert_eq!(pool.size(), 0);
    }

    #[test]
    fn test_pool_exhausted() {
        let mut pool = SimplePool::new(2, || 42u32);
        let _a = pool.acquire().unwrap();
        let _b = pool.acquire().unwrap();
        assert!(pool.acquire().is_err());
    }

    #[test]
    fn test_pooled_resource() {
        let mut pooled = Pooled::new(42);
        assert_eq!(pooled.take(), Some(42));
        assert_eq!(pooled.take(), None);
    }
}
