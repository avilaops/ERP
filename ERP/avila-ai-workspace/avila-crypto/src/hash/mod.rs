//! Funções de hash criptográficas

pub mod blake3;
pub mod keccak;

/// Trait para funções de hash
pub trait CryptographicHash {
    /// Tamanho do output em bytes
    const OUTPUT_SIZE: usize;

    /// Calcula hash de uma mensagem
    fn hash(data: &[u8]) -> alloc::vec::Vec<u8>;

    /// Calcula hash de múltiplos inputs
    fn hash_multi(inputs: &[&[u8]]) -> alloc::vec::Vec<u8>;
}
