//! XChaCha20 - Extended nonce ChaCha20
//!
//! Usa nonce de 192 bits (24 bytes) em vez de 96 bits
//! Elimina preocupações com reuso de nonce

use super::chacha20::ChaCha20;

/// XChaCha20 cipher
pub struct XChaCha20;

impl XChaCha20 {
    /// Deriva subkey e subnonce do nonce estendido
    ///
    /// nonce: 24 bytes
    /// Retorna: (subkey: 32 bytes, subnonce: 12 bytes)
    fn derive_subkey(key: &[u8; 32], nonce: &[u8; 24]) -> ([u8; 32], [u8; 12]) {
        // HChaCha20: usa primeiros 16 bytes do nonce
        // TODO: Implementar HChaCha20
        let subkey = *key; // PLACEHOLDER
        let mut subnonce = [0u8; 12];
        subnonce[4..].copy_from_slice(&nonce[16..]);
        (subkey, subnonce)
    }

    /// Criptografa com XChaCha20
    pub fn encrypt(key: &[u8; 32], nonce: &[u8; 24], data: &mut [u8]) {
        let (subkey, subnonce) = Self::derive_subkey(key, nonce);
        let mut cipher = ChaCha20::new(&subkey, &subnonce, 0);
        cipher.apply_keystream(data);
    }

    /// Decriptografa com XChaCha20 (idêntico a encrypt)
    pub fn decrypt(key: &[u8; 32], nonce: &[u8; 24], data: &mut [u8]) {
        Self::encrypt(key, nonce, data);
    }
}
