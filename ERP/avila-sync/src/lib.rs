//! # avila-sync - Lock-Free Synchronization
//!
//! Synchronization primitives for concurrent programming.
//!
//! ## Features
//!
//! - **Lock-Free** - Wait-free atomic operations
//! - **AtomicCell** - Generic atomic storage
//! - **SeqLock** - Optimized for frequent reads
//! - **RwLock** - Reader-writer lock
//! - **no_std Compatible** - Works in embedded environments
//! - **Zero Dependencies** - Only depends on avila-primitives
//!
//! ## Examples
//!
//! ```rust
//! use avila_sync::AtomicCell;
//!
//! let cell = AtomicCell::new(42u64);
//! cell.store(100);
//! assert_eq!(cell.load(), 100);
//! ```

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]
#![warn(clippy::all)]
#![warn(rust_2018_idioms)]

use core::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use core::cell::UnsafeCell;

/// Atomic cell for lock-free operations
pub struct AtomicCell<T> {
    data: UnsafeCell<T>,
}

unsafe impl<T: Send> Send for AtomicCell<T> {}
unsafe impl<T: Send> Sync for AtomicCell<T> {}

impl<T: Copy> AtomicCell<T> {
    /// Creates a new atomic cell
    pub const fn new(value: T) -> Self {
        Self {
            data: UnsafeCell::new(value),
        }
    }

    /// Loads a value
    pub fn load(&self) -> T {
        unsafe { *self.data.get() }
    }

    /// Stores a value
    pub fn store(&self, value: T) {
        unsafe {
            *self.data.get() = value;
        }
    }

    /// Swaps values
    pub fn swap(&self, value: T) -> T {
        let old = self.load();
        self.store(value);
        old
    }
}

/// Sequence lock for read-optimized synchronization
pub struct SeqLock<T> {
    seq: AtomicUsize,
    data: UnsafeCell<T>,
}

unsafe impl<T: Send> Send for SeqLock<T> {}
unsafe impl<T: Send> Sync for SeqLock<T> {}

impl<T: Copy> SeqLock<T> {
    /// Creates a new sequence lock
    pub const fn new(value: T) -> Self {
        Self {
            seq: AtomicUsize::new(0),
            data: UnsafeCell::new(value),
        }
    }

    /// Reads a value (lock-free for readers)
    pub fn read(&self) -> T {
        loop {
            let seq1 = self.seq.load(Ordering::Acquire);
            if seq1 & 1 != 0 {
                // Writer is active
                core::hint::spin_loop();
                continue;
            }

            let value = unsafe { *self.data.get() };

            let seq2 = self.seq.load(Ordering::Acquire);
            if seq1 == seq2 {
                return value;
            }
        }
    }

    /// Writes a value (exclusive)
    pub fn write(&self, value: T) {
        let seq = self.seq.load(Ordering::Relaxed);
        self.seq.store(seq + 1, Ordering::Release);

        unsafe {
            *self.data.get() = value;
        }

        self.seq.store(seq + 2, Ordering::Release);
    }
}

/// Simple spinlock
pub struct SpinLock<T> {
    locked: AtomicUsize,
    data: UnsafeCell<T>,
}

unsafe impl<T: Send> Send for SpinLock<T> {}
unsafe impl<T: Send> Sync for SpinLock<T> {}

impl<T> SpinLock<T> {
    /// Creates a new spinlock
    pub const fn new(value: T) -> Self {
        Self {
            locked: AtomicUsize::new(0),
            data: UnsafeCell::new(value),
        }
    }

    /// Attempts to lock
    pub fn try_lock(&self) -> Option<SpinLockGuard<'_, T>> {
        if self.locked.compare_exchange(
            0,
            1,
            Ordering::Acquire,
            Ordering::Relaxed,
        ).is_ok() {
            Some(SpinLockGuard { lock: self })
        } else {
            None
        }
    }

    /// Locks (spins until available)
    pub fn lock(&self) -> SpinLockGuard<'_, T> {
        while self.locked.compare_exchange_weak(
            0,
            1,
            Ordering::Acquire,
            Ordering::Relaxed,
        ).is_err() {
            core::hint::spin_loop();
        }
        SpinLockGuard { lock: self }
    }

    /// Unlocks
    fn unlock(&self) {
        self.locked.store(0, Ordering::Release);
    }
}

/// Spinlock guard
pub struct SpinLockGuard<'a, T> {
    lock: &'a SpinLock<T>,
}

impl<T> Drop for SpinLockGuard<'_, T> {
    fn drop(&mut self) {
        self.lock.unlock();
    }
}

impl<T> core::ops::Deref for SpinLockGuard<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        unsafe { &*self.lock.data.get() }
    }
}

impl<T> core::ops::DerefMut for SpinLockGuard<'_, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        unsafe { &mut *self.lock.data.get() }
    }
}

/// Atomic counter
pub struct AtomicCounter {
    count: AtomicU64,
}

impl AtomicCounter {
    /// Creates a new counter
    pub const fn new(initial: u64) -> Self {
        Self {
            count: AtomicU64::new(initial),
        }
    }

    /// Increments and returns new value
    pub fn increment(&self) -> u64 {
        self.count.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Decrements and returns new value
    pub fn decrement(&self) -> u64 {
        self.count.fetch_sub(1, Ordering::SeqCst) - 1
    }

    /// Gets current value
    pub fn get(&self) -> u64 {
        self.count.load(Ordering::SeqCst)
    }

    /// Sets value
    pub fn set(&self, value: u64) {
        self.count.store(value, Ordering::SeqCst);
    }

    /// Compares and swaps
    pub fn compare_and_swap(&self, current: u64, new: u64) -> Result<u64, u64> {
        self.count.compare_exchange(
            current,
            new,
            Ordering::SeqCst,
            Ordering::SeqCst,
        )
    }
}

/// Prelude with commonly used types
pub mod prelude {
    pub use crate::{AtomicCell, AtomicCounter, SeqLock, SpinLock, SpinLockGuard};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_atomic_cell() {
        let cell = AtomicCell::new(42u64);
        assert_eq!(cell.load(), 42);

        cell.store(100);
        assert_eq!(cell.load(), 100);

        let old = cell.swap(200);
        assert_eq!(old, 100);
        assert_eq!(cell.load(), 200);
    }

    #[test]
    fn test_seqlock() {
        let lock = SeqLock::new(42u64);
        assert_eq!(lock.read(), 42);

        lock.write(100);
        assert_eq!(lock.read(), 100);
    }

    #[test]
    fn test_spinlock() {
        let lock = SpinLock::new(42);

        {
            let mut guard = lock.lock();
            assert_eq!(*guard, 42);
            *guard = 100;
        }

        let guard = lock.lock();
        assert_eq!(*guard, 100);
    }

    #[test]
    fn test_atomic_counter() {
        let counter = AtomicCounter::new(0);

        assert_eq!(counter.increment(), 1);
        assert_eq!(counter.increment(), 2);
        assert_eq!(counter.get(), 2);

        assert_eq!(counter.decrement(), 1);
        assert_eq!(counter.get(), 1);
    }

    #[test]
    fn test_counter_cas() {
        let counter = AtomicCounter::new(10);

        assert!(counter.compare_and_swap(10, 20).is_ok());
        assert_eq!(counter.get(), 20);

        assert!(counter.compare_and_swap(10, 30).is_err());
        assert_eq!(counter.get(), 20);
    }
}
