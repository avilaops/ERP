//! # avila-partition
extern crate alloc;
use alloc::vec::Vec;

pub struct ConsistentHash {
    pub nodes: Vec<u64>,
}

impl ConsistentHash {
    pub fn new() -> Self {
        Self { nodes: Vec::new() }
    }
    
    pub fn add_node(&mut self, id: u64) {
        self.nodes.push(id);
    }
    
    pub fn get_node(&self, key: u64) -> Option<u64> {
        if self.nodes.is_empty() {
            None
        } else {
            Some(self.nodes[(key as usize) % self.nodes.len()])
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_hash() {
        let mut ch = ConsistentHash::new();
        ch.add_node(1);
        ch.add_node(2);
        assert!(ch.get_node(100).is_some());
    }
}
