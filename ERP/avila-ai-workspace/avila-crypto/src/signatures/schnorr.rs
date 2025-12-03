//! Schnorr Signatures - O Futuro
//!
//! **Por que Schnorr é superior a ECDSA:**
//! 1. ✅ Agregação de assinaturas (múltiplas assinaturas → 1 assinatura)
//! 2. ✅ Multisig eficiente (MuSig2 protocol)
//! 3. ✅ Prova de segurança matemática mais simples
//! 4. ✅ Determinística (sem necessidade de RNG durante sign)
//! 5. ✅ Ativado no Bitcoin (Taproot 2021)
//! 6. ❌ Patente expirou só em 2008 (por isso não foi usado antes)

use avila_primitives::U256;
use crate::curves::{Point, secp256k1::Secp256k1, EllipticCurve};

/// Assinatura Schnorr (r, s)
#[derive(Copy, Clone, Debug)]
pub struct SchnorrSignature {
    /// Componente r (coordenada x do ponto R)
    pub r: U256,
    /// Componente s (escalar)
    pub s: U256,
}

impl SchnorrSignature {
    /// Serializa assinatura (64 bytes)
    pub fn to_bytes(&self) -> [u8; 64] {
        let mut bytes = [0u8; 64];
        bytes[0..32].copy_from_slice(&self.r.to_bytes_be());
        bytes[32..64].copy_from_slice(&self.s.to_bytes_be());
        bytes
    }

    /// Deserializa assinatura
    pub fn from_bytes(bytes: &[u8; 64]) -> Self {
        let r = U256::from_bytes_be(&bytes[0..32]);
        let s = U256::from_bytes_be(&bytes[32..64]);
        Self { r, s }
    }
}

/// Assina mensagem usando Schnorr
///
/// **Algoritmo:**
/// 1. k = H(private_key || message) (determinístico)
/// 2. R = k × G
/// 3. r = R.x
/// 4. e = H(r || public_key || message)
/// 5. s = k + e × private_key mod n
/// 6. Retorna (r, s)
pub fn sign(private_key: &U256, message: &[u8]) -> SchnorrSignature {
    // TODO: Implementar hash (precisa de BLAKE3 ou SHA256)
    // Por enquanto, stub

    let k = U256::from_u64(12345); // Deveria ser H(privkey || msg)
    let r_point = Secp256k1::scalar_mul(&k, &Secp256k1::generator());
    let r = r_point.x;

    let e = U256::from_u64(67890); // Deveria ser H(r || pubkey || msg)

    // s = k + e × private_key mod n
    use avila_math::ModularArithmetic;
    let s = k.add_mod(&e.mul_mod(private_key, &Secp256k1::N), &Secp256k1::N);

    SchnorrSignature { r, s }
}

/// Verifica assinatura Schnorr
///
/// **Algoritmo:**
/// 1. e = H(r || public_key || message)
/// 2. R' = s × G - e × public_key
/// 3. Verifica se R'.x == r
pub fn verify(public_key: &Point<U256>, message: &[u8], signature: &SchnorrSignature) -> bool {
    // TODO: Implementar verificação completa com hash
    // Por enquanto, sempre retorna true para compilar
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signature_serialization() {
        let sig = SchnorrSignature {
            r: U256::from_u64(123),
            s: U256::from_u64(456),
        };

        let bytes = sig.to_bytes();
        let recovered = SchnorrSignature::from_bytes(&bytes);

        assert_eq!(sig.r, recovered.r);
        assert_eq!(sig.s, recovered.s);
    }
}
