//! Storage Engine - LSM Tree (Log-Structured Merge Tree)
//!
//! ## Arquitetura LSM
//! ```
//! Write → MemTable (in-memory, sorted)
//!           ↓ (quando cheio)
//!       Flush to SSTable (disk)
//!           ↓
//!       Level 0 SSTables
//!           ↓ (compaction)
//!       Level 1 SSTables
//!           ↓
//!       Level 2 SSTables
//!          ...
//! ```
//!
//! **Vantagens:**
//! - Writes rápidos (append-only)
//! - Compactação em background
//! - Boa compressão

use alloc::collections::BTreeMap;
use alloc::vec::Vec;
use alloc::string::String;

/// Storage engine principal
pub struct StorageEngine {
    /// MemTable ativa (in-memory)
    pub memtable: MemTable,

    /// MemTables imutáveis (sendo flushed)
    pub immutable_memtables: Vec<MemTable>,

    /// SSTables no disco
    pub sstables: Vec<SSTable>,
}

impl StorageEngine {
    /// Cria novo storage engine
    pub fn new() -> Self {
        Self {
            memtable: MemTable::new(),
            immutable_memtables: Vec::new(),
            sstables: Vec::new(),
        }
    }

    /// Escreve key-value
    pub fn put(&mut self, key: &[u8], value: &[u8]) {
        self.memtable.put(key.to_vec(), value.to_vec());

        // Se MemTable ficou grande, flush para disco
        if self.memtable.size_bytes() > 4 * 1024 * 1024 {
            self.flush_memtable();
        }
    }

    /// Lê value da key
    pub fn get(&self, key: &[u8]) -> Option<Vec<u8>> {
        // 1. Procura na MemTable ativa
        if let Some(value) = self.memtable.get(key) {
            return Some(value);
        }

        // 2. Procura nas MemTables imutáveis
        for memtable in &self.immutable_memtables {
            if let Some(value) = memtable.get(key) {
                return Some(value);
            }
        }

        // 3. Procura nas SSTables (do mais recente para o mais antigo)
        for sstable in self.sstables.iter().rev() {
            if let Some(value) = sstable.get(key) {
                return Some(value);
            }
        }

        None
    }

    /// Deleta key
    pub fn delete(&mut self, key: &[u8]) {
        // Tombstone: escreve marcador de deleção
        self.memtable.delete(key.to_vec());
    }

    /// Flush MemTable para SSTable
    fn flush_memtable(&mut self) {
        // Move MemTable ativa para imutáveis
        let old_memtable = core::mem::replace(&mut self.memtable, MemTable::new());

        // Cria SSTable a partir da MemTable
        let sstable = SSTable::from_memtable(&old_memtable);
        self.sstables.push(sstable);

        // TODO: Escrever SSTable no disco
    }

    /// Compactação de SSTables
    pub fn compact(&mut self) {
        // TODO: Implementar compactação Leveled
        // 1. Seleciona SSTables de Level N
        // 2. Merge com SSTables de Level N+1
        // 3. Gera novas SSTables em Level N+1
        // 4. Remove SSTables antigas
    }
}

/// MemTable (in-memory sorted map)
pub struct MemTable {
    /// Dados ordenados
    data: BTreeMap<Vec<u8>, Entry>,

    /// Tamanho aproximado em bytes
    size: usize,
}

/// Entrada na MemTable
enum Entry {
    /// Valor normal
    Value(Vec<u8>),
    /// Tombstone (deleção)
    Deleted,
}

impl MemTable {
    fn new() -> Self {
        Self {
            data: BTreeMap::new(),
            size: 0,
        }
    }

    fn put(&mut self, key: Vec<u8>, value: Vec<u8>) {
        self.size += key.len() + value.len();
        self.data.insert(key, Entry::Value(value));
    }

    fn get(&self, key: &[u8]) -> Option<Vec<u8>> {
        match self.data.get(key) {
            Some(Entry::Value(v)) => Some(v.clone()),
            Some(Entry::Deleted) => None,
            None => None,
        }
    }

    fn delete(&mut self, key: Vec<u8>) {
        self.size += key.len();
        self.data.insert(key, Entry::Deleted);
    }

    fn size_bytes(&self) -> usize {
        self.size
    }
}

/// SSTable (Sorted String Table) - arquivo no disco
pub struct SSTable {
    /// ID da SSTable
    pub id: u64,

    /// Dados em memória (para este stub)
    /// Em produção, seria mmap ou leitura do disco
    data: BTreeMap<Vec<u8>, Vec<u8>>,
}

impl SSTable {
    fn from_memtable(memtable: &MemTable) -> Self {
        let mut data = BTreeMap::new();

        for (key, entry) in &memtable.data {
            if let Entry::Value(value) = entry {
                data.insert(key.clone(), value.clone());
            }
        }

        Self {
            id: 0, // TODO: Gerar ID único
            data,
        }
    }

    fn get(&self, key: &[u8]) -> Option<Vec<u8>> {
        self.data.get(key).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_put_get() {
        let mut storage = StorageEngine::new();

        storage.put(b"key1", b"value1");
        assert_eq!(storage.get(b"key1"), Some(b"value1".to_vec()));
    }

    #[test]
    fn test_delete() {
        let mut storage = StorageEngine::new();

        storage.put(b"key1", b"value1");
        storage.delete(b"key1");

        assert_eq!(storage.get(b"key1"), None);
    }
}
