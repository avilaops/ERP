//! # avila-quantum - Quantum-Resistant Crypto
extern crate alloc;
use alloc::vec::Vec;

pub struct QuantumKey {
    pub key_data: Vec<u8>,
}

impl QuantumKey {
    pub fn new(size: usize) -> Self {
        Self { key_data: vec![0u8; size] }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_quantum_key() {
        let key = QuantumKey::new(256);
        assert_eq!(key.key_data.len(), 256);
    }
}
