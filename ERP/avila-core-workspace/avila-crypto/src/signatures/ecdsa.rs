//! ECDSA - Elliptic Curve Digital Signature Algorithm
//!
//! Usado em Bitcoin e Ethereum (com secp256k1)

use super::SignatureVerification;
use crate::curves::{secp256k1::Secp256k1, Point, EllipticCurve};
use avila_primitives::U256;

/// Assinatura ECDSA: (r, s)
#[derive(Debug, Clone, Copy)]
pub struct EcdsaSignature {
    pub r: U256,
    pub s: U256,
}

/// Chave pública ECDSA
#[derive(Debug, Clone, Copy)]
pub struct EcdsaPublicKey {
    pub point: Point,
}

/// Chave privada ECDSA
#[derive(Debug, Clone, Copy)]
pub struct EcdsaPrivateKey {
    pub scalar: U256,
}

impl EcdsaPrivateKey {
    /// Deriva chave pública: Q = d × G
    pub fn public_key(&self) -> EcdsaPublicKey {
        let point = Secp256k1::scalar_mul(&self.scalar, &Secp256k1::G);
        EcdsaPublicKey { point }
    }

    /// Assina mensagem
    ///
    /// Algoritmo:
    /// 1. e = hash(message)
    /// 2. k = random nonce (CRÍTICO: deve ser único!)
    /// 3. R = k × G
    /// 4. r = R.x mod n
    /// 5. s = k⁻¹ × (e + r × d) mod n
    /// 6. Retorna (r, s)
    pub fn sign(&self, message_hash: &U256, nonce: &U256) -> EcdsaSignature {
        let n = &Secp256k1::N;

        // R = k × G
        let r_point = Secp256k1::scalar_mul(nonce, &Secp256k1::G);

        // r = R.x mod n (TODO: implementar mod_reduce)
        let r = r_point.x;

        // s = k⁻¹ × (e + r × d) mod n
        // TODO: Implementar com mod_inverse
        let s = U256::ZERO; // PLACEHOLDER

        EcdsaSignature { r, s }
    }
}

impl EcdsaPublicKey {
    /// Verifica assinatura
    ///
    /// Algoritmo:
    /// 1. Verifica r, s ∈ [1, n-1]
    /// 2. e = hash(message)
    /// 3. w = s⁻¹ mod n
    /// 4. u₁ = e × w mod n
    /// 5. u₂ = r × w mod n
    /// 6. R = u₁×G + u₂×Q (Shamir's trick)
    /// 7. Verifica r == R.x mod n
    pub fn verify(&self, message_hash: &U256, sig: &EcdsaSignature) -> SignatureVerification {
        // Validações básicas
        if sig.r.is_zero() || sig.s.is_zero() {
            return SignatureVerification::Invalid;
        }

        let n = &Secp256k1::N;

        // w = s⁻¹ mod n
        // TODO: Implementar mod_inverse
        let w = U256::ONE; // PLACEHOLDER

        // u₁ = e × w mod n
        // u₂ = r × w mod n
        // TODO: Implementar mul_mod

        // R = u₁×G + u₂×Q
        // TODO: Implementar Shamir's trick (simultaneous multiplication)

        // Verificar R.x == r
        SignatureVerification::Valid // PLACEHOLDER
    }

    /// Recupera chave pública da assinatura (Ethereum style)
    ///
    /// Permite recovery ID (v) para determinar qual dos 4 possíveis pontos
    pub fn recover(
        message_hash: &U256,
        sig: &EcdsaSignature,
        recovery_id: u8,
    ) -> Option<Self> {
        // Algoritmo de recovery
        // TODO: Implementar
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pubkey_derivation() {
        let privkey = EcdsaPrivateKey {
            scalar: U256::from_u64(12345),
        };
        let pubkey = privkey.public_key();
        assert!(Secp256k1::is_on_curve(&pubkey.point));
    }
}
