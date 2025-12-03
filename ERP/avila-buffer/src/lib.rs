//! # avila-buffer - High-Performance Buffer Management
//!
//! Zero-copy buffer operations for efficient I/O.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

extern crate alloc;
use alloc::vec::Vec;
use avila_error::{Error, ErrorKind, Result};

/// Buffer with read/write cursors
pub struct ByteBuffer {
    data: Vec<u8>,
    read_pos: usize,
    write_pos: usize,
}

impl ByteBuffer {
    /// Creates new buffer with capacity
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            data: Vec::with_capacity(capacity),
            read_pos: 0,
            write_pos: 0,
        }
    }

    /// Creates buffer from existing data
    pub fn from_vec(data: Vec<u8>) -> Self {
        let len = data.len();
        Self {
            data,
            read_pos: 0,
            write_pos: len,
        }
    }

    /// Writes bytes to buffer
    pub fn write(&mut self, bytes: &[u8]) -> Result<usize> {
        let space = self.data.capacity() - self.write_pos;
        if space < bytes.len() {
            self.data.reserve(bytes.len() - space);
        }

        if self.write_pos + bytes.len() > self.data.len() {
            self.data.resize(self.write_pos + bytes.len(), 0);
        }

        self.data[self.write_pos..self.write_pos + bytes.len()].copy_from_slice(bytes);
        self.write_pos += bytes.len();
        Ok(bytes.len())
    }

    /// Reads bytes from buffer
    pub fn read(&mut self, buf: &mut [u8]) -> Result<usize> {
        let available = self.write_pos - self.read_pos;
        let to_read = available.min(buf.len());

        if to_read == 0 {
            return Ok(0);
        }

        buf[..to_read].copy_from_slice(&self.data[self.read_pos..self.read_pos + to_read]);
        self.read_pos += to_read;
        Ok(to_read)
    }

    /// Returns available bytes for reading
    pub fn available(&self) -> usize {
        self.write_pos - self.read_pos
    }

    /// Returns remaining capacity
    pub fn remaining(&self) -> usize {
        self.data.capacity() - self.write_pos
    }

    /// Resets read position
    pub fn reset(&mut self) {
        self.read_pos = 0;
        self.write_pos = 0;
    }

    /// Compacts buffer (moves unread data to start)
    pub fn compact(&mut self) {
        if self.read_pos > 0 {
            let available = self.available();
            self.data.copy_within(self.read_pos..self.write_pos, 0);
            self.read_pos = 0;
            self.write_pos = available;
        }
    }

    /// Returns slice of unread data
    pub fn as_slice(&self) -> &[u8] {
        &self.data[self.read_pos..self.write_pos]
    }
}

/// Ring buffer for circular data
pub struct RingBuffer<T, const N: usize> {
    data: [Option<T>; N],
    head: usize,
    tail: usize,
    size: usize,
}

impl<T, const N: usize> RingBuffer<T, N> {
    /// Creates new ring buffer
    pub const fn new() -> Self {
        Self {
            data: [const { None }; N],
            head: 0,
            tail: 0,
            size: 0,
        }
    }

    /// Pushes item to buffer
    pub fn push(&mut self, item: T) -> Result<()> {
        if self.size == N {
            return Err(Error::new(ErrorKind::InvalidState, "Ring buffer full"));
        }

        self.data[self.tail] = Some(item);
        self.tail = (self.tail + 1) % N;
        self.size += 1;
        Ok(())
    }

    /// Pops item from buffer
    pub fn pop(&mut self) -> Option<T> {
        if self.size == 0 {
            return None;
        }

        let item = self.data[self.head].take();
        self.head = (self.head + 1) % N;
        self.size -= 1;
        item
    }

    /// Returns current size
    pub const fn len(&self) -> usize {
        self.size
    }

    /// Checks if empty
    pub const fn is_empty(&self) -> bool {
        self.size == 0
    }

    /// Checks if full
    pub const fn is_full(&self) -> bool {
        self.size == N
    }

    /// Returns capacity
    pub const fn capacity(&self) -> usize {
        N
    }
}

impl<T, const N: usize> Default for RingBuffer<T, N> {
    fn default() -> Self {
        Self::new()
    }
}

/// Prelude
pub mod prelude {
    pub use crate::{ByteBuffer, RingBuffer};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_byte_buffer() {
        let mut buf = ByteBuffer::with_capacity(16);
        buf.write(b"Hello").unwrap();

        let mut read_buf = [0u8; 5];
        let n = buf.read(&mut read_buf).unwrap();
        assert_eq!(n, 5);
        assert_eq!(&read_buf, b"Hello");
    }

    #[test]
    fn test_ring_buffer() {
        let mut ring = RingBuffer::<i32, 4>::new();
        assert!(ring.is_empty());

        ring.push(1).unwrap();
        ring.push(2).unwrap();
        ring.push(3).unwrap();

        assert_eq!(ring.len(), 3);
        assert_eq!(ring.pop(), Some(1));
        assert_eq!(ring.pop(), Some(2));

        ring.push(4).unwrap();
        ring.push(5).unwrap();

        assert_eq!(ring.len(), 3);
    }
}
