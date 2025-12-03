//! # avila-shard
extern crate alloc;
use alloc::vec::Vec;

pub struct ShardManager {
    pub shards: Vec<u64>,
}

impl ShardManager {
    pub fn new(num_shards: usize) -> Self {
        Self { shards: (0..num_shards as u64).collect() }
    }
    
    pub fn get_shard(&self, key: u64) -> u64 {
        self.shards[(key as usize) % self.shards.len()]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_shard() {
        let sm = ShardManager::new(4);
        assert_eq!(sm.shards.len(), 4);
        assert!(sm.get_shard(10) < 4);
    }
}
