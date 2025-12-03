//! # avila-organism
//!
//! **Email Platform - Complete Application Layer**
//!
//! Top-level application layer integrating all email platform components:
//!
//! - **Webmail** - Web interface
//! - **API REST** - HTTP API for external integrations
//! - **CLI** - Command-line tools
//! - **Admin Panel** - User management interface
//! - **Monitoring** - Observability layer
//!
//! ## Architecture
//!
//! Application layer built on top of the Ávila Platform stack:
//! - Primitive types & binary operations
//! - Data structures (Option, Result, Vec)
//! - Network protocols (TCP, UDP, TLS)
//! - Email protocols (SMTP, IMAP, POP3)
//! - Storage & indexing layer
//! - Server & client implementation
//! - Application layer (this crate)
//!
//! Zero external dependencies in core components.

pub mod webmail;
pub mod api;
pub mod admin;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Application configuration
#[derive(Debug, Clone)]
pub struct ApplicationConfig {
    pub smtp_port: u16,
    pub imap_port: u16,
    pub http_port: u16,
    pub domain: String,
    pub data_dir: String,
}

impl Default for ApplicationConfig {
    fn default() -> Self {
        Self {
            smtp_port: 2525,
            imap_port: 1143,
            http_port: 8080,
            domain: "localhost".to_string(),
            data_dir: "./data".to_string(),
        }
    }
}
