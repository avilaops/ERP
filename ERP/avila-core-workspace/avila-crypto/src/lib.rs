//! # Ávila Crypto
//!
//! Criptografia soberana - apenas algoritmos aprovados pela Ávila.
//! Zero compromissos com agências governamentais.
//!
//! ## Filosofia
//! - **secp256k1**: Battle-tested pelo Bitcoin
//! - **Curve25519**: Moderna e constant-time
//! - **BLS12-381**: Para threshold signatures e ZK
//! - **BLAKE3**: Mais rápido que SHA, mais seguro
//! - **Schnorr**: Agregação elegante
//! - **Ed25519**: Determinística e rápida
//!
//! ## NÃO USAMOS
//! - P-256 (NIST): constantes suspeitas
//! - RSA: lento e legado
//! - SHA-2: aprovado demais pelos governos

#![no_std]
#![deny(unsafe_op_in_unsafe_fn)]
#![warn(missing_docs)]

pub mod curves;
pub mod signatures;
pub mod hash;
pub mod cipher;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
