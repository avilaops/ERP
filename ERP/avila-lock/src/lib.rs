//! # avila-lock
extern crate alloc;
use alloc::string::String;

pub struct DistributedLock {
    pub resource: String,
    pub holder: Option<u64>,
}

impl DistributedLock {
    pub fn new(resource: String) -> Self {
        Self { resource, holder: None }
    }
    
    pub fn acquire(&mut self, node_id: u64) -> bool {
        if self.holder.is_none() {
            self.holder = Some(node_id);
            true
        } else {
            false
        }
    }
    
    pub fn release(&mut self, node_id: u64) -> bool {
        if self.holder == Some(node_id) {
            self.holder = None;
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_lock() {
        let mut lock = DistributedLock::new("resource1".into());
        assert!(lock.acquire(1));
        assert!(!lock.acquire(2));
        assert!(lock.release(1));
    }
}
