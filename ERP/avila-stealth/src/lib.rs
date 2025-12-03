//! # avila-stealth - Stealth Addresses
extern crate alloc;
use alloc::vec::Vec;

pub struct StealthAddress {
    pub scan_key: Vec<u8>,
    pub spend_key: Vec<u8>,
}

impl StealthAddress {
    pub fn new(scan_key: Vec<u8>, spend_key: Vec<u8>) -> Self {
        Self { scan_key, spend_key }
    }
    
    pub fn generate_onetime(&self, _r: &[u8]) -> Vec<u8> {
        vec![0u8; 32]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_stealth() {
        let addr = StealthAddress::new(vec![1; 32], vec![2; 32]);
        let onetime = addr.generate_onetime(&[3u8; 32]);
        assert_eq!(onetime.len(), 32);
    }
}
