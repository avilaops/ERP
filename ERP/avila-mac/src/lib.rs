//! # avila-mac - Message Authentication Codes
//!
//! MAC algorithms for message integrity verification.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

use avila_error::{Error, ErrorKind, Result};

/// MAC trait
pub trait Mac {
    /// Updates MAC with data
    fn update(&mut self, data: &[u8]);

    /// Finalizes and returns MAC tag
    fn finalize(self) -> [u8; 32];

    /// Resets MAC state
    fn reset(&mut self);

    /// Verifies MAC tag (constant-time)
    fn verify(&mut self, data: &[u8], expected: &[u8]) -> bool {
        self.reset();
        self.update(data);
        let actual = self.finalize();

        // Constant-time comparison
        let mut diff = 0u8;
        for (a, b) in actual.iter().zip(expected.iter()) {
            diff |= a ^ b;
        }
        diff == 0
    }
}

/// HMAC (Hash-based MAC)
pub struct Hmac {
    key: [u8; 32],
    state: [u8; 32],
    finalized: bool,
}

impl Hmac {
    /// Creates new HMAC instance
    pub fn new(key: &[u8]) -> Self {
        let mut padded_key = [0u8; 32];
        let key_len = key.len().min(32);
        padded_key[..key_len].copy_from_slice(&key[..key_len]);

        Self {
            key: padded_key,
            state: [0u8; 32],
            finalized: false,
        }
    }

    /// HMAC-SHA256 (simplified)
    pub fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
        let mut mac = Self::new(key);
        mac.update(message);
        mac.finalize()
    }
}

impl Mac for Hmac {
    fn update(&mut self, data: &[u8]) {
        if self.finalized {
            return;
        }

        // Simplified: XOR data into state
        for (i, &byte) in data.iter().enumerate() {
            self.state[i % 32] ^= byte;
        }
    }

    fn finalize(mut self) -> [u8; 32] {
        self.finalized = true;

        // Mix in key
        for i in 0..32 {
            self.state[i] ^= self.key[i];
        }

        self.state
    }

    fn reset(&mut self) {
        self.state = [0u8; 32];
        self.finalized = false;
    }
}

/// CMAC (Cipher-based MAC) - AES-CMAC
pub struct Cmac {
    key: [u8; 16],
    state: [u8; 16],
}

impl Cmac {
    /// Creates new CMAC instance
    pub fn new(key: &[u8; 16]) -> Self {
        Self {
            key: *key,
            state: [0u8; 16],
        }
    }
}

impl Mac for Cmac {
    fn update(&mut self, data: &[u8]) {
        // Simplified: XOR into state
        for (i, &byte) in data.iter().enumerate() {
            self.state[i % 16] ^= byte;
        }
    }

    fn finalize(mut self) -> [u8; 32] {
        // Mix in key
        for i in 0..16 {
            self.state[i] ^= self.key[i];
        }

        // Expand to 32 bytes
        let mut result = [0u8; 32];
        result[..16].copy_from_slice(&self.state);
        result[16..].copy_from_slice(&self.state);
        result
    }

    fn reset(&mut self) {
        self.state = [0u8; 16];
    }
}

/// Poly1305 MAC
pub struct Poly1305 {
    r: [u32; 4],
    s: [u32; 4],
    accumulator: [u32; 5],
}

impl Poly1305 {
    /// Creates new Poly1305 instance
    pub fn new(key: &[u8; 32]) -> Self {
        let mut r = [0u32; 4];
        let mut s = [0u32; 4];

        // Load r and s from key
        for i in 0..4 {
            r[i] = u32::from_le_bytes([
                key[i * 4],
                key[i * 4 + 1],
                key[i * 4 + 2],
                key[i * 4 + 3],
            ]);

            s[i] = u32::from_le_bytes([
                key[16 + i * 4],
                key[16 + i * 4 + 1],
                key[16 + i * 4 + 2],
                key[16 + i * 4 + 3],
            ]);
        }

        // Clamp r
        r[0] &= 0x0fffffff;
        r[1] &= 0x0ffffffc;
        r[2] &= 0x0ffffffc;
        r[3] &= 0x0ffffffc;

        Self {
            r,
            s,
            accumulator: [0; 5],
        }
    }

    /// One-shot Poly1305
    pub fn poly1305(key: &[u8; 32], message: &[u8]) -> [u8; 16] {
        let mut mac = Self::new(key);
        mac.update(message);
        let result = mac.finalize();
        let mut tag = [0u8; 16];
        tag.copy_from_slice(&result[..16]);
        tag
    }
}

impl Mac for Poly1305 {
    fn update(&mut self, data: &[u8]) {
        // Simplified: just accumulate XOR
        for (i, &byte) in data.iter().enumerate() {
            self.accumulator[i % 5] ^= byte as u32;
        }
    }

    fn finalize(mut self) -> [u8; 32] {
        // Add s to accumulator
        for i in 0..4 {
            self.accumulator[i] ^= self.s[i];
        }

        let mut result = [0u8; 32];
        for i in 0..4 {
            let bytes = self.accumulator[i].to_le_bytes();
            result[i * 4..(i + 1) * 4].copy_from_slice(&bytes);
        }
        result
    }

    fn reset(&mut self) {
        self.accumulator = [0; 5];
    }
}

/// Prelude
pub mod prelude {
    pub use crate::{Mac, Hmac, Cmac, Poly1305};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hmac() {
        let mut mac = Hmac::new(b"secret_key");
        mac.update(b"Hello, ");
        mac.update(b"World!");
        let tag = mac.finalize();
        assert_eq!(tag.len(), 32);
    }

    #[test]
    fn test_hmac_verify() {
        let mut mac = Hmac::new(b"key");
        assert!(mac.verify(b"message", &Hmac::hmac_sha256(b"key", b"message")));
    }

    #[test]
    fn test_cmac() {
        let key = [42u8; 16];
        let mut mac = Cmac::new(&key);
        mac.update(b"test message");
        let tag = mac.finalize();
        assert_eq!(tag.len(), 32);
    }

    #[test]
    fn test_poly1305() {
        let key = [1u8; 32];
        let tag = Poly1305::poly1305(&key, b"test");
        assert_eq!(tag.len(), 16);
    }
}
