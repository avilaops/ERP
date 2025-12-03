//! Tipo inteiro sem sinal de 2048 bits.

use core::fmt;
use core::ops::{Add, Sub, BitAnd, BitOr, BitXor, Not};
use crate::uint::UintCore;

/// Inteiro sem sinal de 2048 bits (32 palavras de 64 bits)
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub struct U2048([u64; 32]);

impl U2048 {
    /// Cria um novo U2048 a partir de um array de u64
    #[inline]
    pub const fn from_words(words: [u64; 32]) -> Self {
        U2048(words)
    }

    /// Retorna as palavras como array
    #[inline]
    pub const fn to_words(&self) -> [u64; 32] {
        self.0
    }

    /// Verifica se é zero
    #[inline]
    pub fn is_zero(&self) -> bool {
        self.0.iter().all(|&w| w == 0)
    }

    /// Conta os bits ativos
    pub fn count_ones(&self) -> u32 {
        self.0.iter().map(|w| w.count_ones()).sum()
    }

    /// Conta os zeros à esquerda
    pub fn leading_zeros(&self) -> u32 {
        for i in (0..32).rev() {
            if self.0[i] != 0 {
                return ((31 - i) * 64) as u32 + self.0[i].leading_zeros();
            }
        }
        2048
    }
}

impl UintCore for U2048 {
    const BITS: usize = 2048;
    const WORDS: usize = 32;
    const ZERO: Self = U2048([0; 32]);
    const ONE: Self = {
        let mut words = [0u64; 32];
        words[0] = 1;
        U2048(words)
    };
    const MAX: Self = U2048([u64::MAX; 32]);

    #[inline]
    fn from_u64(value: u64) -> Self {
        let mut words = [0u64; 32];
        words[0] = value;
        U2048(words)
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

impl From<u64> for U2048 {
    #[inline]
    fn from(value: u64) -> Self {
        U2048::from_u64(value)
    }
}

impl From<u128> for U2048 {
    #[inline]
    fn from(value: u128) -> Self {
        let mut words = [0u64; 32];
        words[0] = value as u64;
        words[1] = (value >> 64) as u64;
        U2048(words)
    }
}

impl Add for U2048 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        let mut result = [0u64; 32];
        let mut carry = 0u64;

        for i in 0..32 {
            let (sum, c1) = self.0[i].overflowing_add(rhs.0[i]);
            let (sum, c2) = sum.overflowing_add(carry);
            result[i] = sum;
            carry = (c1 | c2) as u64;
        }

        U2048(result)
    }
}

impl Sub for U2048 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self {
        let mut result = [0u64; 32];
        let mut borrow = 0u64;

        for i in 0..32 {
            let (diff, b1) = self.0[i].overflowing_sub(rhs.0[i]);
            let (diff, b2) = diff.overflowing_sub(borrow);
            result[i] = diff;
            borrow = (b1 | b2) as u64;
        }

        U2048(result)
    }
}

impl BitAnd for U2048 {
    type Output = Self;

    fn bitand(self, rhs: Self) -> Self {
        let mut result = [0u64; 32];
        for i in 0..32 {
            result[i] = self.0[i] & rhs.0[i];
        }
        U2048(result)
    }
}

impl BitOr for U2048 {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self {
        let mut result = [0u64; 32];
        for i in 0..32 {
            result[i] = self.0[i] | rhs.0[i];
        }
        U2048(result)
    }
}

impl BitXor for U2048 {
    type Output = Self;

    fn bitxor(self, rhs: Self) -> Self {
        let mut result = [0u64; 32];
        for i in 0..32 {
            result[i] = self.0[i] ^ rhs.0[i];
        }
        U2048(result)
    }
}

impl Not for U2048 {
    type Output = Self;

    fn not(self) -> Self {
        let mut result = [0u64; 32];
        for i in 0..32 {
            result[i] = !self.0[i];
        }
        U2048(result)
    }
}

impl fmt::Debug for U2048 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "U2048(0x")?;
        for &word in self.0.iter().rev() {
            write!(f, "{:016x}", word)?;
        }
        write!(f, ")")
    }
}

impl fmt::Display for U2048 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero() {
        assert!(U2048::ZERO.is_zero());
    }

    #[test]
    fn test_from_u64() {
        let val = U2048::from(42u64);
        assert_eq!(val.to_u64(), 42);
    }

    #[test]
    fn test_add() {
        let a = U2048::from(100u64);
        let b = U2048::from(200u64);
        let c = a + b;
        assert_eq!(c.to_u64(), 300);
    }
}
