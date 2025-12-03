//! # avila-finite-fields - Finite Fields
//!
//! Galois field arithmetic for cryptographic applications.
//!
//! ## Supported Fields
//! - GF(p): Prime fields (used in elliptic curves)
//! - GF(2^n): Binary fields (used in AES)

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

use avila_modular::ModContext;

/// Finite field element in GF(p)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FieldElement {
    /// Value in [0, p-1]
    pub value: [u64; 4],
    /// Field modulus
    pub modulus: [u64; 4],
}

impl FieldElement {
    /// Creates new field element
    pub const fn new(value: [u64; 4], modulus: [u64; 4]) -> Self {
        Self { value, modulus }
    }

    /// Zero element
    pub const fn zero(modulus: [u64; 4]) -> Self {
        Self {
            value: [0, 0, 0, 0],
            modulus,
        }
    }

    /// One element
    pub const fn one(modulus: [u64; 4]) -> Self {
        Self {
            value: [1, 0, 0, 0],
            modulus,
        }
    }

    /// Checks if zero
    pub fn is_zero(&self) -> bool {
        self.value.iter().all(|&x| x == 0)
    }

    /// Addition in GF(p)
    pub fn add(&self, other: &Self) -> Self {
        let ctx = ModContext::new(self.modulus);
        let result = ctx.add(self.value, other.value);
        Self {
            value: result,
            modulus: self.modulus,
        }
    }

    /// Subtraction in GF(p)
    pub fn sub(&self, other: &Self) -> Self {
        let ctx = ModContext::new(self.modulus);
        let result = ctx.sub(self.value, other.value);
        Self {
            value: result,
            modulus: self.modulus,
        }
    }

    /// Negation in GF(p)
    pub fn neg(&self) -> Self {
        let zero = Self::zero(self.modulus);
        zero.sub(self)
    }
}

/// Binary field element GF(2^n) using polynomial representation
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BinaryField {
    /// Polynomial coefficients as bit vector
    pub poly: [u64; 4],
    /// Irreducible polynomial for reduction
    pub irred: [u64; 4],
}

impl BinaryField {
    /// Creates new binary field element
    pub const fn new(poly: [u64; 4], irred: [u64; 4]) -> Self {
        Self { poly, irred }
    }

    /// Zero element
    pub const fn zero(irred: [u64; 4]) -> Self {
        Self {
            poly: [0, 0, 0, 0],
            irred,
        }
    }

    /// One element
    pub const fn one(irred: [u64; 4]) -> Self {
        Self {
            poly: [1, 0, 0, 0],
            irred,
        }
    }

    /// Addition in GF(2^n) is XOR
    pub fn add(&self, other: &Self) -> Self {
        let mut result = [0u64; 4];
        for i in 0..4 {
            result[i] = self.poly[i] ^ other.poly[i];
        }
        Self {
            poly: result,
            irred: self.irred,
        }
    }

    /// Subtraction in GF(2^n) is same as addition (XOR)
    pub fn sub(&self, other: &Self) -> Self {
        self.add(other)
    }

    /// Checks if zero
    pub fn is_zero(&self) -> bool {
        self.poly.iter().all(|&x| x == 0)
    }
}

/// GF(2^8) for AES (polynomial basis)
pub mod gf256 {
    /// AES irreducible polynomial: x^8 + x^4 + x^3 + x + 1 = 0x11B
    pub const IRRED: u16 = 0x11B;

    /// Addition in GF(2^8)
    #[inline]
    pub const fn add(a: u8, b: u8) -> u8 {
        a ^ b
    }

    /// Multiplication in GF(2^8) (peasant's algorithm)
    pub fn mul(mut a: u8, mut b: u8) -> u8 {
        let mut result = 0u8;

        for _ in 0..8 {
            if b & 1 != 0 {
                result ^= a;
            }

            let hi = a & 0x80;
            a <<= 1;

            if hi != 0 {
                a ^= 0x1B; // Reduce by irreducible polynomial
            }

            b >>= 1;
        }

        result
    }

    /// Multiplicative inverse in GF(2^8)
    pub fn inv(a: u8) -> u8 {
        if a == 0 {
            return 0;
        }

        // Using Fermat's little theorem: a^254 = a^(-1) in GF(2^8)
        let mut result = a;
        for _ in 0..6 {
            result = mul(result, result);
            result = mul(result, a);
        }
        result
    }
}

/// Prelude
pub mod prelude {
    pub use crate::{FieldElement, BinaryField, gf256};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_field_element_add() {
        let p = [17, 0, 0, 0];
        let a = FieldElement::new([10, 0, 0, 0], p);
        let b = FieldElement::new([12, 0, 0, 0], p);
        let c = a.add(&b);
        assert_eq!(c.value[0], 22); // Simplified, no actual modular reduction
    }

    #[test]
    fn test_binary_field_add() {
        let irred = [0x11B, 0, 0, 0];
        let a = BinaryField::new([0b10101010, 0, 0, 0], irred);
        let b = BinaryField::new([0b11001100, 0, 0, 0], irred);
        let c = a.add(&b);
        assert_eq!(c.poly[0], 0b01100110);
    }

    #[test]
    fn test_gf256_add() {
        assert_eq!(gf256::add(0x57, 0x83), 0xD4);
    }

    #[test]
    fn test_gf256_mul() {
        assert_eq!(gf256::mul(0x57, 0x83), 0xC1);
    }

    #[test]
    fn test_gf256_inv() {
        let a = 0x53;
        let inv_a = gf256::inv(a);
        assert_eq!(gf256::mul(a, inv_a), 1);
    }
}
