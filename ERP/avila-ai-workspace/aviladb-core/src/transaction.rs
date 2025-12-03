//! Transaction Manager - MVCC (Multi-Version Concurrency Control)

use alloc::collections::BTreeMap;
use alloc::vec::Vec;

/// Transaction ID
pub type TxnId = u64;

/// Transaction manager
pub struct TransactionManager {
    /// Próximo transaction ID
    next_txn_id: TxnId,

    /// Transações ativas
    active_txns: BTreeMap<TxnId, Transaction>,

    /// Snapshot mais antigo ainda em uso
    oldest_snapshot: TxnId,
}

impl TransactionManager {
    /// Cria novo transaction manager
    pub fn new() -> Self {
        Self {
            next_txn_id: 1,
            active_txns: BTreeMap::new(),
            oldest_snapshot: 1,
        }
    }

    /// Inicia nova transação
    pub fn begin(&mut self) -> TxnId {
        let txn_id = self.next_txn_id;
        self.next_txn_id += 1;

        let txn = Transaction {
            id: txn_id,
            snapshot_id: txn_id,
            writes: BTreeMap::new(),
            state: TxnState::Active,
        };

        self.active_txns.insert(txn_id, txn);
        txn_id
    }

    /// Commit transação
    pub fn commit(&mut self, txn_id: TxnId) -> Result<(), &'static str> {
        let txn = self.active_txns.get_mut(&txn_id)
            .ok_or("Transaction not found")?;

        // Valida conflitos (optimistic concurrency control)
        // TODO: Verificar se writes conflitam com outras transações

        // Aplica writes
        // TODO: Escrever no storage engine

        txn.state = TxnState::Committed;
        self.active_txns.remove(&txn_id);

        Ok(())
    }

    /// Abort transação
    pub fn abort(&mut self, txn_id: TxnId) {
        if let Some(mut txn) = self.active_txns.remove(&txn_id) {
            txn.state = TxnState::Aborted;
            // Writes são descartados
        }
    }

    /// Adiciona write à transação
    pub fn write(&mut self, txn_id: TxnId, key: Vec<u8>, value: Vec<u8>) -> Result<(), &'static str> {
        let txn = self.active_txns.get_mut(&txn_id)
            .ok_or("Transaction not found")?;

        if txn.state != TxnState::Active {
            return Err("Transaction not active");
        }

        txn.writes.insert(key, value);
        Ok(())
    }

    /// Lê valor na transação (snapshot isolation)
    pub fn read(&self, txn_id: TxnId, key: &[u8]) -> Option<Vec<u8>> {
        let txn = self.active_txns.get(&txn_id)?;

        // 1. Verifica writes locais
        if let Some(value) = txn.writes.get(key) {
            return Some(value.clone());
        }

        // 2. Lê do storage usando snapshot_id
        // TODO: Implementar leitura do storage com MVCC
        None
    }
}

/// Transação
pub struct Transaction {
    /// ID da transação
    pub id: TxnId,

    /// Snapshot ID (timestamp de início)
    pub snapshot_id: TxnId,

    /// Writes locais (não-commitados)
    pub writes: BTreeMap<Vec<u8>, Vec<u8>>,

    /// Estado da transação
    pub state: TxnState,
}

/// Estado da transação
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TxnState {
    /// Ativa
    Active,
    /// Commitada
    Committed,
    /// Abortada
    Aborted,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_begin_commit() {
        let mut mgr = TransactionManager::new();

        let txn_id = mgr.begin();
        assert_eq!(txn_id, 1);

        mgr.write(txn_id, b"key".to_vec(), b"value".to_vec()).unwrap();
        mgr.commit(txn_id).unwrap();
    }

    #[test]
    fn test_abort() {
        let mut mgr = TransactionManager::new();

        let txn_id = mgr.begin();
        mgr.write(txn_id, b"key".to_vec(), b"value".to_vec()).unwrap();
        mgr.abort(txn_id);

        // Transação não deve mais existir
        assert!(!mgr.active_txns.contains_key(&txn_id));
    }
}
