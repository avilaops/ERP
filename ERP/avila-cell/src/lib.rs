//! # avila-cell
//!
//! **Células Digitais - Protocolos de Email**
//!
//! Assim como células são a primeira forma de vida que pode se comunicar,
//! processar informações e se replicar, os protocolos de email (SMTP, POP3, IMAP)
//! são as primeiras formas de "vida digital" que podem:
//!
//! - Comunicar (enviar/receber mensagens)
//! - Processar (parse, validação, roteamento)
//! - Persistir (armazenamento de mensagens)
//!
//! ## Protocolos Suportados
//!
//! - **SMTP** (Simple Mail Transfer Protocol) - Envio de emails
//! - **POP3** (Post Office Protocol v3) - Recebimento de emails
//! - **IMAP** (Internet Message Access Protocol) - Acesso a caixas de email
//!
//! ## Filosofia
//!
//! Email é a forma mais fundamental de comunicação digital assíncrona.
//! É o "DNA" da internet - simples, robusto, descentralizado.

#![allow(missing_docs)] // TODO: Complete documentation coverage
#![warn(clippy::all)]

use avila_error::{Error, ErrorKind, Result};

pub mod smtp;
pub mod pop3;
pub mod imap;
pub mod message;
pub mod mime;
pub mod encoding;
pub mod auth;
pub mod queue;
pub mod template;
pub mod dkim;
pub mod pool;
pub mod classifier;
pub mod calendar;

/// Library version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Email address structure
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct EmailAddress {
    /// Parte local (antes do @)
    pub local: String,
    /// Domínio (depois do @)
    pub domain: String,
    /// Nome de exibição opcional
    pub display_name: Option<String>,
}

impl EmailAddress {
    /// Creates new email address
    pub fn new(email: impl AsRef<str>) -> Result<Self> {
        let email = email.as_ref();
        let parts: Vec<&str> = email.split('@').collect();

        if parts.len() != 2 {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                format!("Email inválido: {}", email),
            ));
        }

        Ok(Self {
            local: parts[0].to_string(),
            domain: parts[1].to_string(),
            display_name: None,
        })
    }

    /// Converts to complete string
    pub fn to_string(&self) -> String {
        format!("{}@{}", self.local, self.domain)
    }

    /// Validates email format
    pub fn is_valid(&self) -> bool {
        !self.local.is_empty() && !self.domain.is_empty() && self.domain.contains('.')
    }

    /// Sets display name
    pub fn with_name(mut self, name: impl Into<String>) -> Self {
        self.display_name = Some(name.into());
        self
    }

    /// Formats for RFC 5322 (with display name if present)
    pub fn to_rfc5322(&self) -> String {
        match &self.display_name {
            Some(name) => format!("\"{}\" <{}@{}>", name, self.local, self.domain),
            None => format!("{}@{}", self.local, self.domain),
        }
    }
}

impl std::fmt::Display for EmailAddress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}@{}", self.local, self.domain)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_address() {
        let email = EmailAddress::new("test@example.com").unwrap();
        assert_eq!(email.local, "test");
        assert_eq!(email.domain, "example.com");
        assert!(email.is_valid());
    }

    #[test]
    fn test_invalid_email() {
        assert!(EmailAddress::new("invalid").is_err());
        assert!(EmailAddress::new("no@domain").is_ok()); // Ok mas is_valid() = false
    }
}
