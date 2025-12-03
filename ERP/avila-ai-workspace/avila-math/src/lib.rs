//! # Ávila Math
//!
//! Operações matemáticas avançadas para criptografia.
//!
//! ## Módulos
//! - `modular`: Aritmética modular (adição, subtração, multiplicação, inversão)
//! - `montgomery`: Montgomery reduction para exponenciação modular eficiente
//! - `barrett`: Barrett reduction (alternativa ao Montgomery)
//! - `karatsuba`: Multiplicação rápida O(n^1.585)

#![no_std]
#![deny(unsafe_op_in_unsafe_fn)]
#![warn(missing_docs)]

extern crate alloc;

pub mod modular;
pub mod montgomery;

// Removido: use avila_primitives::U256;

/// Trait para operações modulares
pub trait ModularArithmetic: Sized {
    /// Adição modular: (a + b) mod m
    fn add_mod(&self, rhs: &Self, modulus: &Self) -> Self;

    /// Subtração modular: (a - b) mod m
    fn sub_mod(&self, rhs: &Self, modulus: &Self) -> Self;

    /// Multiplicação modular: (a × b) mod m
    fn mul_mod(&self, rhs: &Self, modulus: &Self) -> Self;

    /// Exponenciação modular: a^exp mod m
    fn pow_mod(&self, exp: &Self, modulus: &Self) -> Self;

    /// Inverso modular: a^(-1) mod m (usando Extended Euclidean Algorithm)
    fn mod_inverse(&self, modulus: &Self) -> Self;
}
