//! Abstrações mínimas sobre intrínsecos SIMD.
//! Tudo é opcional e controlado via detecção de recursos em tempo de compilação/execução.

pub mod detect;

#[cfg(all(target_arch = "x86_64", feature = "simd"))]
pub mod avx2;
#[cfg(all(target_arch = "x86_64", feature = "simd"))]
pub mod avx512;

pub use detect::*;
