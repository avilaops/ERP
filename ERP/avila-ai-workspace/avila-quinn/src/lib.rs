//! # Ávila Quinn - Implementação QUIC Soberana
//!
//! Protocolo QUIC (Quick UDP Internet Connections) implementado do zero
//! usando apenas primitivas criptográficas da Ávila.
//!
//! ## Diferenças do Quinn Original
//!
//! | Aspecto | Quinn Original | Ávila Quinn |
//! |---------|---------------|-------------|
//! | **TLS** | rustls (usa webpki-roots) | Ávila Crypto (secp256k1 + Schnorr) |
//! | **Curvas** | P-256, P-384 (NIST) | secp256k1, Curve25519 |
//! | **Certificados** | X.509 + CAs | Direct public key pinning |
//! | **Hash** | SHA-256 | BLAKE3 |
//! | **AEAD** | AES-GCM, ChaCha20-Poly1305 | ChaCha20-Poly1305 prioritário |
//! | **Dependências** | 50+ crates | ZERO (só Ávila stack) |
//!
//! ## Componentes QUIC
//! - **Connection**: Gerencia estado da conexão
//! - **Streams**: Múltiplos fluxos bidirecionais
//! - **Frames**: Unidades de dados (STREAM, ACK, CRYPTO, etc.)
//! - **Packets**: Encapsulamento com criptografia
//! - **Congestion Control**: Cubic/BBR
//! - **Loss Detection**: Detecta e retransmite pacotes perdidos

#![no_std]
#![deny(unsafe_op_in_unsafe_fn)]
#![warn(missing_docs)]

extern crate alloc;

pub mod connection;
pub mod packet;
pub mod frame;
pub mod crypto;
pub mod congestion;

/// Configuração do endpoint QUIC
pub struct Config {
    /// Tamanho máximo de dados não-ACK'd
    pub max_data: u64,

    /// Tamanho máximo de streams bidirecionais
    pub max_streams_bidi: u64,

    /// Tamanho máximo de streams unidirecionais
    pub max_streams_uni: u64,

    /// Tempo máximo de idle (segundos)
    pub idle_timeout: u64,

    /// MTU máximo
    pub max_udp_payload_size: u16,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            max_data: 10 * 1024 * 1024, // 10 MB
            max_streams_bidi: 100,
            max_streams_uni: 100,
            idle_timeout: 30,
            max_udp_payload_size: 1200,
        }
    }
}
