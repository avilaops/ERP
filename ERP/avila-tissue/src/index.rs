//! Índice de busca full-text (implementação simplificada)

use crate::{Email, EmailId};
use std::collections::HashMap;

/// Estrutura simples para indexação em memória.
/// Mantém apenas metadados essenciais para buscas básicas.
#[derive(Default, Clone, Debug)]
pub struct EmailIndex {
    entries: HashMap<EmailId, String>,
}

impl EmailIndex {
    /// Cria um índice vazio.
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    /// Registra um email no índice (usando o assunto como fallback de busca).
    pub fn add(&mut self, id: EmailId, email: &Email) {
        self.entries.insert(id, email.subject().to_string());
    }

    /// Remove um email do índice.
    pub fn remove(&mut self, id: &EmailId) {
        self.entries.remove(id);
    }

    /// Retorna snapshot imutável do índice.
    pub fn entries(&self) -> &HashMap<EmailId, String> {
        &self.entries
    }
}
