//! Assinaturas digitais soberanas

pub mod schnorr;
pub mod ecdsa;

/// Trait para esquemas de assinatura
pub trait SignatureScheme {
    /// Tipo da chave privada
    type PrivateKey;

    /// Tipo da chave pública
    type PublicKey;

    /// Tipo da assinatura
    type Signature;

    /// Assina mensagem
    fn sign(private_key: &Self::PrivateKey, message: &[u8]) -> Self::Signature;

    /// Verifica assinatura
    fn verify(public_key: &Self::PublicKey, message: &[u8], signature: &Self::Signature) -> bool;
}
