//! # avila-election
extern crate alloc;
use alloc::vec::Vec;

pub struct LeaderElection {
    pub candidates: Vec<u64>,
    pub leader: Option<u64>,
}

impl LeaderElection {
    pub fn new() -> Self {
        Self { candidates: Vec::new(), leader: None }
    }
    
    pub fn add_candidate(&mut self, id: u64) {
        self.candidates.push(id);
    }
    
    pub fn elect(&mut self) {
        self.leader = self.candidates.iter().max().copied();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_election() {
        let mut election = LeaderElection::new();
        election.add_candidate(3);
        election.add_candidate(1);
        election.add_candidate(2);
        election.elect();
        assert_eq!(election.leader, Some(3));
    }
}
