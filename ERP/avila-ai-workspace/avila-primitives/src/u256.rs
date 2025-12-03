//! Inteiro de 256 bits unsigned
//!
//! Usado em:
//! - secp256k1 (Bitcoin/Ethereum)
//! - Curve25519 (Ed25519)
//! - P-256 (NIST)

use avila_nucleus::{adc, sbb, mul_wide, mac};
use alloc::vec::Vec;
use core::ops::{Add, Sub};

/// Inteiro de 256 bits (4 limbs de 64 bits)
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(align(32))]
pub struct U256 {
    /// Limbs em little-endian (limbs[0] = bits menos significativos)
    pub limbs: [u64; 4],
}

impl U256 {
    /// Número de limbs
    pub const LIMBS: usize = 4;

    /// Número de bits
    pub const BITS: usize = 256;

    /// Número de bytes
    pub const BYTES: usize = 32;

    /// Valor zero
    pub const ZERO: Self = Self { limbs: [0; 4] };

    /// Valor um
    pub const ONE: Self = Self { limbs: [1, 0, 0, 0] };

    /// Valor máximo (2^256 - 1)
    pub const MAX: Self = Self { limbs: [u64::MAX; 4] };

    /// Cria a partir de um u64
    #[inline(always)]
    pub const fn from_u64(value: u64) -> Self {
        Self {
            limbs: [value, 0, 0, 0],
        }
    }

    /// Cria a partir de bytes big-endian
    pub fn from_bytes_be(bytes: &[u8]) -> Self {
        assert!(bytes.len() <= 32, "Bytes excedem 256 bits");

        let mut limbs = [0u64; 4];
        let mut padded = [0u8; 32];
        padded[32 - bytes.len()..].copy_from_slice(bytes);

        for (i, chunk) in padded.chunks_exact(8).enumerate() {
            limbs[3 - i] = u64::from_be_bytes(chunk.try_into().unwrap());
        }

        Self { limbs }
    }

    /// Converte para bytes big-endian
    pub fn to_bytes_be(&self) -> [u8; 32] {
        let mut bytes = [0u8; 32];
        for (i, &limb) in self.limbs.iter().rev().enumerate() {
            bytes[i * 8..(i + 1) * 8].copy_from_slice(&limb.to_be_bytes());
        }
        bytes
    }

    /// Cria a partir de string hexadecimal
    pub const fn from_hex_const(hex: &str) -> Self {
        // TODO: Implementar versão const
        Self::ZERO
    }

    /// Cria a partir de string hexadecimal
    pub fn from_hex(hex: &str) -> Self {
        let hex = hex.trim_start_matches("0x");
        let bytes = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect::<Vec<_>>();
        Self::from_bytes_be(&bytes)
    }

    /// Verifica se é zero
    #[inline(always)]
    pub const fn is_zero(&self) -> bool {
        self.limbs[0] == 0 && self.limbs[1] == 0 && self.limbs[2] == 0 && self.limbs[3] == 0
    }

    /// Verifica se é ímpar
    #[inline(always)]
    pub const fn is_odd(&self) -> bool {
        (self.limbs[0] & 1) == 1
    }

    /// Adição (wrapping)
    pub const fn wrapping_add(&self, rhs: &Self) -> Self {
        let mut result = Self::ZERO;
        let mut carry = 0;

        let (sum, c) = adc(self.limbs[0], rhs.limbs[0], carry);
        result.limbs[0] = sum;
        carry = c;

        let (sum, c) = adc(self.limbs[1], rhs.limbs[1], carry);
        result.limbs[1] = sum;
        carry = c;

        let (sum, c) = adc(self.limbs[2], rhs.limbs[2], carry);
        result.limbs[2] = sum;
        carry = c;

        let (sum, _) = adc(self.limbs[3], rhs.limbs[3], carry);
        result.limbs[3] = sum;

        result
    }

