//! # Ávila Primitives
//!
//! Tipos de inteiros fixed-size para operações criptográficas.
//! Todos os tipos são stack-allocated (zero heap).
//!
//! ## Tipos Disponíveis
//! - `U256`: 256 bits (curvas elípticas P-256, secp256k1)
//! - `U384`: 384 bits (curva P-384, BLS12-381 fields)
//! - `U512`: 512 bits (RSA intermediário)
//! - `U2048`: 2048 bits (RSA-2048 padrão)
//! - `U4096`: 4096 bits (RSA-4096 segurança máxima)
//! - `U8192`: 8192 bits (FHE bootstrapping)

#![no_std]
#![deny(unsafe_op_in_unsafe_fn)]
#![warn(missing_docs)]

extern crate alloc;
use alloc::vec::Vec;

pub mod u256;
pub mod u384;
pub mod u512;
pub mod u2048;
pub mod u4096;

pub use u256::U256;
pub use u384::U384;
pub use u512::U512;
pub use u2048::U2048;
pub use u4096::U4096;

/// Trait para operações comuns entre todos os tipos big integer
pub trait BigUint: Sized + Copy + Clone {
    /// Número de limbs (u64)
    const LIMBS: usize;

    /// Número de bits
    const BITS: usize;

    /// Número de bytes
    const BYTES: usize;

    /// Valor zero
    const ZERO: Self;

    /// Valor um
    const ONE: Self;

    /// Cria a partir de um u64
    fn from_u64(value: u64) -> Self;

    /// Converte para bytes big-endian
    fn to_bytes_be(&self) -> Vec<u8>;

    /// Cria a partir de bytes big-endian
    fn from_bytes_be(bytes: &[u8]) -> Self;

    /// Verifica se é zero
    fn is_zero(&self) -> bool;

    /// Verifica se é ímpar
    fn is_odd(&self) -> bool;
}
