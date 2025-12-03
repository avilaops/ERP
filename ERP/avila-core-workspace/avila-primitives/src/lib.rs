//! # Ávila Primitives
//!
//! Tipos fundamentais de inteiros grandes fixed-size.
//! Stack-allocated, constant-time, SIMD-optimized.
//!
//! ## Tipos Disponíveis
//! - `U256`: 256 bits (32 bytes) - secp256k1, P-256
//! - `U384`: 384 bits (48 bytes) - P-384
//! - `U512`: 512 bits (64 bytes) - SHA-512
//! - `U1024`: 1024 bits (128 bytes) - RSA-1024
//! - `U2048`: 2048 bits (256 bytes) - RSA-2048
//! - `U4096`: 4096 bits (512 bytes) - RSA-4096

#![no_std]
#![deny(unsafe_op_in_unsafe_fn)]
#![warn(missing_docs)]

pub mod u256;
pub mod u384;
pub mod u512;
pub mod u1024;
pub mod u2048;
pub mod u4096;

pub use u256::U256;
pub use u384::U384;
pub use u512::U512;
pub use u1024::U1024;
pub use u2048::U2048;
pub use u4096::U4096;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
