//! # avila-molecule
//!
//! **Moléculas de Software - Protocolos de Rede**
//!
//! Assim como átomos se combinam em moléculas, as estruturas de dados
//! básicas se combinam em protocolos de comunicação. Esta biblioteca
//! fornece os building blocks fundamentais de rede:
//!
//! - TCP (Transmission Control Protocol)
//! - UDP (User Datagram Protocol)
//! - TLS (Transport Layer Security)
//!
//! ## Filosofia
//!
//! Moléculas são combinações estáveis de átomos que têm propriedades
//! emergentes. TCP/UDP/TLS são "moléculas" de software - combinações
//! de bits e bytes que criam protocolos de comunicação confiáveis.

#![warn(missing_docs)]

use avila_error::{Error, Result};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub mod tcp;
pub mod udp;
pub mod tls;

/// Versão da biblioteca
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Endereço de rede (host:porta)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetworkAddress {
    /// Host (IP ou domínio)
    pub host: String,
    /// Porta
    pub port: u16,
}

impl NetworkAddress {
    /// Cria novo endereço de rede
    pub fn new(host: impl Into<String>, port: u16) -> Self {
        Self {
            host: host.into(),
            port,
        }
    }

    /// Converte para string "host:port"
    pub fn to_string(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

impl std::fmt::Display for NetworkAddress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}", self.host, self.port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_address() {
        let addr = NetworkAddress::new("localhost", 8080);
        assert_eq!(addr.to_string(), "localhost:8080");
    }
}
