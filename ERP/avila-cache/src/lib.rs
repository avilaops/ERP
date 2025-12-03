//! # avila-cache
extern crate alloc;
use alloc::collections::BTreeMap;

pub struct DistributedCache<K, V> {
    pub data: BTreeMap<K, V>,
}

impl<K: Ord, V> DistributedCache<K, V> {
    pub fn new() -> Self {
        Self { data: BTreeMap::new() }
    }
    
    pub fn insert(&mut self, key: K, value: V) {
        self.data.insert(key, value);
    }
    
    pub fn get(&self, key: &K) -> Option<&V> {
        self.data.get(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_cache() {
        let mut cache = DistributedCache::new();
        cache.insert(1u64, 100u64);
        assert_eq!(cache.get(&1), Some(&100));
    }
}
