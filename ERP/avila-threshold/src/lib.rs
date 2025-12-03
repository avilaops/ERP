//! # avila-threshold - Threshold Cryptography
extern crate alloc;
use alloc::vec::Vec;

pub struct Share {
    pub id: u64,
    pub value: Vec<u8>,
}

pub struct ThresholdScheme {
    pub threshold: usize,
    pub shares: Vec<Share>,
}

impl ThresholdScheme {
    pub fn new(threshold: usize) -> Self {
        Self { threshold, shares: Vec::new() }
    }
    
    pub fn add_share(&mut self, share: Share) {
        self.shares.push(share);
    }
    
    pub fn can_reconstruct(&self) -> bool {
        self.shares.len() >= self.threshold
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_threshold() {
        let mut scheme = ThresholdScheme::new(3);
        scheme.add_share(Share { id: 1, value: vec![1] });
        scheme.add_share(Share { id: 2, value: vec![2] });
        scheme.add_share(Share { id: 3, value: vec![3] });
        assert!(scheme.can_reconstruct());
    }
}
