//! # AVX Primitives
//!
//! Tipos primitivos revolucionários de alta performance para algoritmos avançados.
//!
//! ## Tipos Disponíveis
//!
//! ### Inteiros Clássicos
//! - `U248`: Inteiro sem sinal de 248 bits
//! - `U2048`: Inteiro sem sinal de 2048 bits
//!
//! ### Tipos Revolucionários 🔥
//! - `UPrime`: Inteiro que SEMPRE contém números primos (256 bits)
//! - `HGeo`: Hash geométrico hiperdimensional (13 dimensões, 832 bits)
//! - `H1024`: Hash tradicional de 1024 bits
//!
//! ## Exemplo
//!
//! ```rust
//! use avx_primitives::{U248, UPrime, HGeo};
//!
//! // Inteiros clássicos
//! let a = U248::from(100u64);
//! let b = U248::from(200u64);
//! let c = a + b;
//!
//! // Números primos revolucionários
//! let prime = UPrime::from(100u64); // Automaticamente encontra 101
//! let next = prime.next_prime();
//!
//! // Hash geométrico 13D
//! let hash1 = HGeo::from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
//! let hash2 = HGeo::from([1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
//! let distance = hash1.distance_squared(&hash2);
//! ```

#![cfg_attr(not(feature = "std"), no_std)]
#![deny(missing_docs)]
#![deny(unsafe_code)]

pub mod uint;
pub mod hash;
pub mod ops;

// Re-exports públicos
pub use uint::{U248, U2048, UPrime};
pub use hash::{H1024, HGeo};

/// Versão da crate
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Autor
pub const AUTHOR: &str = "Nícolas Ávila";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert_eq!(VERSION, "0.1.0");
    }
}