    /// Subtração (wrapping)
    pub const fn wrapping_sub(&self, rhs: &Self) -> Self {
        let mut result = Self::ZERO;
        let mut borrow = 0;

        let (diff, b) = sbb(self.limbs[0], rhs.limbs[0], borrow);
        result.limbs[0] = diff;
        borrow = b;

        let (diff, b) = sbb(self.limbs[1], rhs.limbs[1], borrow);
        result.limbs[1] = diff;
        borrow = b;

        let (diff, b) = sbb(self.limbs[2], rhs.limbs[2], borrow);
        result.limbs[2] = diff;
        borrow = b;

        let (diff, _) = sbb(self.limbs[3], rhs.limbs[3], borrow);
        result.limbs[3] = diff;

        result
    }

    /// Multiplicação por u64
    pub const fn mul_u64(&self, rhs: u64) -> Self {
        let mut result = Self::ZERO;
        let mut carry = 0;

        let (lo, hi) = mul_wide(self.limbs[0], rhs);
        result.limbs[0] = lo;
        carry = hi;

        let (lo, carry) = mac(self.limbs[1], rhs, carry, 0);
        result.limbs[1] = lo;

        let (lo, carry) = mac(self.limbs[2], rhs, carry, 0);
        result.limbs[2] = lo;

        let (lo, _) = mac(self.limbs[3], rhs, carry, 0);
        result.limbs[3] = lo;

        result
    }

    /// Shift left por 1 bit
    pub const fn shl1(&self) -> Self {
        let mut result = Self::ZERO;
        result.limbs[0] = self.limbs[0] << 1;
        result.limbs[1] = (self.limbs[1] << 1) | (self.limbs[0] >> 63);
        result.limbs[2] = (self.limbs[2] << 1) | (self.limbs[1] >> 63);
        result.limbs[3] = (self.limbs[3] << 1) | (self.limbs[2] >> 63);
        result
    }

    /// Shift right por 1 bit
    pub const fn shr1(&self) -> Self {
        let mut result = Self::ZERO;
        result.limbs[3] = self.limbs[3] >> 1;
        result.limbs[2] = (self.limbs[2] >> 1) | (self.limbs[3] << 63);
        result.limbs[1] = (self.limbs[1] >> 1) | (self.limbs[2] << 63);
        result.limbs[0] = (self.limbs[0] >> 1) | (self.limbs[1] << 63);
        result
    }

    /// Comparação: retorna -1 se self < rhs, 0 se igual, 1 se self > rhs
    pub const fn cmp(&self, rhs: &Self) -> i8 {
        let mut i = 3;
        loop {
            if self.limbs[i] < rhs.limbs[i] {
                return -1;
            }
            if self.limbs[i] > rhs.limbs[i] {
                return 1;
            }
            if i == 0 {
                break;
            }
            i -= 1;
        }
        0
    }
}

impl Default for U256 {
    #[inline]
    fn default() -> Self {
        Self::ZERO
    }
}

impl Add for U256 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        self.wrapping_add(&rhs)
    }
}

impl Sub for U256 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self {
        self.wrapping_sub(&rhs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero_one() {
        assert!(U256::ZERO.is_zero());
        assert!(!U256::ONE.is_zero());
        assert!(U256::ONE.is_odd());
        assert!(!U256::ZERO.is_odd());
    }

    #[test]
    fn test_from_u64() {
        let n = U256::from_u64(42);
        assert_eq!(n.limbs[0], 42);
        assert_eq!(n.limbs[1], 0);
    }

    #[test]
    fn test_addition() {
        let a = U256::from_u64(100);
        let b = U256::from_u64(200);
        let c = a + b;
        assert_eq!(c.limbs[0], 300);
    }

    #[test]
    fn test_subtraction() {
        let a = U256::from_u64(200);
        let b = U256::from_u64(100);
        let c = a - b;
        assert_eq!(c.limbs[0], 100);
    }

    #[test]
    fn test_hex() {
        let n = U256::from_hex("0x0000000000000000000000000000000000000000000000000000000000000042");
        assert_eq!(n.limbs[0], 0x42);
    }

    #[test]
    fn test_bytes_conversion() {
        let n = U256::from_u64(0x123456789ABCDEF0);
        let bytes = n.to_bytes_be();
        let recovered = U256::from_bytes_be(&bytes);
        assert_eq!(n, recovered);
    }
}
