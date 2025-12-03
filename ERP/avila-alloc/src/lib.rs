//! # avila-alloc - Stack-First Memory Allocation
//!
//! Memory allocation strategies prioritizing stack allocation.
//!
//! ## Features
//!
//! - **Stack-First**: Prefer stack over heap allocation
//! - **Arena Allocators**: Bump allocation for temporary data
//! - **Fixed-Size Pools**: Pre-allocated memory pools
//! - **Zero Dependencies**: Only depends on avila-primitives
//! - **no_std Compatible**: Works in embedded environments
//! - **Thread-Safe**: Lock-free when possible
//!
//! ## Philosophy
//!
//! Following Avila's zero-dependencies philosophy, this crate provides
//! memory allocation patterns that favor stack allocation and minimize
//! heap pressure. All allocators are deterministic and predictable.
//!
//! ## Examples
//!
//! ```rust
//! use avila_alloc::{StackVec, Arena};
//!
//! // Stack-allocated vector with capacity 32
//! let mut vec = StackVec::<u32, 32>::new();
//! vec.push(1);
//! vec.push(2);
//! assert_eq!(vec.len(), 2);
//!
//! // Arena allocator for temporary allocations
//! let mut arena = Arena::new();
//! let slice = arena.alloc_slice::<u64>(10);
//! ```

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]
#![warn(clippy::all)]
#![warn(rust_2018_idioms)]

use core::{
    mem::{self, MaybeUninit},
    ops::{Deref, DerefMut},
    ptr,
    slice,
};

/// Stack-allocated vector with fixed capacity
#[derive(Debug)]
pub struct StackVec<T, const N: usize> {
    data: [MaybeUninit<T>; N],
    len: usize,
}

impl<T, const N: usize> StackVec<T, N> {
    /// Creates a new empty StackVec
    pub const fn new() -> Self {
        Self {
            data: unsafe { MaybeUninit::uninit().assume_init() },
            len: 0,
        }
    }

    /// Returns the number of elements
    pub const fn len(&self) -> usize {
        self.len
    }

    /// Returns true if empty
    pub const fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Returns the capacity
    pub const fn capacity(&self) -> usize {
        N
    }

    /// Returns remaining capacity
    pub const fn remaining_capacity(&self) -> usize {
        N - self.len
    }

    /// Pushes an element onto the vector
    pub fn push(&mut self, value: T) -> Result<(), T> {
        if self.len >= N {
            return Err(value);
        }
        self.data[self.len].write(value);
        self.len += 1;
        Ok(())
    }

    /// Pops an element from the vector
    pub fn pop(&mut self) -> Option<T> {
        if self.len == 0 {
            return None;
        }
        self.len -= 1;
        Some(unsafe { self.data[self.len].assume_init_read() })
    }

    /// Returns a slice of the vector
    pub fn as_slice(&self) -> &[T] {
        unsafe { slice::from_raw_parts(self.data.as_ptr() as *const T, self.len) }
    }

    /// Returns a mutable slice of the vector
    pub fn as_mut_slice(&mut self) -> &mut [T] {
        unsafe { slice::from_raw_parts_mut(self.data.as_mut_ptr() as *mut T, self.len) }
    }

    /// Clears the vector
    pub fn clear(&mut self) {
        while self.pop().is_some() {}
    }

    /// Tries to extend from slice
    pub fn try_extend_from_slice(&mut self, other: &[T]) -> Result<(), ()>
    where
        T: Copy,
    {
        if self.len + other.len() > N {
            return Err(());
        }
        for &item in other {
            let _ = self.push(item);
        }
        Ok(())
    }
}

impl<T, const N: usize> Default for StackVec<T, N> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T, const N: usize> Drop for StackVec<T, N> {
    fn drop(&mut self) {
        self.clear();
    }
}

impl<T, const N: usize> Deref for StackVec<T, N> {
    type Target = [T];

    fn deref(&self) -> &Self::Target {
        self.as_slice()
    }
}

impl<T, const N: usize> DerefMut for StackVec<T, N> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.as_mut_slice()
    }
}

/// Stack-allocated string with fixed capacity
pub type StackString<const N: usize> = StackVec<u8, N>;

impl<const N: usize> StackString<N> {
    /// Pushes a string slice
    pub fn push_str(&mut self, s: &str) -> Result<(), ()> {
        self.try_extend_from_slice(s.as_bytes())
    }

    /// Returns as str
    pub fn as_str(&self) -> &str {
        unsafe { core::str::from_utf8_unchecked(self.as_slice()) }
    }
}

/// Arena allocator for bump allocation
#[cfg(feature = "std")]
pub struct Arena {
    chunks: Vec<Vec<u8>>,
    current_chunk: usize,
    current_offset: usize,
    chunk_size: usize,
}

#[cfg(feature = "std")]
impl Arena {
    /// Creates a new arena with default chunk size (4KB)
    pub fn new() -> Self {
        Self::with_chunk_size(4096)
    }

    /// Creates arena with custom chunk size
    pub fn with_chunk_size(chunk_size: usize) -> Self {
        let mut chunks = Vec::new();
        chunks.push(vec![0u8; chunk_size]);
        Self {
            chunks,
            current_chunk: 0,
            current_offset: 0,
            chunk_size,
        }
    }

