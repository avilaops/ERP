//! Inteiro de 256 bits sem sinal
//!
//! Usado em secp256k1 (Bitcoin), P-256 (NIST), hashes SHA-256

use avila_nucleus::bits::{adc, sbb, mul_wide};
use core::cmp::Ordering;
use core::fmt;

/// Inteiro de 256 bits (4 limbs de u64)
#[repr(C, align(32))]
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct U256 {
    /// Limbs em little-endian (limbs[0] é o menos significativo)
    pub limbs: [u64; 4],
}

impl U256 {
    /// Número de limbs (u64)
    pub const LIMBS: usize = 4;

    /// Número de bits
    pub const BITS: usize = 256;

    /// Número de bytes
    pub const BYTES: usize = 32;

    /// Zero
    pub const ZERO: Self = Self { limbs: [0; 4] };

    /// Um
    pub const ONE: Self = Self {
        limbs: [1, 0, 0, 0],
    };

    /// Valor máximo (2^256 - 1)
    pub const MAX: Self = Self {
        limbs: [u64::MAX; 4],
    };

    /// Cria U256 a partir de limbs
    #[inline(always)]
    pub const fn from_limbs(limbs: [u64; 4]) -> Self {
        Self { limbs }
    }

    /// Cria U256 a partir de u64
    #[inline(always)]
    pub const fn from_u64(value: u64) -> Self {
        Self {
            limbs: [value, 0, 0, 0],
        }
    }

    /// Cria U256 a partir de bytes big-endian
    pub fn from_bytes_be(bytes: &[u8; 32]) -> Self {
        let mut limbs = [0u64; 4];
        for i in 0..4 {
            let offset = i * 8;
            limbs[3 - i] = u64::from_be_bytes([
                bytes[offset],
                bytes[offset + 1],
                bytes[offset + 2],
                bytes[offset + 3],
                bytes[offset + 4],
                bytes[offset + 5],
                bytes[offset + 6],
                bytes[offset + 7],
            ]);
        }
        Self { limbs }
    }

    /// Converte para bytes big-endian
    pub fn to_bytes_be(&self) -> [u8; 32] {
        let mut bytes = [0u8; 32];
        for i in 0..4 {
            let limb_bytes = self.limbs[3 - i].to_be_bytes();
            let offset = i * 8;
            bytes[offset..offset + 8].copy_from_slice(&limb_bytes);
        }
        bytes
    }

    /// Testa se é zero
    #[inline(always)]
    pub const fn is_zero(&self) -> bool {
        (self.limbs[0] | self.limbs[1] | self.limbs[2] | self.limbs[3]) == 0
    }

    /// Testa se é ímpar
    #[inline(always)]
    pub const fn is_odd(&self) -> bool {
        (self.limbs[0] & 1) == 1
    }

    /// Adição (não verifica overflow)
    pub const fn wrapping_add(&self, rhs: &Self) -> Self {
        let (l0, c0) = adc(self.limbs[0], rhs.limbs[0], 0);
        let (l1, c1) = adc(self.limbs[1], rhs.limbs[1], c0);
        let (l2, c2) = adc(self.limbs[2], rhs.limbs[2], c1);
        let (l3, _) = adc(self.limbs[3], rhs.limbs[3], c2);
        Self {
            limbs: [l0, l1, l2, l3],
        }
    }

    /// Subtração (não verifica underflow)
    pub const fn wrapping_sub(&self, rhs: &Self) -> Self {
        let (l0, b0) = sbb(self.limbs[0], rhs.limbs[0], 0);
        let (l1, b1) = sbb(self.limbs[1], rhs.limbs[1], b0);
        let (l2, b2) = sbb(self.limbs[2], rhs.limbs[2], b1);
        let (l3, _) = sbb(self.limbs[3], rhs.limbs[3], b2);
        Self {
            limbs: [l0, l1, l2, l3],
        }
    }

    /// Multiplicação (retorna apenas os 256 bits baixos)
    pub fn wrapping_mul(&self, rhs: &Self) -> Self {
        let (low, _high) = self.mul_wide(rhs);
        low
    }

    /// Multiplicação por u64
    pub const fn mul_u64(&self, rhs: u64) -> (Self, u64) {
        let (l0, c0) = mul_wide(self.limbs[0], rhs);
        let (l1_temp, c1_temp) = mul_wide(self.limbs[1], rhs);
        let (l1, c1_carry) = adc(l1_temp, c0, 0);
        let c1 = c1_temp + c1_carry;

        let (l2_temp, c2_temp) = mul_wide(self.limbs[2], rhs);
        let (l2, c2_carry) = adc(l2_temp, c1, 0);
        let c2 = c2_temp + c2_carry;

        let (l3_temp, c3) = mul_wide(self.limbs[3], rhs);
        let (l3, carry) = adc(l3_temp, c2, 0);

        (Self { limbs: [l0, l1, l2, l3] }, c3 + carry)
    }

    /// Shift left por 1 bit
    pub const fn shl1(&self) -> Self {
        Self {
            limbs: [
                self.limbs[0] << 1,
                (self.limbs[1] << 1) | (self.limbs[0] >> 63),
                (self.limbs[2] << 1) | (self.limbs[1] >> 63),
                (self.limbs[3] << 1) | (self.limbs[2] >> 63),
            ],
        }
    }

