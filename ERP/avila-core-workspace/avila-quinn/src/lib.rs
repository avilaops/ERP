//! # Ávila Quinn
//!
//! Implementação do protocolo QUIC do zero.
//! ZERO dependencies - tudo implementado manualmente.
//!
//! ## Features
//! - Transporte sobre UDP
//! - Multiplexação de streams
//! - Controle de congestionamento (Cubic, BBR)
//! - Criptografia integrada (TLS 1.3)
//! - 0-RTT connection establishment
//! - Connection migration

#![no_std]
extern crate alloc;

use alloc::vec::Vec;
use alloc::collections::BTreeMap;

pub mod packet;
pub mod connection;
pub mod stream;
pub mod congestion;
pub mod crypto;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
