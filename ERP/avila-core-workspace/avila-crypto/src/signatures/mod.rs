//! Esquemas de assinatura digital aprovados pela Ávila

pub mod ecdsa;
pub mod schnorr;
pub mod eddsa;

/// Resultado de verificação de assinatura
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignatureVerification {
    /// Assinatura válida
    Valid,
    /// Assinatura inválida
    Invalid,
}

impl SignatureVerification {
    /// Retorna true se assinatura é válida
    pub fn is_valid(&self) -> bool {
        matches!(self, Self::Valid)
    }
}
