//! TCP (Transmission Control Protocol) - Conexões confiáveis

use crate::NetworkAddress;
use avila_error::{Error, ErrorKind, Result};
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Servidor TCP
pub struct TcpServer {
    listener: TcpListener,
    address: NetworkAddress,
}

impl TcpServer {
    /// Cria novo servidor TCP
    pub async fn bind(address: NetworkAddress) -> Result<Self> {
        let listener = TcpListener::bind(address.to_string())
            .await
            .map_err(|e| Error::new(ErrorKind::Network, format!("Falha ao vincular TCP: {}", e)))?;

        Ok(Self { listener, address })
    }

    /// Aceita nova conexão
    pub async fn accept(&self) -> Result<(TcpStream, std::net::SocketAddr)> {
        self.listener
            .accept()
            .await
            .map_err(|e| Error::new(ErrorKind::Network, format!("Falha ao aceitar conexão: {}", e)))
    }

    /// Endereço do servidor
    pub fn address(&self) -> &NetworkAddress {
        &self.address
    }
}

/// Cliente TCP
pub struct TcpClient {
    stream: TcpStream,
}

impl TcpClient {
    /// Conecta a um servidor
    pub async fn connect(address: NetworkAddress) -> Result<Self> {
        let stream = TcpStream::connect(address.to_string())
            .await
            .map_err(|e| Error::new(ErrorKind::Network, format!("Falha ao conectar: {}", e)))?;

        Ok(Self { stream })
    }

    /// Envia dados
    pub async fn send(&mut self, data: &[u8]) -> Result<()> {
        self.stream
            .write_all(data)
            .await
            .map_err(|e| Error::new(ErrorKind::Io, format!("Falha ao enviar: {}", e)))
    }

    /// Recebe dados
    pub async fn receive(&mut self, buffer: &mut [u8]) -> Result<usize> {
        self.stream
            .read(buffer)
            .await
            .map_err(|e| Error::new(ErrorKind::Io, format!("Falha ao receber: {}", e)))
    }
}
