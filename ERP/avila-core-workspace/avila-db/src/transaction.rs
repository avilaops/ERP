//! Transaction manager com MVCC (Multi-Version Concurrency Control)

use alloc::vec::Vec;
use alloc::collections::BTreeMap;

/// ID de transação
pub type TxId = u64;

/// Timestamp de transação
pub type Timestamp = u64;

/// Estado da transação
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransactionState {
    /// Ativa
    Active,
    /// Preparando commit (2PC)
    Preparing,
    /// Commitada
    Committed,
    /// Abortada
    Aborted,
}

/// Transação
pub struct Transaction {
    /// ID da transação
    pub id: TxId,
    /// Estado
    pub state: TransactionState,
    /// Timestamp de início
    pub start_ts: Timestamp,
    /// Timestamp de commit (se commitada)
    pub commit_ts: Option<Timestamp>,
    /// Write set (modificações)
    pub write_set: Vec<Write>,
    /// Read set (para validação)
    pub read_set: Vec<Read>,
}

/// Operação de escrita
#[derive(Debug, Clone)]
pub struct Write {
    /// Chave
    pub key: Vec<u8>,
    /// Valor (None = delete)
    pub value: Option<Vec<u8>>,
}

/// Operação de leitura
#[derive(Debug, Clone)]
pub struct Read {
    /// Chave
    pub key: Vec<u8>,
    /// Versão lida
    pub version: Timestamp,
}

/// Versão de dado (MVCC)
#[derive(Debug, Clone)]
pub struct DataVersion {
    /// Timestamp da versão
    pub ts: Timestamp,
    /// Transação que criou
    pub tx_id: TxId,
    /// Valor (None = tombstone/delete)
    pub value: Option<Vec<u8>>,
}

/// Transaction manager
pub struct TransactionManager {
    /// Transações ativas
    pub active_txs: BTreeMap<TxId, Transaction>,
    /// Próximo TX ID
    pub next_tx_id: TxId,
    /// Timestamp atual
    pub current_ts: Timestamp,
    /// Store de versões (key → lista de versões)
    pub version_store: BTreeMap<Vec<u8>, Vec<DataVersion>>,
}

impl TransactionManager {
    /// Cria novo transaction manager
    pub fn new() -> Self {
        Self {
            active_txs: BTreeMap::new(),
            next_tx_id: 1,
            current_ts: 0,
            version_store: BTreeMap::new(),
        }
    }

    /// Inicia nova transação
    pub fn begin(&mut self) -> TxId {
        let tx_id = self.next_tx_id;
        self.next_tx_id += 1;

        let tx = Transaction {
            id: tx_id,
            state: TransactionState::Active,
            start_ts: self.current_ts,
            commit_ts: None,
            write_set: Vec::new(),
            read_set: Vec::new(),
        };

        self.active_txs.insert(tx_id, tx);
        tx_id
    }

    /// Lê valor (snapshot isolation)
    pub fn read(&mut self, tx_id: TxId, key: &[u8]) -> Option<Vec<u8>> {
        let tx = self.active_txs.get(&tx_id)?;
        let start_ts = tx.start_ts;

        // Busca versão visível para esta transação
        if let Some(versions) = self.version_store.get(key) {
            // Busca última versão com ts <= start_ts e committed
            for version in versions.iter().rev() {
                if version.ts <= start_ts {
                    // Verifica se transação está committed
                    if let Some(creator_tx) = self.active_txs.get(&version.tx_id) {
                        if creator_tx.state == TransactionState::Committed {
                            // Adiciona ao read set
                            if let Some(tx) = self.active_txs.get_mut(&tx_id) {
                                tx.read_set.push(Read {
                                    key: key.to_vec(),
                                    version: version.ts,
                                });
                            }
                            return version.value.clone();
                        }
                    }
                }
            }
        }

        None
    }

    /// Escreve valor
    pub fn write(&mut self, tx_id: TxId, key: &[u8], value: Option<Vec<u8>>) -> Result<(), ()> {
        if let Some(tx) = self.active_txs.get_mut(&tx_id) {
            tx.write_set.push(Write {
                key: key.to_vec(),
                value,
            });
            Ok(())
        } else {
            Err(())
        }
    }

    /// Commit transação
    pub fn commit(&mut self, tx_id: TxId) -> Result<(), ()> {
        // Validação (OCC - Optimistic Concurrency Control)
        if !self.validate(tx_id) {
            self.abort(tx_id);
            return Err(());
        }

        // Aplica writes
        self.current_ts += 1;
        let commit_ts = self.current_ts;

        if let Some(tx) = self.active_txs.get_mut(&tx_id) {
            tx.state = TransactionState::Committed;
            tx.commit_ts = Some(commit_ts);

            // Adiciona versões ao version store
            for write in &tx.write_set {
                let versions = self
                    .version_store
                    .entry(write.key.clone())
                    .or_insert_with(Vec::new);

                versions.push(DataVersion {
                    ts: commit_ts,
                    tx_id,
                    value: write.value.clone(),
                });
            }

            Ok(())
        } else {
            Err(())
        }
    }

    /// Valida transação (verifica conflitos)
    fn validate(&self, tx_id: TxId) -> bool {
        let tx = match self.active_txs.get(&tx_id) {
            Some(tx) => tx,
            None => return false,
        };

        // Verifica se alguma chave lida foi modificada por tx concurrent
        for read in &tx.read_set {
            if let Some(versions) = self.version_store.get(&read.key) {
                for version in versions {
                    // Se versão mais nova que a lida E commitada depois de start_ts
                    if version.ts > read.version && version.ts > tx.start_ts {
                        // Conflito!
                        return false;
                    }
                }
            }
        }

        true
    }

    /// Abort transação
    pub fn abort(&mut self, tx_id: TxId) {
        if let Some(tx) = self.active_txs.get_mut(&tx_id) {
            tx.state = TransactionState::Aborted;
            // Write set é descartado
        }
    }

    /// Garbage collection de versões antigas
    pub fn gc_versions(&mut self, min_active_ts: Timestamp) {
        for versions in self.version_store.values_mut() {
            // Remove versões mais antigas que min_active_ts
            versions.retain(|v| v.ts >= min_active_ts);
        }
    }
}
