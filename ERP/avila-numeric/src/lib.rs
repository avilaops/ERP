//! # avila-numeric
//!
//! Generic numeric traits for AVL Platform.
//!
//! ## Features
//!
//! - Generic numeric operations
//! - Zero, One, Num, Float, Integer traits
//! - no_std compatible
//! - Type-safe mathematical operations
//!
//! ## Quick Start
//!
//! ```rust
//! use avila_numeric::{Zero, One, Num};
//!
//! fn add_one<T: Num>(x: T) -> T {
//!     x + T::one()
//! }
//!
//! assert_eq!(add_one(5i32), 6i32);
//! assert_eq!(add_one(2.5f64), 3.5f64);
//! ```

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]
#![warn(clippy::all)]

mod traits;
mod impls;

pub use traits::*;

/// Version information
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero() {
        assert_eq!(i32::zero(), 0);
        assert_eq!(f64::zero(), 0.0);
        assert!(0i32.is_zero());
        assert!(0.0f64.is_zero());
    }

    #[test]
    fn test_one() {
        assert_eq!(i32::one(), 1);
        assert_eq!(f64::one(), 1.0);
    }

    #[test]
    fn test_float_operations() {
        let x = 16.0f64;
        assert_eq!(x.sqrt(), 4.0);
        assert_eq!((-5.0f64).abs(), 5.0);
        assert_eq!(3.7f64.floor(), 3.0);
        assert_eq!(3.2f64.ceil(), 4.0);
    }

    #[test]
    fn test_integer_operations() {
        assert_eq!(10i32.div_floor(&3), 3);
        assert_eq!(10i32.mod_floor(&3), 1);
        assert_eq!(12i32.gcd(&8), 4);
    }
}
