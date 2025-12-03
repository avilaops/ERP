#![no_std]

//! Álgebra modular construída sobre as primitivas fixas da Ávila.
//! Inclui redução modular, inversão, exponentiação rápida e modo Montgomery.

#[cfg(feature = "std")]
extern crate std;

pub mod modular;
pub mod montgomery;

pub use modular::{mod_add, mod_mul, mod_sub, mod_pow, mod_inverse};
pub use montgomery::MontgomeryContext;

/// Versão embutida do crate.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
