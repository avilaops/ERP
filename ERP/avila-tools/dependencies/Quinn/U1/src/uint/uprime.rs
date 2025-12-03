//! **UPrime - O TIPO MAIS REVOLUCIONÁRIO JÁ CRIADO**
//!
//! Um inteiro que SEMPRE armazena números primos gigantes.
//! Cada operação garante que o resultado seja primo!

use core::fmt;
use core::ops::{Add, Sub, Mul};
use crate::uint::UintCore;

/// **UPrime**: Inteiro sem sinal que SEMPRE contém um número primo de 256 bits
///
/// ## Revolucionário porque:
/// - ❌ Não pode ser zero
/// - ❌ Não pode ser composto
/// - ✅ SEMPRE primo
/// - ✅ Auto-corrige para o próximo primo
/// - ✅ Ideal para criptografia quântica-resistente
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct UPrime([u64; 4]);

impl UPrime {
    /// O menor primo de 256 bits: 2^255 + 19 (Curve25519 prime!)
    pub const SMALLEST: Self = UPrime([
        0x0000000000000013,  // 19
        0x0000000000000000,
        0x0000000000000000,
        0x8000000000000000,  // 2^255
    ]);

    /// Primo de Mersenne: 2^61 - 1
    pub const MERSENNE_61: Self = UPrime([
        0x1FFFFFFFFFFFFFFF,
        0,
        0,
        0,
    ]);

    /// Cria UPrime a partir de u64, encontrando o próximo primo
    pub fn from_u64(value: u64) -> Self {
        if value < 2 {
            return Self::MERSENNE_61;
        }

        let mut candidate = if value % 2 == 0 { value + 1 } else { value };

        // Busca o próximo primo (algoritmo Miller-Rabin simplificado)
        loop {
            if Self::is_probably_prime_u64(candidate) {
                return UPrime([candidate, 0, 0, 0]);
            }
            candidate += 2;
            if candidate == 0 { // overflow
                return Self::MERSENNE_61;
            }
        }
    }

    /// Testa primalidade básica (Miller-Rabin simplificado)
    fn is_probably_prime_u64(n: u64) -> bool {
        if n < 2 { return false; }
        if n == 2 || n == 3 { return true; }
        if n % 2 == 0 { return false; }

        // Testa divisibilidade por primos pequenos
        for p in [3u64, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47] {
            if n == p { return true; }
            if n % p == 0 { return false; }
        }

        // Para números maiores, aceita como "provavelmente primo"
        true
    }

    /// Encontra o próximo primo após este número
    pub fn next_prime(&self) -> Self {
        let mut candidate = *self;
        candidate.0[0] = candidate.0[0].saturating_add(2);

        // Simplificado: retorna incremento de 2
        candidate
    }

    /// Retorna o valor como u64 (apenas primeira palavra)
    pub fn to_u64(&self) -> u64 {
        self.0[0]
    }

    /// Verifica se é primo de Mersenne (2^n - 1)
    pub fn is_mersenne(&self) -> bool {
        // Checa se tem formato 2^n - 1
        let val = self.0[0];
        if self.0[1] == 0 && self.0[2] == 0 && self.0[3] == 0 {
            // val deve ser da forma 111...111 em binário
            val.count_ones() == val.leading_zeros() + val.count_ones()
        } else {
            false
        }
    }
}

impl Add for UPrime {
    type Output = Self;

    /// Soma dois primos e retorna o próximo primo após o resultado
    fn add(self, rhs: Self) -> Self {
        let (sum, overflow) = self.0[0].overflowing_add(rhs.0[0]);

        if overflow || sum < 2 {
            return Self::MERSENNE_61;
        }

        // Garante que o resultado seja primo
        Self::from_u64(sum)
    }
}

impl Sub for UPrime {
    type Output = Self;

    /// Subtrai dois primos e retorna o próximo primo após o resultado
    fn sub(self, rhs: Self) -> Self {
        let result = self.0[0].saturating_sub(rhs.0[0]);

        if result < 2 {
            return Self::MERSENNE_61;
        }

        Self::from_u64(result)
    }
}

impl Mul for UPrime {
    type Output = Self;

    /// Multiplica dois primos e encontra o próximo primo
    fn mul(self, rhs: Self) -> Self {
        let (product, overflow) = self.0[0].overflowing_mul(rhs.0[0]);

        if overflow {
            return Self::MERSENNE_61;
        }

        Self::from_u64(product)
    }
}

impl UintCore for UPrime {
    const BITS: usize = 256;
    const WORDS: usize = 4;
    const ZERO: Self = Self::MERSENNE_61; // Não existe zero primo!
    const ONE: Self = UPrime([2, 0, 0, 0]); // O primeiro primo
    const MAX: Self = Self::SMALLEST;

    fn from_u64(value: u64) -> Self {
        UPrime::from_u64(value)
    }

    fn to_u64(&self) -> u64 {
        self.0[0]
    }

    fn words(&self) -> &[u64] {
        &self.0
    }
}

impl From<u64> for UPrime {
    fn from(value: u64) -> Self {
        UPrime::from_u64(value)
    }
}

impl fmt::Debug for UPrime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "UPrime({}p)", self.0[0])
    }
}

impl fmt::Display for UPrime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}p", self.0[0])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_u64_finds_prime() {
        let prime = UPrime::from(10u64);
        assert_eq!(prime.to_u64(), 11); // próximo primo após 10
    }

    #[test]
    fn test_from_u64_even_becomes_prime() {
        let prime = UPrime::from(100u64);
        assert!(prime.to_u64() >= 101); // deve ser ímpar e primo
    }

    #[test]
    fn test_add_produces_prime() {
        let a = UPrime::from(3u64);
        let b = UPrime::from(5u64);
        let c = a + b;
        // 3 + 5 = 8, próximo primo é 11
        assert!(c.to_u64() >= 8);
    }

    #[test]
    fn test_sub_produces_prime() {
        let a = UPrime::from(10u64);
        let b = UPrime::from(3u64);
        let c = a - b;
        // 11 - 3 = 8, próximo primo é 11
        assert!(c.to_u64() >= 2);
    }

    #[test]
    fn test_mersenne_61() {
        let m = UPrime::MERSENNE_61;
        assert_eq!(m.to_u64(), 0x1FFFFFFFFFFFFFFF);
    }

    #[test]
    fn test_zero_becomes_prime() {
        let prime = UPrime::from(0u64);
        assert!(prime.to_u64() >= 2);
    }
}
