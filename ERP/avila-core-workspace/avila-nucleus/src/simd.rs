//! Instruções SIMD manuais para performance máxima
//!
//! - AVX2: 256 bits (4x u64)
//! - AVX-512: 512 bits (8x u64)
//! - NEON: 128 bits (2x u64) para ARM

#[cfg(target_arch = "x86_64")]
pub mod x86_64;

#[cfg(target_arch = "aarch64")]
pub mod aarch64;

/// Trait para operações SIMD genéricas
pub trait SimdOps {
    /// Tipo do vetor SIMD
    type Vector;

    /// Carrega dados na memória para vetor SIMD
    unsafe fn load(ptr: *const u64) -> Self::Vector;

    /// Armazena vetor SIMD na memória
    unsafe fn store(ptr: *mut u64, vec: Self::Vector);

    /// Adição vetorial
    unsafe fn add(a: Self::Vector, b: Self::Vector) -> Self::Vector;

    /// Subtração vetorial
    unsafe fn sub(a: Self::Vector, b: Self::Vector) -> Self::Vector;

    /// XOR vetorial
    unsafe fn xor(a: Self::Vector, b: Self::Vector) -> Self::Vector;

    /// AND vetorial
    unsafe fn and(a: Self::Vector, b: Self::Vector) -> Self::Vector;
}
