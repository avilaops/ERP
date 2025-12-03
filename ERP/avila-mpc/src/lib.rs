//! # avila-mpc - Multi-Party Computation
extern crate alloc;
use alloc::vec::Vec;

pub struct Party {
    pub id: u64,
    pub secret: Vec<u8>,
}

pub struct MpcProtocol {
    pub parties: Vec<Party>,
}

impl MpcProtocol {
    pub fn new() -> Self {
        Self { parties: Vec::new() }
    }
    
    pub fn add_party(&mut self, party: Party) {
        self.parties.push(party);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_mpc() {
        let mut mpc = MpcProtocol::new();
        mpc.add_party(Party { id: 1, secret: vec![1] });
        assert_eq!(mpc.parties.len(), 1);
    }
}
