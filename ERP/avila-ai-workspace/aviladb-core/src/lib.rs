//! # AvilaDB - Banco de Dados Soberano
//!
//! Motor de banco de dados construído sobre criptografia soberana.
//! Prioriza segurança, performance e independência tecnológica.
//!
//! ## Arquitetura
//!
//! ```
//! ┌─────────────────────────────────────┐
//! │     Query Interface (SQL-like)      │
//! ├─────────────────────────────────────┤
//! │       Storage Engine (LSM Tree)     │
//! ├─────────────────────────────────────┤
//! │    Transaction Manager (MVCC)       │
//! ├─────────────────────────────────────┤
//! │   Network Layer (Ávila Quinn/QUIC)  │
//! ├─────────────────────────────────────┤
//! │ Crypto Layer (secp256k1 + Schnorr)  │
//! └─────────────────────────────────────┘
//! ```
//!
//! ## Características
//! - **Criptografia end-to-end**: Dados cifrados com ChaCha20-Poly1305
//! - **Autenticação**: Assinaturas Schnorr para cada transação
//! - **Rede**: QUIC sobre UDP (baixa latência)
//! - **Storage**: LSM Tree (Log-Structured Merge Tree)
//! - **Transações**: MVCC (Multi-Version Concurrency Control)
//! - **ZERO dependencies externas**: Stack 100% Ávila

#![no_std]
#![deny(unsafe_op_in_unsafe_fn)]
#![warn(missing_docs)]

extern crate alloc;

pub mod storage;
pub mod transaction;
pub mod network;
pub mod query;

/// Configuração do AvilaDB
pub struct Config {
    /// Diretório de dados
    pub data_dir: alloc::string::String,

    /// Endereço de bind (ex: "127.0.0.1:5432")
    pub bind_addr: alloc::string::String,

    /// Tamanho máximo de memória para cache (bytes)
    pub cache_size: usize,

    /// Intervalo de checkpoint (segundos)
    pub checkpoint_interval: u64,

    /// Chave pública do servidor (para autenticação)
    pub server_public_key: [u8; 33],

    /// Chave privada do servidor
    pub server_private_key: [u8; 32],
}

impl Default for Config {
    fn default() -> Self {
        Self {
            data_dir: alloc::string::String::from("./data"),
            bind_addr: alloc::string::String::from("127.0.0.1:7000"),
            cache_size: 256 * 1024 * 1024, // 256 MB
            checkpoint_interval: 60,
            server_public_key: [0u8; 33],
            server_private_key: [0u8; 32],
        }
    }
}

/// Instância do AvilaDB
pub struct AvilaDB {
    /// Configuração
    pub config: Config,

    /// Storage engine
    pub storage: storage::StorageEngine,

    /// Transaction manager
    pub txn_manager: transaction::TransactionManager,
}

impl AvilaDB {
    /// Cria nova instância do AvilaDB
    pub fn new(config: Config) -> Self {
        Self {
            config,
            storage: storage::StorageEngine::new(),
            txn_manager: transaction::TransactionManager::new(),
        }
    }

    /// Inicia o servidor
    pub fn start(&mut self) {
        // TODO: Implementar inicialização completa
        // 1. Carregar dados do disco
        // 2. Iniciar network listener (QUIC)
        // 3. Iniciar background tasks (checkpointing, compaction)
    }

    /// Para o servidor gracefully
    pub fn shutdown(&mut self) {
        // TODO: Implementar shutdown
        // 1. Flush pending writes
        // 2. Fechar conexões
        // 3. Checkpoint final
    }
}
