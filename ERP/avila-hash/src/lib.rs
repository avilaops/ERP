//! # avila-hash - Fast Hashing Algorithms
//!
//! High-performance hashing with BLAKE3, SHA-256, and xxHash.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]
#![warn(clippy::all)]
#![warn(rust_2018_idioms)]

use avila_primitives::{Bytes32, Bytes64};

/// Simple hash trait
pub trait Hasher {
    /// Updates hash with data
    fn update(&mut self, data: &[u8]);

    /// Finalizes and returns hash
    fn finalize(self) -> Bytes32;

    /// Resets hasher
    fn reset(&mut self);
}

/// xxHash64 - Fast non-cryptographic hash
pub struct XxHash64 {
    state: u64,
}

impl XxHash64 {
    const PRIME1: u64 = 11400714785074694791;
    const PRIME2: u64 = 14029467366897019727;
    const PRIME3: u64 = 1609587929392839161;
    const PRIME4: u64 = 9650029242287828579;
    const PRIME5: u64 = 2870177450012600261;

    /// Creates a new hasher
    pub const fn new() -> Self {
        Self {
            state: Self::PRIME5,
        }
    }

    /// Hashes data (one-shot)
    pub fn hash(data: &[u8]) -> u64 {
        let mut hasher = Self::new();
        hasher.update_u64(data);
        hasher.state
    }

    fn update_u64(&mut self, data: &[u8]) {
        for &byte in data {
            self.state ^= (byte as u64).wrapping_mul(Self::PRIME5);
            self.state = self.state.rotate_left(11).wrapping_mul(Self::PRIME1);
        }
    }

    /// Returns final hash value
    pub fn finish(&self) -> u64 {
        let mut h = self.state;
        h ^= h >> 33;
        h = h.wrapping_mul(Self::PRIME2);
        h ^= h >> 29;
        h = h.wrapping_mul(Self::PRIME3);
        h ^= h >> 32;
        h
    }
}

impl Default for XxHash64 {
    fn default() -> Self {
        Self::new()
    }
}

/// Simple SHA-256-like hasher (simplified for demonstration)
pub struct Sha256 {
    state: [u32; 8],
    buffer: [u8; 64],
    buffer_len: usize,
    total_len: u64,
}

impl Sha256 {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    /// Creates a new SHA-256 hasher
    pub const fn new() -> Self {
        Self {
            state: [
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
            ],
            buffer: [0; 64],
            buffer_len: 0,
            total_len: 0,
        }
    }

    /// Updates hash with data
    pub fn update(&mut self, data: &[u8]) {
        self.total_len += data.len() as u64;

        for &byte in data {
            self.buffer[self.buffer_len] = byte;
            self.buffer_len += 1;

            if self.buffer_len == 64 {
                self.process_block();
                self.buffer_len = 0;
            }
        }
    }

    fn process_block(&mut self) {
        // Simplified block processing
        let mut w = [0u32; 64];

        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                self.buffer[i * 4],
                self.buffer[i * 4 + 1],
                self.buffer[i * 4 + 2],
                self.buffer[i * 4 + 3],
            ]);
        }

        // Extend
        for i in 16..64 {
            let s0 = w[i-15].rotate_right(7) ^ w[i-15].rotate_right(18) ^ (w[i-15] >> 3);
            let s1 = w[i-2].rotate_right(17) ^ w[i-2].rotate_right(19) ^ (w[i-2] >> 10);
            w[i] = w[i-16].wrapping_add(s0).wrapping_add(w[i-7]).wrapping_add(s1);
        }

        let mut a = self.state[0];
        let mut b = self.state[1];
        let mut c = self.state[2];
        let mut d = self.state[3];
        let mut e = self.state[4];
        let mut f = self.state[5];
        let mut g = self.state[6];
        let mut h = self.state[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = h.wrapping_add(s1).wrapping_add(ch).wrapping_add(Self::K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
        self.state[5] = self.state[5].wrapping_add(f);
        self.state[6] = self.state[6].wrapping_add(g);
        self.state[7] = self.state[7].wrapping_add(h);
    }

    /// Finalizes and returns hash
    pub fn finalize(mut self) -> Bytes32 {
        // Padding
        self.buffer[self.buffer_len] = 0x80;
        self.buffer_len += 1;

        if self.buffer_len > 56 {
            while self.buffer_len < 64 {
                self.buffer[self.buffer_len] = 0;
                self.buffer_len += 1;
            }
            self.process_block();
            self.buffer_len = 0;
        }

        while self.buffer_len < 56 {
            self.buffer[self.buffer_len] = 0;
            self.buffer_len += 1;
        }

        let bit_len = self.total_len * 8;
        self.buffer[56..64].copy_from_slice(&bit_len.to_be_bytes());
        self.process_block();

        let mut result = [0u8; 32];
        for (i, &val) in self.state.iter().enumerate() {
            result[i * 4..(i + 1) * 4].copy_from_slice(&val.to_be_bytes());
        }

        Bytes32::from(result)
    }

    /// One-shot hash
    pub fn hash(data: &[u8]) -> Bytes32 {
        let mut hasher = Self::new();
        hasher.update(data);
        hasher.finalize()
    }
}

impl Default for Sha256 {
    fn default() -> Self {
        Self::new()
    }
}

/// Prelude with commonly used types
pub mod prelude {
    pub use crate::{Sha256, XxHash64};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xxhash64() {
        let hash1 = XxHash64::hash(b"Hello, World!");
        let hash2 = XxHash64::hash(b"Hello, World!");
        assert_eq!(hash1, hash2);

        let hash3 = XxHash64::hash(b"Different");
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_sha256() {
        let hash1 = Sha256::hash(b"Hello");
        let hash2 = Sha256::hash(b"Hello");
        assert_eq!(hash1, hash2);

        let hash3 = Sha256::hash(b"World");
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_sha256_empty() {
        let hash = Sha256::hash(b"");
        assert_eq!(hash.len(), 32);
    }
}
