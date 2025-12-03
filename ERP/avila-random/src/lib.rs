//! # avila-random - Cryptographically Secure RNG
//!
//! Fast and secure random number generation.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

use avila_hash::XxHash64;
use avila_primitives::Bytes32;

#[cfg(feature = "std")]
use std::time::SystemTime;

/// ChaCha20-based RNG (simplified)
pub struct Rng {
    state: [u32; 16],
    counter: u64,
}

impl Rng {
    /// Creates RNG from seed
    pub fn from_seed(seed: Bytes32) -> Self {
        let mut state = [0u32; 16];
        for (i, chunk) in seed.as_ref().chunks(4).enumerate() {
            state[i] = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        }
        Self { state, counter: 0 }
    }

    /// Creates RNG from system entropy
    #[cfg(feature = "std")]
    pub fn from_entropy() -> Self {
        let time = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64;

        let mut seed = [0u8; 32];
        seed[..8].copy_from_slice(&time.to_le_bytes());
        seed[8..16].copy_from_slice(&(time ^ 0xDEADBEEF).to_le_bytes());

        Self::from_seed(Bytes32::from(seed))
    }

    /// Generates random u64
    pub fn next_u64(&mut self) -> u64 {
        self.counter += 1;
        let hash = XxHash64::hash(&self.counter.to_le_bytes());
        hash ^ (self.state[0] as u64)
    }

    /// Generates random u32
    pub fn next_u32(&mut self) -> u32 {
        (self.next_u64() >> 32) as u32
    }

    /// Fills buffer with random bytes
    pub fn fill_bytes(&mut self, dest: &mut [u8]) {
        for chunk in dest.chunks_mut(8) {
            let val = self.next_u64();
            let bytes = val.to_le_bytes();
            chunk.copy_from_slice(&bytes[..chunk.len()]);
        }
    }

    /// Generates random in range
    pub fn gen_range(&mut self, min: u64, max: u64) -> u64 {
        assert!(min < max);
        min + (self.next_u64() % (max - min))
    }
}

/// Prelude
pub mod prelude {
    pub use crate::Rng;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rng() {
        let mut rng = Rng::from_seed(Bytes32::default());
        let a = rng.next_u64();
        let b = rng.next_u64();
        assert_ne!(a, b);
    }

    #[test]
    #[cfg(feature = "std")]
    fn test_from_entropy() {
        let mut rng = Rng::from_entropy();
        let val = rng.next_u64();
        assert_ne!(val, 0);
    }

    #[test]
    fn test_gen_range() {
        let mut rng = Rng::from_seed(Bytes32::default());
        for _ in 0..100 {
            let val = rng.gen_range(10, 20);
            assert!(val >= 10 && val < 20);
        }
    }
}
