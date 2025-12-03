//! Storage layer using Sled (Pure Rust embedded database)

use sled::{Db, Batch};
use std::path::Path;
use std::sync::Arc;

use crate::error::{AvilaError, Result};

/// Storage backend for AvilaDB
///
/// Uses Sled - a pure Rust embedded database with:
/// - No external dependencies (no LLVM/Clang needed)
/// - ACID transactions
/// - Built-in compression
/// - Lock-free operations
pub struct Storage {
    db: Arc<Db>,
}

impl Storage {
    /// Open a new storage instance
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let db = sled::open(path)
            .map_err(|e| AvilaError::Storage(e.to_string()))?;

        Ok(Self { db: Arc::new(db) })
    }

    /// Put a key-value pair
    pub fn put(&self, key: &[u8], value: &[u8]) -> Result<()> {
        self.db.insert(key, value)
            .map_err(|e| AvilaError::Storage(e.to_string()))?;
        Ok(())
    }

    /// Get a value by key
    pub fn get(&self, key: &[u8]) -> Result<Option<Vec<u8>>> {
        let result = self.db.get(key)
            .map_err(|e| AvilaError::Storage(e.to_string()))?;

        Ok(result.map(|v| v.to_vec()))
    }

    /// Delete a key
    pub fn delete(&self, key: &[u8]) -> Result<()> {
        self.db.remove(key)
            .map_err(|e| AvilaError::Storage(e.to_string()))?;
        Ok(())
    }

    /// Check if key exists
    pub fn exists(&self, key: &[u8]) -> Result<bool> {
        Ok(self.db.contains_key(key)
            .map_err(|e| AvilaError::Storage(e.to_string()))?)
    }

    /// Batch write operations
    pub fn write_batch(&self, batch: Batch) -> Result<()> {
        self.db.apply_batch(batch)
            .map_err(|e| AvilaError::Storage(e.to_string()))?;
        Ok(())
    }

    /// Create a new write batch
    pub fn create_batch(&self) -> Batch {
        Batch::default()
    }

    /// Flush data to disk
    pub fn flush(&self) -> Result<()> {
        self.db.flush()
            .map_err(|e| AvilaError::Storage(e.to_string()))?;
        Ok(())
    }

    /// Get approximate size of database
    pub fn size_on_disk(&self) -> Result<u64> {
        Ok(self.db.size_on_disk()
            .map_err(|e| AvilaError::Storage(e.to_string()))?)
    }

    /// Get number of keys in database
    pub fn len(&self) -> usize {
        self.db.len()
    }

    /// Check if database is empty
    pub fn is_empty(&self) -> bool {
        self.db.is_empty()
    }
}

impl Clone for Storage {
    fn clone(&self) -> Self {
        Self {
            db: Arc::clone(&self.db),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_storage_basic_ops() {
        let dir = tempdir().unwrap();
        let storage = Storage::open(dir.path()).unwrap();

        // Put
        storage.put(b"key1", b"value1").unwrap();

        // Get
        let value = storage.get(b"key1").unwrap();
        assert_eq!(value, Some(b"value1".to_vec()));

        // Exists
        assert!(storage.exists(b"key1").unwrap());

        // Delete
        storage.delete(b"key1").unwrap();
        let value = storage.get(b"key1").unwrap();
        assert_eq!(value, None);
        assert!(!storage.exists(b"key1").unwrap());
    }

    #[test]
    fn test_storage_batch() {
        let dir = tempdir().unwrap();
        let storage = Storage::open(dir.path()).unwrap();

        let mut batch = storage.create_batch();
        batch.insert(b"key1", b"value1");
        batch.insert(b"key2", b"value2");

        storage.write_batch(batch).unwrap();

        assert_eq!(storage.get(b"key1").unwrap(), Some(b"value1".to_vec()));
        assert_eq!(storage.get(b"key2").unwrap(), Some(b"value2".to_vec()));
    }

    #[test]
    fn test_storage_size() {
        let dir = tempdir().unwrap();
        let storage = Storage::open(dir.path()).unwrap();

        assert_eq!(storage.len(), 0);
        assert!(storage.is_empty());

        storage.put(b"key1", b"value1").unwrap();
        assert_eq!(storage.len(), 1);
        assert!(!storage.is_empty());

        // Force flush to ensure data is written to disk
        storage.flush().unwrap();

        // size_on_disk() returns u64, just verify the call succeeds
        let _size = storage.size_on_disk().unwrap();
    }
}
