//! # avila-organ
//!
//! **Órgão de Email - Sistema Servidor/Cliente Completo**
//!
//! Órgãos são sistemas complexos formados por diferentes tecidos trabalhando juntos.
//! O sistema de email é um "órgão" que integra:
//!
//! - Servidor SMTP (recepção/envio)
//! - Servidor IMAP (acesso a emails)
//! - Cliente de email
//! - Autenticação e autorização
//! - Gerenciamento de contas

pub mod server;
pub mod client;
pub mod auth;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
