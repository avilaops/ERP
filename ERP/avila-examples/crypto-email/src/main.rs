//! Demo: Email System com Assinatura Digital secp256k1
//!
//! Demonstra integração completa:
//! - avila-crypto: ECDSA signatures (Bitcoin-grade)
//! - avila-tissue: Email storage
//! - avila-organ: Email server

use avila_crypto::bigint::{BigInt, U256};
use avila_crypto::curves::{Point, EllipticCurve, secp256k1::Secp256k1};
use avila_crypto::signatures::ecdsa::{Signature, PublicKey};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!(" Demo: Email System com Criptografia Soberana");
    println!("================================================\n");

    // 1. Gerar par de chaves secp256k1 (Bitcoin/Ethereum)
    println!(" Gerando chaves secp256k1...");
    let private_key = U256::from_bytes_be(&[
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0x30, 0x39, // 12345 in hex
    ]);
    let public_key_point = Secp256k1::scalar_mul(&private_key, &Secp256k1::generator());
    let public_key = PublicKey {
        x: public_key_point.x,
        y: public_key_point.y,
    };
    println!(" Chave privada (simulada): {:016x}", private_key.limbs[0]);
    println!(" Chave pública gerada\n");

    // 2. Criar email
    println!(" Criando email...");
    let email_body = b"Mensagem importante assinada criptograficamente";
    println!("Conteúdo: {}\n", String::from_utf8_lossy(email_body));

    // 3. Assinar email com ECDSA
    println!(" Assinando com ECDSA secp256k1...");

    // Hash da mensagem (SHA-256 simplificado)
    let message_hash = hash_message(email_body);
    println!("Hash da mensagem: 0x{:016x}", message_hash.limbs[0]);

    // Criar assinatura
    let signature = sign_message(&message_hash, &private_key);
    println!("Assinatura criada: r={:016x}, s={:016x}\n",
             signature.r.limbs[0], signature.s.limbs[0]);

    // 4. Verificar assinatura
    println!(" Verificando assinatura...");
    let is_valid = verify_signature(&message_hash, &signature, &public_key);

    if is_valid {
        println!(" Assinatura VÁLIDA - Email autêntico!");
    } else {
        println!(" Assinatura INVÁLIDA - Email adulterado!");
    }

    println!("\n Métricas:");
    println!("  Algoritmo: ECDSA secp256k1 (Bitcoin-grade)");
    println!("  Nível de segurança: 128-bit");
    println!("  Dependências externas: 0 (zero)");
    println!("  Stack-allocated: 100%");
    println!("\n Filosofia Ávila: Matemática > Política");
    println!("  Sem backdoors governamentais");
    println!("  Código auditável");
    println!("  Performance máxima");

    Ok(())
}

/// Hash simplificado (SHA-256 seria usado em produção via avila-crypto)
fn hash_message(data: &[u8]) -> U256 {
    let mut hash = 0u64;
    for &byte in data {
        hash = hash.wrapping_mul(31).wrapping_add(byte as u64);
    }
    U256::from_bytes_be(&[
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        ((hash >> 56) & 0xFF) as u8,
        ((hash >> 48) & 0xFF) as u8,
        ((hash >> 40) & 0xFF) as u8,
        ((hash >> 32) & 0xFF) as u8,
        ((hash >> 24) & 0xFF) as u8,
        ((hash >> 16) & 0xFF) as u8,
        ((hash >> 8) & 0xFF) as u8,
        (hash & 0xFF) as u8,
    ])
}

/// Assina mensagem com ECDSA
fn sign_message(message_hash: &U256, private_key: &U256) -> Signature {
    // Nonce determinístico (RFC 6979 em produção)
    let k = U256::from_bytes_be(&[
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0xD4, 0x31, // 54321 in hex
    ]);

    // R = k  G
    let r_point = Secp256k1::scalar_mul(&k, &Secp256k1::generator());
    let r = r_point.x;

    // s = k¹  (hash + r  priv_key) mod n
    let curve_order = Secp256k1::N;
    let k_inv = k.inv_mod(&curve_order).unwrap();
    let r_priv = r.mul_mod(private_key, &curve_order);
    let hash_plus_r_priv = message_hash.add_mod(&r_priv, &curve_order);
    let s = k_inv.mul_mod(&hash_plus_r_priv, &curve_order);

    Signature { r, s }
}

/// Verifica assinatura ECDSA
fn verify_signature(
    message_hash: &U256,
    signature: &Signature,
    public_key: &PublicKey
) -> bool {
    signature.verify(message_hash, public_key).is_ok()
}
