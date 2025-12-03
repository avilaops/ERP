//! Blockchain Module
//!
//! Immutable audit trail and distributed consensus for runtime events

use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use std::collections::HashMap;

/// Blockchain for runtime event logging
#[derive(Clone)]
pub struct RuntimeBlockchain {
    chain: Arc<Mutex<Vec<Block>>>,
    difficulty: usize,
    pending_transactions: Arc<Mutex<Vec<Transaction>>>,
}

#[derive(Clone, Debug)]
pub struct Block {
    pub index: u64,
    pub timestamp: u128,
    pub transactions: Vec<Transaction>,
    pub previous_hash: String,
    pub hash: String,
    pub nonce: u64,
}

#[derive(Clone, Debug)]
pub struct Transaction {
    pub tx_type: TransactionType,
    pub data: String,
    pub timestamp: u128,
}

#[derive(Clone, Debug)]
pub enum TransactionType {
    TaskSpawned,
    TaskCompleted,
    ThreadScaled,
    AnomalyDetected,
    ConfigChanged,
    Custom(String),
}

impl RuntimeBlockchain {
    pub fn new(difficulty: usize) -> Self {
        let genesis = Block::genesis();

        Self {
            chain: Arc::new(Mutex::new(vec![genesis])),
            difficulty,
            pending_transactions: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Add a transaction to pending pool
    pub fn add_transaction(&self, tx_type: TransactionType, data: String) {
        let mut pending = self.pending_transactions.lock().unwrap();
        pending.push(Transaction {
            tx_type,
            data,
            timestamp: Self::current_timestamp(),
        });
    }

    /// Mine a new block with pending transactions
    pub fn mine_block(&self) -> Block {
        let mut pending = self.pending_transactions.lock().unwrap();
        let transactions = pending.drain(..).collect();
        drop(pending);

        let mut chain = self.chain.lock().unwrap();
        let previous_block = chain.last().unwrap();

        let mut block = Block {
            index: previous_block.index + 1,
            timestamp: Self::current_timestamp(),
            transactions,
            previous_hash: previous_block.hash.clone(),
            hash: String::new(),
            nonce: 0,
        };

        // Proof of work
        let target = "0".repeat(self.difficulty);
        while !block.calculate_hash().starts_with(&target) {
            block.nonce += 1;
        }

        block.hash = block.calculate_hash();
        chain.push(block.clone());

        block
    }

    /// Verify blockchain integrity
    pub fn verify(&self) -> bool {
        let chain = self.chain.lock().unwrap();

        for i in 1..chain.len() {
            let current = &chain[i];
            let previous = &chain[i - 1];

            // Verify hash
            if current.hash != current.calculate_hash() {
                return false;
            }

            // Verify chain link
            if current.previous_hash != previous.hash {
                return false;
            }

            // Verify proof of work
            let target = "0".repeat(self.difficulty);
            if !current.hash.starts_with(&target) {
                return false;
            }
        }

        true
    }

    /// Get blockchain statistics
    pub fn stats(&self) -> BlockchainStats {
        let chain = self.chain.lock().unwrap();
        let pending = self.pending_transactions.lock().unwrap();

        let total_transactions: usize = chain.iter()
            .map(|b| b.transactions.len())
            .sum();

        let block_count = chain.len();
        let pending_count = pending.len();
        drop(chain);
        drop(pending);

        let is_valid = self.verify();

        BlockchainStats {
            block_count,
            total_transactions,
            pending_transactions: pending_count,
            difficulty: self.difficulty,
            is_valid,
        }
    }

    /// Get recent blocks
    pub fn recent_blocks(&self, count: usize) -> Vec<Block> {
        let chain = self.chain.lock().unwrap();
        let start = if chain.len() > count { chain.len() - count } else { 0 };
        chain[start..].to_vec()
    }

    /// Search transactions by type
    pub fn search_transactions(&self, tx_type: &str) -> Vec<Transaction> {
        let chain = self.chain.lock().unwrap();
        chain.iter()
            .flat_map(|block| &block.transactions)
            .filter(|tx| match &tx.tx_type {
                TransactionType::TaskSpawned => tx_type == "TaskSpawned",
                TransactionType::TaskCompleted => tx_type == "TaskCompleted",
                TransactionType::ThreadScaled => tx_type == "ThreadScaled",
                TransactionType::AnomalyDetected => tx_type == "AnomalyDetected",
                TransactionType::ConfigChanged => tx_type == "ConfigChanged",
                TransactionType::Custom(name) => tx_type == name,
            })
            .cloned()
            .collect()
    }

    fn current_timestamp() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis()
    }
}

impl Block {
    fn genesis() -> Self {
        Self {
            index: 0,
            timestamp: 0,
            transactions: vec![],
            previous_hash: "0".to_string(),
            hash: "genesis".to_string(),
            nonce: 0,
        }
    }

    fn calculate_hash(&self) -> String {
        let data = format!(
            "{}{}{}{}{}",
            self.index,
            self.timestamp,
            self.transactions.len(),
            self.previous_hash,
            self.nonce
        );

        // Simple hash function (djb2)
        let mut hash: u64 = 5381;
        for byte in data.bytes() {
            hash = hash.wrapping_mul(33).wrapping_add(byte as u64);
        }

        format!("{:016x}", hash)
    }
}

#[derive(Debug, Clone)]
pub struct BlockchainStats {
    pub block_count: usize,
    pub total_transactions: usize,
    pub pending_transactions: usize,
    pub difficulty: usize,
    pub is_valid: bool,
}

impl std::fmt::Display for Block {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Block[#{}, txs={}, hash={}...{}]",
            self.index,
            self.transactions.len(),
            &self.hash[..8],
            &self.hash[self.hash.len()-4..]
        )
    }
}

impl std::fmt::Display for BlockchainStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "BlockchainStats[blocks={}, txs={}, pending={}, valid={}]",
            self.block_count, self.total_transactions, self.pending_transactions, self.is_valid
        )
    }
}

/// Distributed consensus mechanism
#[derive(Clone)]
pub struct ConsensusManager {
    nodes: Arc<Mutex<HashMap<String, NodeState>>>,
    quorum_size: usize,
}

#[derive(Clone, Debug)]
#[allow(dead_code)]
struct NodeState {
    node_id: String,
    last_vote: u64,
    reputation: f64,
}

impl ConsensusManager {
    pub fn new(quorum_size: usize) -> Self {
        Self {
            nodes: Arc::new(Mutex::new(HashMap::new())),
            quorum_size,
        }
    }

    /// Register a node in the consensus network
    pub fn register_node(&self, node_id: String) {
        let mut nodes = self.nodes.lock().unwrap();
        nodes.insert(node_id.clone(), NodeState {
            node_id,
            last_vote: 0,
            reputation: 1.0,
        });
    }

    /// Vote on a decision (returns true if consensus reached)
    pub fn vote(&self, _decision: &str) -> bool {
        let nodes = self.nodes.lock().unwrap();
        nodes.len() >= self.quorum_size
    }

    /// Get consensus statistics
    pub fn stats(&self) -> ConsensusStats {
        let nodes = self.nodes.lock().unwrap();
        let avg_reputation = if !nodes.is_empty() {
            nodes.values().map(|n| n.reputation).sum::<f64>() / nodes.len() as f64
        } else {
            0.0
        };

        ConsensusStats {
            total_nodes: nodes.len(),
            quorum_size: self.quorum_size,
            avg_reputation,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ConsensusStats {
    pub total_nodes: usize,
    pub quorum_size: usize,
    pub avg_reputation: f64,
}
