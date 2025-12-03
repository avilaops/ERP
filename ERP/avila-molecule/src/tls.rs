//! TLS (Transport Layer Security) - Comunicação segura

use crate::NetworkAddress;
use avila_error::{Error, ErrorKind, Result};
use tokio::net::TcpStream;
use tokio_rustls::{TlsAcceptor, TlsConnector, client::TlsStream};
use rustls::{ServerConfig, ClientConfig};
use std::sync::Arc;

/// Servidor TLS
pub struct TlsServer {
    acceptor: TlsAcceptor,
}

impl TlsServer {
    /// Cria novo servidor TLS
    pub fn new(config: Arc<ServerConfig>) -> Self {
        Self {
            acceptor: TlsAcceptor::from(config),
        }
    }

    /// Aceita conexão TLS
    pub async fn accept(&self, stream: TcpStream) -> Result<tokio_rustls::server::TlsStream<TcpStream>> {
        self.acceptor
            .accept(stream)
            .await
            .map_err(|e| Error::new(ErrorKind::Tls, format!("Falha TLS: {}", e)))
    }
}

/// Cliente TLS
pub struct TlsClient {
    connector: TlsConnector,
}

impl TlsClient {
    /// Cria novo cliente TLS
    pub fn new(config: Arc<ClientConfig>) -> Self {
        Self {
            connector: TlsConnector::from(config),
        }
    }

    /// Conecta com TLS
    pub async fn connect(&self, domain: &str, stream: TcpStream) -> Result<TlsStream<TcpStream>> {
        let domain = rustls::pki_types::ServerName::try_from(domain.to_string())
            .map_err(|e| Error::new(ErrorKind::Tls, format!("Nome de servidor inválido: {}", e)))?
            .to_owned();

        self.connector
            .connect(domain, stream)
            .await
            .map_err(|e| Error::new(ErrorKind::Tls, format!("Falha ao conectar TLS: {}", e)))
    }
}

/// Cria configuração TLS padrão para cliente
pub fn default_client_config() -> Result<Arc<ClientConfig>> {
    let mut root_store = rustls::RootCertStore::empty();

    // Adiciona certificados do sistema
    let certs = rustls_native_certs::load_native_certs();
    for cert in certs.certs {
        root_store.add(cert).ok();
    }

    let config = ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();

    Ok(Arc::new(config))
}
