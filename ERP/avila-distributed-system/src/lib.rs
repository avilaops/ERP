//! # avila-distributed-system
//!
//! **🍄 Fungi - Organismo Distribuído que se Espalha entre Átomos**
//!
//! Assim como fungos na natureza formam redes subterrâneas massivas (micélios),
//! esta biblioteca permite que múltiplas instâncias do sistema se conectem e
//! compartilhem dados de forma descentralizada.
//!
//! ## Conceitos Biológicos
//!
//! - **Micélio** (`Mycelium`) - Rede de comunicação P2P entre nós
//! - **Hifa** (`Hypha`) - Conexão individual entre dois nós
//! - **Esporo** (`Spore`) - Pacote de dados replicável
//! - **Corpo Frutífero** (`FruitingBody`) - Interface para coleta de dados
//!
//! ## Filosofia
//!
//! Fungos não têm centro - são descentralizados por natureza.
//! Cada nó (átomo) pode se conectar a múltiplos outros nós,
//! formando uma rede resiliente que sobrevive à falha de partes individuais.
//!
//! ## Uso
//!
//! ```rust,no_run
//! use avila_distributed_system::{Mycelium, Result};
//!
//! #[tokio::main]
//! async fn main() -> Result<()> {
//!     // Criar nó do micélio
//!     let mycelium = Mycelium::new("node1", "0.0.0.0:7000").await?;
//!
//!     // Conectar a outro nó
//!     mycelium.connect_to_peer("192.168.1.100:7000").await?;
//!
//!     // Liberar esporo (broadcast de dados)
//!     mycelium.release_spore("email_received", b"data...".to_vec()).await?;
//!
//!     Ok(())
//! }
//! ```

#![warn(missing_docs)]
#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// Evita conflito com Result do core
use core::result::Result as CoreResult;

/// Result type alias
pub type Result<T> = CoreResult<T, Box<dyn std::error::Error + Send + Sync>>;

pub mod mycelium;
pub mod hypha;
pub mod spore;
pub mod gossip;

// Re-exports
pub use mycelium::Mycelium;
pub use hypha::Hypha;
pub use spore::{SporeHandler, SporeFilter, PrintSporeHandler};
pub use gossip::{GossipEngine, GossipConfig};

/// Versão da biblioteca
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Contador incremental para geração de IDs determinísticos
static ID_COUNTER: AtomicU64 = AtomicU64::new(1);

fn generate_id() -> String {
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_micros();
    format!("spore-{:x}-{:x}", timestamp, counter)
}

pub(crate) fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_secs() as i64
}

/// Dados de esporo - pacote replicável de informação
#[derive(Debug, Clone)]
pub struct SporeData {
    /// ID único do esporo
    pub id: String,
    /// Tipo de dado (email, config, etc)
    pub data_type: String,
    /// Payload serializado
    pub payload: Vec<u8>,
    /// Timestamp de criação (unix timestamp)
    pub created_at: i64,
    /// TTL - quantos hops até expirar
    pub ttl: u32,
}

impl SporeData {
    /// Cria novo esporo
    pub fn new(data_type: impl Into<String>, payload: Vec<u8>, ttl: u32) -> Self {
        Self {
            id: generate_id(),
            data_type: data_type.into(),
            payload,
            created_at: current_timestamp(),
            ttl,
        }
    }

    /// Decrementa TTL (retorna false se expirou)
    pub fn decrement_ttl(&mut self) -> bool {
        if self.ttl > 0 {
            self.ttl -= 1;
            true
        } else {
            false
        }
    }

    /// Serializa SporeData em bytes (formato simples sem dependências externas)
    /// Formato: [id_len: u32][id: bytes][type_len: u32][type: bytes][payload_len: u32][payload: bytes][created_at: i64][ttl: u32]
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();

        // ID
        let id_bytes = self.id.as_bytes();
        bytes.extend_from_slice(&(id_bytes.len() as u32).to_le_bytes());
        bytes.extend_from_slice(id_bytes);

