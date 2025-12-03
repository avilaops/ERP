//! SIMD intrinsics - wrappers de baixo nível
//!
//! Abstração mínima sobre intrinsics SIMD para operações vetorizadas

pub mod detect;

#[cfg(all(target_arch = "x86_64", feature = "simd"))]
pub mod avx2;

#[cfg(all(target_arch = "x86_64", feature = "simd"))]
pub mod avx512;

pub use detect::*;

#[cfg(all(target_arch = "x86_64", feature = "simd"))]
pub use avx2::*;

#[cfg(all(target_arch = "x86_64", feature = "simd"))]
pub use avx512::*;
