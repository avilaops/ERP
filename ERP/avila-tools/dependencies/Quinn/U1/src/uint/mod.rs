//! Tipos inteiros sem sinal de precisão arbitrária.

mod u248;
mod u2048;
mod uprime;

pub use u248::U248;
pub use u2048::U2048;
pub use uprime::UPrime;

/// Trait para tipos inteiros sem sinal customizados
pub trait UintCore: Sized + Copy + Clone {
    /// Número de bits do tipo
    const BITS: usize;

    /// Número de palavras u64
    const WORDS: usize;

    /// Zero
    const ZERO: Self;

    /// Um
    const ONE: Self;

    /// Valor máximo
    const MAX: Self;

    /// Cria a partir de u64
    fn from_u64(value: u64) -> Self;

    /// Converte para u64 (trunca se necessário)
    fn to_u64(&self) -> u64;

    /// Retorna as palavras internas
    fn words(&self) -> &[u64];
}
