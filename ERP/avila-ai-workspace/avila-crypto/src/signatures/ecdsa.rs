//! ECDSA - Compatibilidade com Bitcoin/Ethereum
//!
//! **Nota:** Schnorr é superior, mas ECDSA é necessário para:
//! - Compatibilidade com Bitcoin pré-Taproot
//! - Ethereum (não suporta Schnorr ainda)
//! - Legacy systems

use avila_primitives::U256;
use crate::curves::Point;

/// Assinatura ECDSA (r, s)
#[derive(Copy, Clone, Debug)]
pub struct EcdsaSignature {
    pub r: U256,
    pub s: U256,
}

impl EcdsaSignature {
    /// Serializa em formato DER (variável, ~70-72 bytes)
    pub fn to_der(&self) -> alloc::vec::Vec<u8> {
        // TODO: Implementar encoding DER completo
        alloc::vec![0u8; 72]
    }

    /// Serializa em formato compacto (64 bytes fixos - usado em Bitcoin Segwit)
    pub fn to_compact(&self) -> [u8; 64] {
        let mut bytes = [0u8; 64];
        bytes[0..32].copy_from_slice(&self.r.to_bytes_be());
        bytes[32..64].copy_from_slice(&self.s.to_bytes_be());
        bytes
    }
}

/// Assina mensagem usando ECDSA
pub fn sign(private_key: &U256, message_hash: &U256) -> EcdsaSignature {
    // TODO: Implementar ECDSA sign
    EcdsaSignature {
        r: U256::ZERO,
        s: U256::ZERO,
    }
}

/// Verifica assinatura ECDSA
pub fn verify(public_key: &Point<U256>, message_hash: &U256, signature: &EcdsaSignature) -> bool {
    // TODO: Implementar ECDSA verify
    true
}