        // Data type
        let type_bytes = self.data_type.as_bytes();
        bytes.extend_from_slice(&(type_bytes.len() as u32).to_le_bytes());
        bytes.extend_from_slice(type_bytes);

        // Payload
        bytes.extend_from_slice(&(self.payload.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&self.payload);

        // Created at
        bytes.extend_from_slice(&self.created_at.to_le_bytes());

        // TTL
        bytes.extend_from_slice(&self.ttl.to_le_bytes());

        bytes
    }

    /// Deserializa SporeData de bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        let mut pos = 0;

        // Helper para ler u32
        let read_u32 = |bytes: &[u8], pos: &mut usize| -> Result<u32> {
            if *pos + 4 > bytes.len() {
                return Err("Buffer too small for u32".into());
            }
            let value = u32::from_le_bytes([bytes[*pos], bytes[*pos+1], bytes[*pos+2], bytes[*pos+3]]);
            *pos += 4;
            Ok(value)
        };

        // Helper para ler i64
        let read_i64 = |bytes: &[u8], pos: &mut usize| -> Result<i64> {
            if *pos + 8 > bytes.len() {
                return Err("Buffer too small for i64".into());
            }
            let value = i64::from_le_bytes([
                bytes[*pos], bytes[*pos+1], bytes[*pos+2], bytes[*pos+3],
                bytes[*pos+4], bytes[*pos+5], bytes[*pos+6], bytes[*pos+7]
            ]);
            *pos += 8;
            Ok(value)
        };

        // ID
        let id_len = read_u32(bytes, &mut pos)? as usize;
        if pos + id_len > bytes.len() {
            return Err("Buffer too small for id".into());
        }
        let id = String::from_utf8(bytes[pos..pos+id_len].to_vec())
            .map_err(|_| "Invalid UTF-8 in id")?;
        pos += id_len;

        // Data type
        let type_len = read_u32(bytes, &mut pos)? as usize;
        if pos + type_len > bytes.len() {
            return Err("Buffer too small for data_type".into());
        }
        let data_type = String::from_utf8(bytes[pos..pos+type_len].to_vec())
            .map_err(|_| "Invalid UTF-8 in data_type")?;
        pos += type_len;

        // Payload
        let payload_len = read_u32(bytes, &mut pos)? as usize;
        if pos + payload_len > bytes.len() {
            return Err("Buffer too small for payload".into());
        }
        let payload = bytes[pos..pos+payload_len].to_vec();
        pos += payload_len;

        // Created at
        let created_at = read_i64(bytes, &mut pos)?;

        // TTL
        let ttl = read_u32(bytes, &mut pos)?;

        Ok(Self {
            id,
            data_type,
            payload,
            created_at,
            ttl,
        })
    }
}

/// Estado de um nó na rede micélica
#[derive(Debug, Clone)]
pub struct NodeState {
    /// ID do nó
    pub id: String,
    /// Nome amigável
    pub name: String,
    /// Endereço de rede
    pub address: String,
    /// Timestamp da última atualização (unix timestamp)
    pub last_seen: i64,
    /// Metadados customizados
    pub metadata: HashMap<String, String>,
}

/// Informação de peer conectado
#[derive(Clone)]
pub struct PeerInfo {
    /// Estado do peer
    pub state: NodeState,
    /// Endereço do peer (para debug)
    pub address: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spore_ttl() {
        let mut spore = SporeData::new("test", vec![1, 2, 3], 3);
        assert_eq!(spore.ttl, 3);

        assert!(spore.decrement_ttl());
        assert_eq!(spore.ttl, 2);

        assert!(spore.decrement_ttl());
        assert!(spore.decrement_ttl());
        assert_eq!(spore.ttl, 0);

        assert!(!spore.decrement_ttl()); // Expirado
    }

    #[test]
    fn test_node_state() {
        let state = NodeState {
            id: format!("node-{}", "test"),
            name: "node1".to_string(),
            address: "127.0.0.1:7000".to_string(),
            last_seen: current_timestamp(),
            metadata: HashMap::new(),
        };

        assert_eq!(state.name, "node1");
    }
}
