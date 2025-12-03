//! # avila-tissue
//!
//! **Tecido Digital - Organização de Emails**
//!
//! Assim como tecidos biológicos organizam células em estruturas funcionais,
//! esta biblioteca organiza emails (células digitais) em um sistema coerente:
//!
//! - **Storage** - Armazenamento persistente de emails
//! - **Indexing** - Índices de busca full-text
//! - **Searching** - Busca rápida e relevante
//! - **Organization** - Pastas, tags, threads
//!
//! ## Filosofia
//!
//! Tecidos são conjuntos organizados de células que trabalham juntas.
//! O sistema de email precisa organizar milhões de mensagens de forma
//! eficiente, pesquisável e confiável.

#![warn(missing_docs)]

use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub mod storage;
pub mod index;
pub mod search;
pub mod mailbox;

/// Versão da biblioteca
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Resultado padrão utilizado no tecido
pub type Result<T> = core::result::Result<T, Error>;

/// Identificador único para emails e threads
pub type EmailId = String;

/// Marca temporal utilizada pelo tecido
pub type Timestamp = SystemTime;

/// Gerador incremental de IDs (garante unicidade por processo)
static ID_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Gera um novo identificador único.
pub fn generate_id() -> EmailId {
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_micros();
    format!("{:x}{:x}", time, counter)
}

/// Retorna o instante atual (UTC)
pub fn now() -> Timestamp {
    SystemTime::now()
}

/// Representa erros produzidos pelo tecido
#[derive(Debug, Clone)]
pub struct Error {
    kind: ErrorKind,
    message: String,
}

impl Error {
    /// Cria um novo erro com mensagem customizada
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// Retorna o tipo do erro
    pub fn kind(&self) -> ErrorKind {
        self.kind
    }

    /// Retorna a mensagem associada
    pub fn message(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for Error {}

/// Categorias básicas de erros internos
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    /// Recurso não encontrado
    NotFound,
    /// Entrada inválida
    InvalidInput,
    /// Falha interna
    Internal,
    /// Erro de serialização
    Serialization,
}

impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error::new(ErrorKind::Internal, err.to_string())
    }
}

/// Representa um endereço de email válido
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct EmailAddress(String);

impl EmailAddress {
    /// Cria um novo endereço validando formato básico
    pub fn new(value: &str) -> Result<Self> {
        let trimmed = value.trim();
        if trimmed.is_empty() || !trimmed.contains('@') {
            return Err(Error::new(ErrorKind::InvalidInput, "Endereço de email inválido"));
        }
        Ok(Self(trimmed.to_ascii_lowercase()))
    }

    /// A representação em string do endereço
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for EmailAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Representa uma mensagem de email
#[derive(Debug, Clone)]
pub struct Email {
    from: EmailAddress,
    to: Vec<EmailAddress>,
    subject: String,
    body: String,
    created_at: Timestamp,
}

impl Email {
    /// Cria um novo email
    pub fn new(from: EmailAddress, to: Vec<EmailAddress>, subject: String, body: String) -> Self {
        Self {
            from,
            to,
            subject,
            body,
            created_at: now(),
        }
    }

    /// Endereço remetente
    pub fn from(&self) -> &EmailAddress {
        &self.from
    }

    /// Endereços destinatários
    pub fn to(&self) -> &[EmailAddress] {
        &self.to
    }

    /// Assunto da mensagem
    pub fn subject(&self) -> &str {
        &self.subject
    }

    /// Corpo da mensagem
    pub fn body(&self) -> &str {
        &self.body
    }

    /// Momento de criação
    pub fn created_at(&self) -> Timestamp {
        self.created_at
    }
}

/// Metadados de email armazenado
#[derive(Debug, Clone)]
pub struct EmailMetadata {
    /// ID único
    pub id: EmailId,
    /// Data de recebimento
    pub received_at: Timestamp,
    /// Tamanho em bytes
    pub size: usize,
    /// Flags (read, starred, etc)
    pub flags: Vec<String>,
    /// Mailbox onde está armazenado
    pub mailbox: String,
    /// Thread ID (para conversas)
    pub thread_id: Option<EmailId>,
}

/// Flags de email
pub mod flags {
    /// Email foi lido
    pub const SEEN: &str = "\\Seen";
    /// Email tem resposta
    pub const ANSWERED: &str = "\\Answered";
    /// Email está marcado
    pub const FLAGGED: &str = "\\Flagged";
    /// Email será deletado
    pub const DELETED: &str = "\\Deleted";
    /// Email é rascunho
    pub const DRAFT: &str = "\\Draft";
    /// Email é recente
    pub const RECENT: &str = "\\Recent";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metadata_creation() {
        let meta = EmailMetadata {
            id: generate_id(),
            received_at: now(),
            size: 1024,
            flags: vec![flags::SEEN.to_string()],
            mailbox: "INBOX".to_string(),
            thread_id: None,
        };

        assert!(meta.flags.contains(&flags::SEEN.to_string()));
    }
}
