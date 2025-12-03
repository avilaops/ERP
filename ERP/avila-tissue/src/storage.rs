//! Armazenamento persistente de emails

use crate::{flags, Email, EmailId, EmailMetadata, Error, ErrorKind, Result};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Storage de emails em memória (HashMap)
pub struct EmailStorage {
    emails: Arc<RwLock<HashMap<String, Email>>>,
}

impl EmailStorage {
    /// Cria novo storage em memória
    pub fn new() -> Self {
        Self {
            emails: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Armazena um email
    pub fn store(&self, email: &Email, metadata: &EmailMetadata) -> Result<()> {
        let mut emails = self.emails.write()
            .map_err(|_| Error::new(ErrorKind::Internal, "Failed to lock"))?;

        emails.insert(metadata.id.clone(), email.clone());
        Ok(())
    }

    /// Recupera um email por ID
    pub fn get(&self, id: &EmailId) -> Result<Option<Email>> {
        let emails = self.emails.read()
            .map_err(|_| Error::new(ErrorKind::Internal, "Failed to lock"))?;

        Ok(emails.get(id).cloned())
    }

    /// Deleta um email
    pub fn delete(&self, id: &EmailId) -> Result<()> {
        let mut emails = self.emails.write()
            .map_err(|_| Error::new(ErrorKind::Internal, "Failed to lock"))?;

        emails.remove(id);
        Ok(())
    }

    /// Lista todos os IDs
    pub fn list_ids(&self) -> Result<Vec<EmailId>> {
        let emails = self.emails.read()
            .map_err(|_| Error::new(ErrorKind::Internal, "Failed to lock"))?;

        Ok(emails.keys().cloned().collect())
    }
}

impl Default for EmailStorage {
    fn default() -> Self {
        Self::new()
    }
}
