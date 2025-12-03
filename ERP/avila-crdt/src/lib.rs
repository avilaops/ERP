//! # avila-crdt
extern crate alloc;
use alloc::collections::BTreeMap;

/// G-Counter (Grow-only Counter)
pub struct GCounter {
    pub counts: BTreeMap<u64, u64>,
}

impl GCounter {
    pub fn new() -> Self {
        Self { counts: BTreeMap::new() }
    }
    
    pub fn increment(&mut self, node_id: u64) {
        *self.counts.entry(node_id).or_insert(0) += 1;
    }
    
    pub fn value(&self) -> u64 {
        self.counts.values().sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_gcounter() {
        let mut counter = GCounter::new();
        counter.increment(1);
        counter.increment(1);
        counter.increment(2);
        assert_eq!(counter.value(), 3);
    }
}
