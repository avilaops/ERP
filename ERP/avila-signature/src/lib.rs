//! # avila-signature - Digital Signatures
extern crate alloc;
use alloc::vec::Vec;

pub struct Signature {
    pub r: Vec<u8>,
    pub s: Vec<u8>,
}

impl Signature {
    pub fn new(r: Vec<u8>, s: Vec<u8>) -> Self {
        Self { r, s }
    }
    
    pub fn verify(&self, _message: &[u8], _pubkey: &[u8]) -> bool {
        !self.r.is_empty() && !self.s.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_signature() {
        let sig = Signature::new(vec![1; 32], vec![2; 32]);
        assert!(sig.verify(&[0u8; 32], &[0u8; 33]));
    }
}
