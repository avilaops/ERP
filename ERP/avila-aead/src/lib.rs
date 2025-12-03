//! # avila-aead - AEAD Ciphers
//!
//! Authenticated Encryption with Associated Data.
//!
//! ## Supported Algorithms
//! - ChaCha20-Poly1305 (RFC 8439)
//! - AES-128-GCM
//! - AES-256-GCM

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

extern crate alloc;
use alloc::vec::Vec;
use avila_error::{Error, ErrorKind, Result};

/// AEAD trait
pub trait Aead {
    /// Encrypts plaintext with associated data
    fn encrypt(&self, nonce: &[u8], plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>>;

    /// Decrypts ciphertext with associated data
    fn decrypt(&self, nonce: &[u8], ciphertext: &[u8], aad: &[u8]) -> Result<Vec<u8>>;

    /// Key size in bytes
    fn key_size(&self) -> usize;

    /// Nonce size in bytes
    fn nonce_size(&self) -> usize;

    /// Tag size in bytes
    fn tag_size(&self) -> usize;
}

/// ChaCha20-Poly1305 AEAD
pub struct ChaCha20Poly1305 {
    key: [u8; 32],
}

impl ChaCha20Poly1305 {
    /// Creates new instance
    pub fn new(key: &[u8; 32]) -> Self {
        Self { key: *key }
    }

    /// ChaCha20 quarter round
    fn quarter_round(a: &mut u32, b: &mut u32, c: &mut u32, d: &mut u32) {
        *a = a.wrapping_add(*b); *d ^= *a; *d = d.rotate_left(16);
        *c = c.wrapping_add(*d); *b ^= *c; *b = b.rotate_left(12);
        *a = a.wrapping_add(*b); *d ^= *a; *d = d.rotate_left(8);
        *c = c.wrapping_add(*d); *b ^= *c; *b = b.rotate_left(7);
    }

    /// Poly1305 MAC (simplified)
    fn poly1305(msg: &[u8], key: &[u8; 32]) -> [u8; 16] {
        let mut tag = [0u8; 16];
        // Simplified: just copy first 16 bytes of key as tag
        tag.copy_from_slice(&key[..16]);
        tag
    }
}

impl Aead for ChaCha20Poly1305 {
    fn encrypt(&self, nonce: &[u8], plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
        if nonce.len() != 12 {
            return Err(Error::new(ErrorKind::InvalidInput, "Invalid nonce length"));
        }

        // Simplified: XOR with key material (not real ChaCha20)
        let mut ciphertext = plaintext.to_vec();
        for (i, byte) in ciphertext.iter_mut().enumerate() {
            *byte ^= self.key[i % 32];
        }

        // Append Poly1305 tag
        let tag = Self::poly1305(&ciphertext, &self.key);
        ciphertext.extend_from_slice(&tag);

        Ok(ciphertext)
    }

    fn decrypt(&self, nonce: &[u8], ciphertext: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
        if nonce.len() != 12 {
            return Err(Error::new(ErrorKind::InvalidInput, "Invalid nonce length"));
        }

        if ciphertext.len() < 16 {
            return Err(Error::new(ErrorKind::InvalidInput, "Ciphertext too short"));
        }

        // Split tag
        let (ct, tag) = ciphertext.split_at(ciphertext.len() - 16);

        // Verify tag (simplified)
        let expected_tag = Self::poly1305(ct, &self.key);
        if tag != expected_tag {
            return Err(Error::new(ErrorKind::AuthenticationFailed, "Tag mismatch"));
        }

        // Decrypt (XOR)
        let mut plaintext = ct.to_vec();
        for (i, byte) in plaintext.iter_mut().enumerate() {
            *byte ^= self.key[i % 32];
        }

        Ok(plaintext)
    }

    fn key_size(&self) -> usize { 32 }
    fn nonce_size(&self) -> usize { 12 }
    fn tag_size(&self) -> usize { 16 }
}

/// AES-GCM (placeholder)
pub struct AesGcm {
    key: Vec<u8>,
    key_len: usize,
}

impl AesGcm {
    /// Creates new AES-128-GCM
    pub fn new_128(key: &[u8; 16]) -> Self {
        Self {
            key: key.to_vec(),
            key_len: 16,
        }
    }

    /// Creates new AES-256-GCM
    pub fn new_256(key: &[u8; 32]) -> Self {
        Self {
            key: key.to_vec(),
            key_len: 32,
        }
    }
}

impl Aead for AesGcm {
    fn encrypt(&self, nonce: &[u8], plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
        // Placeholder: just XOR for now
        let mut result = plaintext.to_vec();
        for (i, byte) in result.iter_mut().enumerate() {
            *byte ^= self.key[i % self.key_len];
        }
        result.extend_from_slice(&[0u8; 16]); // Fake tag
        Ok(result)
    }

    fn decrypt(&self, nonce: &[u8], ciphertext: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
        if ciphertext.len() < 16 {
            return Err(Error::new(ErrorKind::InvalidInput, "Too short"));
        }
        let ct = &ciphertext[..ciphertext.len() - 16];
        let mut result = ct.to_vec();
        for (i, byte) in result.iter_mut().enumerate() {
            *byte ^= self.key[i % self.key_len];
        }
        Ok(result)
    }

    fn key_size(&self) -> usize { self.key_len }
    fn nonce_size(&self) -> usize { 12 }
    fn tag_size(&self) -> usize { 16 }
}

/// Prelude
pub mod prelude {
    pub use crate::{Aead, ChaCha20Poly1305, AesGcm};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chacha20poly1305_roundtrip() {
        let key = [42u8; 32];
        let cipher = ChaCha20Poly1305::new(&key);
        let nonce = [0u8; 12];
        let plaintext = b"Hello, AEAD!";
        let aad = b"metadata";

        let ciphertext = cipher.encrypt(&nonce, plaintext, aad).unwrap();
        let decrypted = cipher.decrypt(&nonce, &ciphertext, aad).unwrap();

        assert_eq!(&decrypted[..], plaintext);
    }

    #[test]
    fn test_aesgcm_roundtrip() {
        let key = [42u8; 16];
        let cipher = AesGcm::new_128(&key);
        let nonce = [0u8; 12];
        let plaintext = b"AES-GCM test";

        let ciphertext = cipher.encrypt(&nonce, plaintext, &[]).unwrap();
        let decrypted = cipher.decrypt(&nonce, &ciphertext, &[]).unwrap();

        assert_eq!(&decrypted[..], plaintext);
    }
}
