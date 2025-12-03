//! # Ávila Crypto - Criptografia Soberana
//!
//! Implementação completa de criptografia moderna sem dependências externas.
//! Prioriza segurança matemática real sobre aprovações governamentais.
//!
//! ## Filosofia Ávila
//! - **ZERO aprovações de NSA/NIST quando suspeitas**
//! - **secp256k1** em vez de P-256 (Bitcoin-tested, transparente)
//! - **Curve25519** em vez de P-384 (moderno, constant-time)
//! - **BLAKE3** em vez de SHA-256 (4x mais rápido)
//! - **Schnorr** em vez de ECDSA (agregação + privacidade)
//!
//! ## Estrutura
//! ```
//! curves/          # Curvas elípticas soberanas
//! ├── secp256k1    # Bitcoin/Ethereum (y² = x³ + 7)
//! ├── curve25519   # Ed25519 moderno
//! └── bls12_381    # Pairing para ZK-proofs
//!
//! signatures/      # Assinaturas digitais
//! ├── schnorr      # Taproot Bitcoin
//! ├── eddsa        # Ed25519 determinístico
//! └── ecdsa        # Compatibilidade legacy
//!
//! hash/            # Funções de hash
//! ├── blake3       # Primário (performance)
//! ├── keccak       # Ethereum compatibility
//! └── sha3         # Padrão quando necessário
//!
//! encryption/      # Cifras simétricas
//! ├── chacha20     # Stream cipher principal
//! └── aes_gcm      # Hardware acceleration fallback
//! ```

#![no_std]
#![deny(unsafe_op_in_unsafe_fn)]
#![warn(missing_docs)]

extern crate alloc;

pub mod curves;
pub mod signatures;
pub mod hash;
pub mod encryption;

/// Constantes criptográficas da Ávila
pub mod constants {
    /// Tamanho de chave simétrica (256 bits = 32 bytes)
    pub const KEY_SIZE: usize = 32;

    /// Tamanho de nonce para ChaCha20 (12 bytes)
    pub const NONCE_SIZE: usize = 12;

    /// Tamanho de tag de autenticação (16 bytes)
    pub const TAG_SIZE: usize = 16;

    /// Tamanho de hash BLAKE3 (32 bytes)
    pub const HASH_SIZE: usize = 32;
}