    /// Shift right por 1 bit
    pub const fn shr1(&self) -> Self {
        Self {
            limbs: [
                (self.limbs[0] >> 1) | (self.limbs[1] << 63),
                (self.limbs[1] >> 1) | (self.limbs[2] << 63),
                (self.limbs[2] >> 1) | (self.limbs[3] << 63),
                self.limbs[3] >> 1,
            ],
        }
    }

    /// Shift left por n bits (n < 256)
    pub fn shl(&self, n: usize) -> Self {
        if n == 0 {
            return *self;
        }
        if n >= 256 {
            return Self::ZERO;
        }

        let limb_shift = n / 64;
        let bit_shift = n % 64;

        if bit_shift == 0 {
            // Apenas shift de limbs
            let mut limbs = [0u64; 4];
            for i in limb_shift..4 {
                limbs[i] = self.limbs[i - limb_shift];
            }
            return Self { limbs };
        }

        let mut limbs = [0u64; 4];
        for i in limb_shift..4 {
            let src_idx = i - limb_shift;
            limbs[i] = self.limbs[src_idx] << bit_shift;
            if src_idx > 0 {
                limbs[i] |= self.limbs[src_idx - 1] >> (64 - bit_shift);
            }
        }

        Self { limbs }
    }

    /// Shift right por n bits (n < 256)
    pub fn shr(&self, n: usize) -> Self {
        if n == 0 {
            return *self;
        }
        if n >= 256 {
            return Self::ZERO;
        }

        let limb_shift = n / 64;
        let bit_shift = n % 64;

        if bit_shift == 0 {
            // Apenas shift de limbs
            let mut limbs = [0u64; 4];
            for i in 0..(4 - limb_shift) {
                limbs[i] = self.limbs[i + limb_shift];
            }
            return Self { limbs };
        }

        let mut limbs = [0u64; 4];
        for i in 0..(4 - limb_shift) {
            let src_idx = i + limb_shift;
            limbs[i] = self.limbs[src_idx] >> bit_shift;
            if src_idx < 3 {
                limbs[i] |= self.limbs[src_idx + 1] << (64 - bit_shift);
            }
        }

        Self { limbs }
    }

    /// Conta leading zeros
    pub const fn leading_zeros(&self) -> u32 {
        if self.limbs[3] != 0 {
            self.limbs[3].leading_zeros()
        } else if self.limbs[2] != 0 {
            64 + self.limbs[2].leading_zeros()
        } else if self.limbs[1] != 0 {
            128 + self.limbs[1].leading_zeros()
        } else {
            192 + self.limbs[0].leading_zeros()
        }
    }

    /// Multiplicação completa: retorna (low, high)
    pub fn mul_wide(&self, rhs: &Self) -> (Self, Self) {
        let mut low = [0u64; 4];
        let mut high = [0u64; 4];

        for i in 0..4 {
            let mut carry = 0u64;
            for j in 0..4 {
                let k = i + j;

                let (prod_low, prod_high) = mul_wide(self.limbs[i], rhs.limbs[j]);

                if k < 4 {
                    let (sum, c1) = adc(low[k], prod_low, carry);
                    low[k] = sum;
                    let (sum2, c2) = adc(high[k.min(3)], prod_high, c1);
                    if k < 4 {
                        high[k] = sum2;
                    }
                    carry = c2;
                } else {
                    let k_high = k - 4;
                    if k_high < 4 {
                        let (sum, c1) = adc(high[k_high], prod_low, carry);
                        high[k_high] = sum;
                        carry = prod_high + c1;
                    }
                }
            }
        }

        (Self { limbs: low }, Self { limbs: high })
    }
}

impl core::ops::BitOr for U256 {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self {
        Self {
            limbs: [
                self.limbs[0] | rhs.limbs[0],
                self.limbs[1] | rhs.limbs[1],
                self.limbs[2] | rhs.limbs[2],
                self.limbs[3] | rhs.limbs[3],
            ],
        }
    }
}

impl PartialOrd for U256 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for U256 {
    fn cmp(&self, other: &Self) -> Ordering {
        for i in (0..4).rev() {
            match self.limbs[i].cmp(&other.limbs[i]) {
                Ordering::Equal => continue,
                other => return other,
            }
        }
        Ordering::Equal
    }
}

impl fmt::Debug for U256 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "U256(0x")?;
        for &limb in self.limbs.iter().rev() {
            write!(f, "{:016x}", limb)?;
        }
        write!(f, ")")
    }
}

impl fmt::Display for U256 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
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
    }

    #[test]
    fn test_add() {
        let a = U256::from_u64(42);
        let b = U256::from_u64(58);
        let c = a.wrapping_add(&b);
        assert_eq!(c, U256::from_u64(100));
    }

    #[test]
    fn test_sub() {
        let a = U256::from_u64(100);
        let b = U256::from_u64(42);
        let c = a.wrapping_sub(&b);
        assert_eq!(c, U256::from_u64(58));
    }
}
