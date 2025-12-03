//! Cifras de criptografia simétrica

pub mod chacha20;

/// Trait para cifras de stream
pub trait StreamCipher {
    /// Tamanho da chave em bytes
    const KEY_SIZE: usize;

    /// Tamanho do nonce em bytes
    const NONCE_SIZE: usize;

    /// Cifra/decifra dados (XOR com keystream)
    fn process(key: &[u8], nonce: &[u8], data: &[u8]) -> alloc::vec::Vec<u8>;
}
