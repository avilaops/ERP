//! Tipo inteiro sem sinal de 248 bits.

use core::fmt;
use core::ops::{Add, Sub, BitAnd, BitOr, BitXor, Not};
use crate::uint::UintCore;

/// Inteiro sem sinal de 248 bits (4 palavras de 64 bits)
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub struct U248([u64; 4]);

impl U248 {
    /// Cria um novo U248 a partir de um array de u64
    #[inline]
    pub const fn from_words(words: [u64; 4]) -> Self {
        U248(words)
    }

    /// Retorna as palavras como array
    #[inline]
    pub const fn to_words(&self) -> [u64; 4] {
        self.0
    }

    /// Verifica se é zero
    #[inline]
    pub const fn is_zero(&self) -> bool {
        self.0[0] == 0 && self.0[1] == 0 && self.0[2] == 0 && self.0[3] == 0
    }

    /// Conta os bits ativos
    pub const fn count_ones(&self) -> u32 {
        self.0[0].count_ones() +
        self.0[1].count_ones() +
        self.0[2].count_ones() +
        self.0[3].count_ones()
    }

    /// Conta os zeros à esquerda
    pub const fn leading_zeros(&self) -> u32 {
        if self.0[3] != 0 {
            self.0[3].leading_zeros()
        } else if self.0[2] != 0 {
            64 + self.0[2].leading_zeros()
        } else if self.0[1] != 0 {
            128 + self.0[1].leading_zeros()
        } else {
            192 + self.0[0].leading_zeros()
        }
    }
}

impl UintCore for U248 {
    const BITS: usize = 248;
    const WORDS: usize = 4;
    const ZERO: Self = U248([0; 4]);
    const ONE: Self = U248([1, 0, 0, 0]);
    const MAX: Self = U248([u64::MAX; 4]);

    #[inline]
    fn from_u64(value: u64) -> Self {
        U248([value, 0, 0, 0])
    }

    #[inline]
    fn to_u64(&self) -> u64 {
        self.0[0]
    }

    #[inline]
    fn words(&self) -> &[u64] {
        &self.0
    }
}

impl From<u64> for U248 {
    #[inline]
    fn from(value: u64) -> Self {
        U248::from_u64(value)
    }
}

impl From<u128> for U248 {
    #[inline]
    fn from(value: u128) -> Self {
        U248([
            value as u64,
            (value >> 64) as u64,
            0,
            0,
        ])
    }
}

impl Add for U248 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        let mut result = [0u64; 4];
        let mut carry = 0u64;

        for i in 0..4 {
            let (sum, c1) = self.0[i].overflowing_add(rhs.0[i]);
            let (sum, c2) = sum.overflowing_add(carry);
            result[i] = sum;
            carry = (c1 | c2) as u64;
        }

        U248(result)
    }
}

impl Sub for U248 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self {
        let mut result = [0u64; 4];
        let mut borrow = 0u64;

        for i in 0..4 {
            let (diff, b1) = self.0[i].overflowing_sub(rhs.0[i]);
            let (diff, b2) = diff.overflowing_sub(borrow);
            result[i] = diff;
            borrow = (b1 | b2) as u64;
        }

        U248(result)
    }
}

impl BitAnd for U248 {
    type Output = Self;

    fn bitand(self, rhs: Self) -> Self {
        U248([
            self.0[0] & rhs.0[0],
            self.0[1] & rhs.0[1],
            self.0[2] & rhs.0[2],
            self.0[3] & rhs.0[3],
        ])
    }
}

impl BitOr for U248 {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self {
        U248([
            self.0[0] | rhs.0[0],
            self.0[1] | rhs.0[1],
            self.0[2] | rhs.0[2],
            self.0[3] | rhs.0[3],
        ])
    }
}

impl BitXor for U248 {
    type Output = Self;

    fn bitxor(self, rhs: Self) -> Self {
        U248([
            self.0[0] ^ rhs.0[0],
            self.0[1] ^ rhs.0[1],
            self.0[2] ^ rhs.0[2],
            self.0[3] ^ rhs.0[3],
        ])
    }
}

impl Not for U248 {
    type Output = Self;

    fn not(self) -> Self {
        U248([
            !self.0[0],
            !self.0[1],
            !self.0[2],
            !self.0[3],
        ])
    }
}

impl fmt::Debug for U248 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "U248({:#x}_{:#x}_{:#x}_{:#x})",
               self.0[3], self.0[2], self.0[1], self.0[0])
    }
}

impl fmt::Display for U248 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero() {
        assert!(U248::ZERO.is_zero());
        assert_eq!(U248::ZERO.to_u64(), 0);
    }

    #[test]
    fn test_from_u64() {
        let val = U248::from(42u64);
        assert_eq!(val.to_u64(), 42);
    }

    #[test]
    fn test_add() {
        let a = U248::from(100u64);
        let b = U248::from(200u64);
        let c = a + b;
        assert_eq!(c.to_u64(), 300);
    }

    #[test]
    fn test_sub() {
        let a = U248::from(200u64);
        let b = U248::from(100u64);
        let c = a - b;
        assert_eq!(c.to_u64(), 100);
    }
}
