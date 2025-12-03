//! # avila-replication
extern crate alloc;
use alloc::vec::Vec;

pub struct ReplicationGroup {
    pub primary: u64,
    pub replicas: Vec<u64>,
}

impl ReplicationGroup {
    pub fn new(primary: u64) -> Self {
        Self { primary, replicas: Vec::new() }
    }
    
    pub fn add_replica(&mut self, id: u64) {
        self.replicas.push(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_replication() {
        let mut group = ReplicationGroup::new(1);
        group.add_replica(2);
        assert_eq!(group.replicas.len(), 1);
    }
}
