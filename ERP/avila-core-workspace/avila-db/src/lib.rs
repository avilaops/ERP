//! # AvilaDB
//!
//! Banco de dados soberano com:
//! - Criptografia de ponta (secp256k1, Ed25519, BLAKE3)
//! - Protocolo QUIC nativo
//! - Storage engine próprio
//! - Zero dependencies externas
//!
//! ## Arquitetura
//! ```
//! ┌─────────────────────────────────┐
//! │   Network Layer (QUIC/TLS)      │
//! ├─────────────────────────────────┤
//! │   Query Engine (SQL-like)       │
//! ├─────────────────────────────────┤
//! │   Transaction Manager (MVCC)    │
//! ├─────────────────────────────────┤
//! │   Storage Engine (B-Tree)       │
//! ├─────────────────────────────────┤
//! │   Crypto Layer (signatures)     │
//! └─────────────────────────────────┘
//! ```

#![no_std]
extern crate alloc;

pub mod storage;
pub mod query;
pub mod transaction;
pub mod network;
pub mod types;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
