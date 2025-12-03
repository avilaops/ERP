//! # avila-gossip - Gossip Protocol
extern crate alloc;
use alloc::vec::Vec;
use alloc::collections::BTreeMap;

/// Gossip message
#[derive(Clone, Debug)]
pub struct GossipMessage {
    pub sender_id: u64,
    pub version: u64,
    pub data: Vec<u8>,
}

/// Gossip node
pub struct GossipNode {
    pub id: u64,
    pub peers: Vec<u64>,
    pub state: BTreeMap<u64, u64>,
}

impl GossipNode {
    pub fn new(id: u64) -> Self {
        Self {
            id,
            peers: Vec::new(),
            state: BTreeMap::new(),
        }
    }
    
    pub fn add_peer(&mut self, peer_id: u64) {
        if !self.peers.contains(&peer_id) {
            self.peers.push(peer_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_new_node() {
        let node = GossipNode::new(1);
        assert_eq!(node.id, 1);
        assert_eq!(node.peers.len(), 0);
    }
    
    #[test]
    fn test_add_peer() {
        let mut node = GossipNode::new(1);
        node.add_peer(2);
        assert_eq!(node.peers.len(), 1);
    }
}
