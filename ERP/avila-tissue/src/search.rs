//! Motor de busca de emails

use crate::index::EmailIndex;
use crate::storage::EmailStorage;
use crate::{EmailId, Result};
use std::sync::Arc;

/// Resultado de busca
#[derive(Debug, Clone)]
pub struct SearchResult {
    /// ID do email
    pub id: EmailId,
    /// Score de relevância
    pub score: f32,
    /// Snippet do match
    pub snippet: String,
    /// De (remetente)
    pub from: String,
    /// Assunto
    pub subject: String,
}

/// Motor de busca com índice em memória
pub struct SearchEngine {
    index: EmailIndex,
    storage: Arc<EmailStorage>,
}

impl SearchEngine {
    /// Cria novo motor de busca
    pub fn new(index: EmailIndex, storage: Arc<EmailStorage>) -> Self {
        Self { index, storage }
    }

    /// Busca por texto (busca simples em memória)
    pub async fn search_text(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>> {
        let query_lower = query.to_lowercase();
        let ids = self.storage.list_ids()?;

        let mut results = Vec::new();

        for id in ids {
            if let Some(email) = self.storage.get(&id)? {
                let mut score = 0.0;
                let mut matches = Vec::new();

                // Busca no assunto
                if email.subject().to_lowercase().contains(&query_lower) {
                    score += 10.0;
                    matches.push(email.subject().to_string());
                }

                // Busca no corpo
                if email.body().to_lowercase().contains(&query_lower) {
                    score += 5.0;
                    // Extrai snippet ao redor do match
                    if let Some(pos) = email.body().to_lowercase().find(&query_lower) {
                        let start = pos.saturating_sub(50);
                        let body = email.body();
                        let end = (pos + query.len() + 50).min(body.len());
                        let snippet = format!("...{}...", &body[start..end]);
                        matches.push(snippet);
                    }
                }

                // Busca no remetente
                if email.from().as_str().to_lowercase().contains(&query_lower) {
                    score += 8.0;
                }

                if score > 0.0 {
                    results.push(SearchResult {
                        id: id.clone(),
                        score,
                        snippet: matches.join(" | "),
                        from: email.from().as_str().to_string(),
                        subject: email.subject().to_string(),
                    });
                }
            }
        }

        // Ordena por score (maior primeiro)
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());

        // Limita resultados
        results.truncate(limit);

        Ok(results)
    }

    /// Busca por remetente
    pub async fn search_from(&self, email: &str) -> Result<Vec<SearchResult>> {
        let ids = self.storage.list_ids()?;
        let mut results = Vec::new();

        for id in ids {
            if let Some(email_obj) = self.storage.get(&id)? {
                if email_obj
                    .from()
                    .as_str()
                    .to_lowercase()
                    .contains(&email.to_lowercase())
                {
                    results.push(SearchResult {
                        id: id.clone(),
                        score: 10.0,
                        snippet: email_obj.body().chars().take(100).collect(),
                        from: email_obj.from().as_str().to_string(),
                        subject: email_obj.subject().to_string(),
                    });
                }
            }
        }

        Ok(results)
    }

    /// Busca por assunto
    pub async fn search_subject(&self, subject: &str) -> Result<Vec<SearchResult>> {
        let ids = self.storage.list_ids()?;
        let mut results = Vec::new();

        for id in ids {
            if let Some(email) = self.storage.get(&id)? {
                if email
                    .subject()
                    .to_lowercase()
                    .contains(&subject.to_lowercase())
                {
                    results.push(SearchResult {
                        id: id.clone(),
                        score: 10.0,
                        snippet: email.body().chars().take(100).collect(),
                        from: email.from().as_str().to_string(),
                        subject: email.subject().to_string(),
                    });
                }
            }
        }

        Ok(results)
    }

    /// Busca por data (implementação simples)
    pub async fn search_date_range(&self, _start: &str, _end: &str) -> Result<Vec<SearchResult>> {
        // Retorna todos os emails por enquanto
        let ids = self.storage.list_ids()?;
        let mut results = Vec::new();

        for id in ids {
            if let Some(email) = self.storage.get(&id)? {
                results.push(SearchResult {
                    id: id.clone(),
                    score: 1.0,
                    snippet: email.body().chars().take(100).collect(),
                    from: email.from().as_str().to_string(),
                    subject: email.subject().to_string(),
                });
            }
        }

        Ok(results)
    }

    /// Busca avançada com múltiplos critérios
    pub async fn advanced_search(
        &self,
        text: Option<&str>,
        from: Option<&str>,
        subject: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SearchResult>> {
        let ids = self.storage.list_ids()?;
        let mut results = Vec::new();

        for id in ids {
            if let Some(email) = self.storage.get(&id)? {
                let mut score = 0.0;
                let mut matches = true;

                // Filtra por texto
                if let Some(query) = text {
                    let query_lower = query.to_lowercase();
                    let body_lower = email.body().to_lowercase();
                    let subject_lower = email.subject().to_lowercase();

                    if body_lower.contains(&query_lower) || subject_lower.contains(&query_lower) {
                        score += 5.0;
                    } else {
                        matches = false;
                    }
                }

                // Filtra por remetente
                if let Some(from_query) = from {
                    let from_lower = email.from().as_str().to_lowercase();
                    let query_lower = from_query.to_lowercase();

                    if from_lower.contains(&query_lower) {
                        score += 10.0;
                    } else {
                        matches = false;
                    }
                }

                // Filtra por assunto
                if let Some(subj_query) = subject {
                    let subject_lower = email.subject().to_lowercase();
                    let query_lower = subj_query.to_lowercase();

                    if subject_lower.contains(&query_lower) {
                        score += 10.0;
                    } else {
                        matches = false;
                    }
                }

                if matches && score > 0.0 {
                    let snippet: String = email.body().chars().take(100).collect();
                    results.push(SearchResult {
                        id: id.clone(),
                        score,
                        snippet,
                        from: email.from().as_str().to_string(),
                        subject: email.subject().to_string(),
                    });
                }
            }
        }

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);

        Ok(results)
    }
}
