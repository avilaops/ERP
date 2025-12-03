//! SHA-3 - NIST standard (diferente de Keccak)
//!
//! Mesmo algoritmo Keccak mas com padding diferente

/// SHA3-256 hasher
pub struct Sha3_256;

impl Sha3_256 {
    /// Hash de dados
    pub fn hash(data: &[u8]) -> [u8; 32] {
        // Igual a Keccak-256 mas com padding 0x06 em vez de 0x01
        // TODO: Implementar
        [0u8; 32]
    }
}

/// SHA3-512
pub struct Sha3_512;

impl Sha3_512 {
    /// Hash de dados
    pub fn hash(data: &[u8]) -> [u8; 64] {
        // TODO: Implementar
        [0u8; 64]
    }
}
