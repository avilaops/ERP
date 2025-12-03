#![no_std]

//! Primitivas de inteiros de tamanho fixo construídas sobre o Ávila Nucleus.
//! Estas estruturas são a base para camadas de aritmética modular, curvas elípticas
//! e protocolos criptográficos de maior nível.

#[cfg(feature = "std")]
extern crate std;

pub mod u256;
pub mod u512;

pub use u256::U256;
pub use u512::U512;

/// Versão embutida do crate de primitivas.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
