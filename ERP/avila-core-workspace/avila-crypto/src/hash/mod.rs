//! Funções de hash criptográficas

pub mod blake3;
pub mod keccak;
pub mod sha3;

// Nota: Trait genérico removido devido a limitações com const generics em Rust stable
// Cada hash implementa sua própria interface
