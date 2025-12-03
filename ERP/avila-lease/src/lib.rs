//! # avila-lease
pub struct Lease {
    pub holder: u64,
    pub expiry: u64,
}

impl Lease {
    pub fn new(holder: u64, expiry: u64) -> Self {
        Self { holder, expiry }
    }
    
    pub fn is_expired(&self, now: u64) -> bool {
        now > self.expiry
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_lease() {
        let lease = Lease::new(1, 100);
        assert!(!lease.is_expired(50));
        assert!(lease.is_expired(150));
    }
}
