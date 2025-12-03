//! # avila-nucleus
//!
//! **Fundação Atômica da Pilha Criptográfica Ávila**
//!
//! Operações de nível mais baixo possível:
//! - Manipulação direta de bits
//! - Aritmética de precisão estendida (u64 → u128)
//! - SIMD intrinsics raw (AVX2, AVX-512)
//! - Operações constant-time
//!
//! ## Filosofia
//!
//! - ZERO abstrações desnecessárias
//! - ZERO dependencies
//! - 100% manual control
//! - Constant-time por padrão
//!
//! ## Uso
//!
//! ```rust
//! use avila_nucleus::bits::*;
//!
//! // Adição com carry
//! let (sum, carry) = adc(0xFFFFFFFFFFFFFFFF, 1, 0);
//! assert_eq!(sum, 0);
//! assert_eq!(carry, 1);
//!
//! // Multiplicação wide
//! let (lo, hi) = mul_wide(0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF);
//! ```

#![no_std]
#![warn(missing_docs)]
#![warn(clippy::all)]
#![allow(incomplete_features)]

#[cfg(feature = "std")]
extern crate std;

pub mod bits;
pub mod simd;

/// Versão do núcleo
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Verifica se código está rodando em constant-time
/// (compile-time check, não runtime)
#[inline(always)]
pub const fn assert_ct() {
    // Placeholder para futuras verificações
}
