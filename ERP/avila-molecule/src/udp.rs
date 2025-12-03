//! UDP (User Datagram Protocol) - Comunicação sem conexão

use crate::NetworkAddress;
use avila_error::{Error, ErrorKind, Result};
use tokio::net::UdpSocket;

/// Socket UDP
pub struct UdpEndpoint {
    socket: UdpSocket,
    address: NetworkAddress,
}

impl UdpEndpoint {
    /// Cria novo endpoint UDP
    pub async fn bind(address: NetworkAddress) -> Result<Self> {
        let socket = UdpSocket::bind(address.to_string())
            .await
            .map_err(|e| Error::new(ErrorKind::Network, format!("Falha ao vincular UDP: {}", e)))?;

        Ok(Self { socket, address })
    }

    /// Envia datagrama
    pub async fn send_to(&self, data: &[u8], target: &NetworkAddress) -> Result<usize> {
        self.socket
            .send_to(data, target.to_string())
            .await
            .map_err(|e| Error::new(ErrorKind::Network, format!("Falha ao enviar: {}", e)))
    }

    /// Recebe datagrama
    pub async fn receive_from(&self, buffer: &mut [u8]) -> Result<(usize, std::net::SocketAddr)> {
        self.socket
            .recv_from(buffer)
            .await
            .map_err(|e| Error::new(ErrorKind::Network, format!("Falha ao receber: {}", e)))
    }

    /// Endereço local
    pub fn address(&self) -> &NetworkAddress {
        &self.address
    }
}
