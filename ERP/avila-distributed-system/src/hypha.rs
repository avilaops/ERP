//! Hypha - Conexão individual entre dois nós

use crate::Result;
use avila_molecule::tcp::TcpClient;

/// Hypha - Filamento de conexão entre dois nós
pub struct Hypha {
    /// Conexão TCP subjacente
    connection: TcpClient,
    /// Endereço do peer remoto
    remote_addr: String,
}

impl Hypha {
    /// Cria nova hifa a partir de conexão TCP
    pub fn new(connection: TcpClient, remote_addr: String) -> Self {
        Self {
            connection,
            remote_addr,
        }
    }

    /// Envia dados pela hifa
    pub async fn send(&mut self, data: &[u8]) -> Result<()> {
        self.connection.send(data).await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
    }

    /// Recebe dados pela hifa
    pub async fn receive(&mut self, buffer: &mut [u8]) -> Result<usize> {
        self.connection.receive(buffer).await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
    }    /// Retorna endereço remoto
    pub fn remote_address(&self) -> &str {
        &self.remote_addr
    }
}