    /// Allocates a slice of T
    pub fn alloc_slice<T>(&mut self, count: usize) -> &mut [T] {
        let size = count * mem::size_of::<T>();
        let align = mem::align_of::<T>();

        // Align offset
        let offset = (self.current_offset + align - 1) & !(align - 1);

        if offset + size > self.chunk_size {
            // Need new chunk
            self.chunks.push(vec![0u8; self.chunk_size.max(size)]);
            self.current_chunk += 1;
            self.current_offset = 0;
            return self.alloc_slice(count);
        }

        let chunk = &mut self.chunks[self.current_chunk];
        let ptr = unsafe { chunk.as_mut_ptr().add(offset) as *mut T };
        self.current_offset = offset + size;

        unsafe { slice::from_raw_parts_mut(ptr, count) }
    }

    /// Allocates a single T
    pub fn alloc<T>(&mut self, value: T) -> &mut T {
        let slice = self.alloc_slice::<T>(1);
        slice[0] = value;
        &mut slice[0]
    }

    /// Resets the arena (keeps allocated memory)
    pub fn reset(&mut self) {
        self.current_chunk = 0;
        self.current_offset = 0;
    }

    /// Total allocated bytes
    pub fn total_allocated(&self) -> usize {
        self.chunks.iter().map(|c| c.capacity()).sum()
    }

    /// Used bytes in current chunk
    pub fn used_bytes(&self) -> usize {
        self.current_offset
    }
}

#[cfg(feature = "std")]
impl Default for Arena {
    fn default() -> Self {
        Self::new()
    }
}

/// Fixed-size object pool
pub struct Pool<T, const N: usize> {
    storage: [MaybeUninit<T>; N],
    free_list: [bool; N],
    allocated: usize,
}

impl<T, const N: usize> Pool<T, N> {
    /// Creates a new empty pool
    pub const fn new() -> Self {
        Self {
            storage: unsafe { MaybeUninit::uninit().assume_init() },
            free_list: [true; N],
            allocated: 0,
        }
    }

    /// Allocates an object from pool
    pub fn alloc(&mut self, value: T) -> Result<&mut T, T> {
        for i in 0..N {
            if self.free_list[i] {
                self.storage[i].write(value);
                self.free_list[i] = false;
                self.allocated += 1;
                return Ok(unsafe { self.storage[i].assume_init_mut() });
            }
        }
        Err(value)
    }

    /// Deallocates an object
    pub unsafe fn dealloc(&mut self, ptr: *mut T) {
        let base = self.storage.as_ptr() as *const T;
        let offset = ptr.offset_from(base);
        if offset >= 0 && (offset as usize) < N {
            let idx = offset as usize;
            if !self.free_list[idx] {
                ptr::drop_in_place(ptr);
                self.free_list[idx] = true;
                self.allocated -= 1;
            }
        }
    }

    /// Returns number of allocated objects
    pub const fn allocated(&self) -> usize {
        self.allocated
    }

    /// Returns pool capacity
    pub const fn capacity(&self) -> usize {
        N
    }

    /// Returns available slots
    pub const fn available(&self) -> usize {
        N - self.allocated
    }
}

impl<T, const N: usize> Default for Pool<T, N> {
    fn default() -> Self {
        Self::new()
    }
}

/// Prelude with commonly used types
pub mod prelude {
    pub use crate::{StackString, StackVec};
    #[cfg(feature = "std")]
    pub use crate::Arena;
    pub use crate::Pool;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stack_vec() {
        let mut vec = StackVec::<i32, 4>::new();
        assert_eq!(vec.len(), 0);
        assert_eq!(vec.capacity(), 4);

        vec.push(1).unwrap();
        vec.push(2).unwrap();
        assert_eq!(vec.len(), 2);
        assert_eq!(vec[0], 1);
        assert_eq!(vec[1], 2);

        let popped = vec.pop();
        assert_eq!(popped, Some(2));
        assert_eq!(vec.len(), 1);
    }

    #[test]
    fn test_stack_vec_overflow() {
        let mut vec = StackVec::<i32, 2>::new();
        vec.push(1).unwrap();
        vec.push(2).unwrap();
        assert!(vec.push(3).is_err());
    }

    #[test]
    fn test_stack_string() {
        let mut s = StackString::<16>::new();
        s.push_str("Hello").unwrap();
        assert_eq!(s.as_str(), "Hello");

        s.push_str(" World").unwrap();
        assert_eq!(s.as_str(), "Hello World");
    }

    #[test]
    #[cfg(feature = "std")]
    fn test_arena() {
        let mut arena = Arena::with_chunk_size(64);

        let slice1 = arena.alloc_slice::<u64>(4);
        slice1[0] = 42;
        assert_eq!(slice1[0], 42);

        let value = arena.alloc(123u32);
        assert_eq!(*value, 123);
    }

    #[test]
    fn test_pool() {
        let mut pool = Pool::<u64, 4>::new();
        assert_eq!(pool.capacity(), 4);
        assert_eq!(pool.allocated(), 0);

        let _ptr1 = pool.alloc(100).unwrap();
        assert_eq!(pool.allocated(), 1);

        let _ptr2 = pool.alloc(200).unwrap();
        assert_eq!(pool.allocated(), 2);
    }

    #[test]
    fn test_pool_exhaustion() {
        let mut pool = Pool::<i32, 2>::new();
        pool.alloc(1).unwrap();
        pool.alloc(2).unwrap();
        assert!(pool.alloc(3).is_err());
    }
}
