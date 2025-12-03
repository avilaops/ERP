//! Inteiro de 2048 bits unsigned (RSA-2048)

use avila_nucleus::{adc, sbb};

/// Inteiro de 2048 bits (32 limbs de 64 bits)
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(align(64))]
pub struct U2048 {
    pub limbs: [u64; 32],
}

impl U2048 {
    pub const LIMBS: usize = 32;
    pub const BITS: usize = 2048;
    pub const BYTES: usize = 256;

    pub const ZERO: Self = Self { limbs: [0; 32] };
    pub const ONE: Self = {
        let mut limbs = [0; 32];
        limbs[0] = 1;
        Self { limbs }
    };

    pub const fn from_u64(value: u64) -> Self {
        let mut limbs = [0; 32];
        limbs[0] = value;
        Self { limbs }
    }

    pub const fn is_zero(&self) -> bool {
        let mut i = 0;
        while i < 32 {
            if self.limbs[i] != 0 {
                return false;
            }
            i += 1;
        }
        true
    }

    pub const fn is_odd(&self) -> bool {
        (self.limbs[0] & 1) == 1
    }

    pub fn from_bytes_be(bytes: &[u8]) -> Self {
        assert!(bytes.len() <= 256, "Bytes excedem 2048 bits");
        let mut limbs = [0u64; 32];
        let mut padded = [0u8; 256];
        padded[256 - bytes.len()..].copy_from_slice(bytes);

        for (i, chunk) in padded.chunks_exact(8).enumerate() {
            limbs[31 - i] = u64::from_be_bytes(chunk.try_into().unwrap());
        }

        Self { limbs }
    }

    pub fn to_bytes_be(&self) -> [u8; 256] {
        let mut bytes = [0u8; 256];
        for (i, &limb) in self.limbs.iter().rev().enumerate() {
            bytes[i * 8..(i + 1) * 8].copy_from_slice(&limb.to_be_bytes());
        }
        bytes
    }

    /// Adição com detecção de carry
    pub const fn wrapping_add(&self, rhs: &Self) -> Self {
        let mut result = Self::ZERO;
        let mut carry = 0;

        let mut i = 0;
        while i < 32 {
            let (sum, c) = adc(self.limbs[i], rhs.limbs[i], carry);
            result.limbs[i] = sum;
            carry = c;
            i += 1;
        }

        result
    }

    /// Subtração com detecção de borrow
    pub const fn wrapping_sub(&self, rhs: &Self) -> Self {
        let mut result = Self::ZERO;
        let mut borrow = 0;

        let mut i = 0;
        while i < 32 {
            let (diff, b) = sbb(self.limbs[i], rhs.limbs[i], borrow);
            result.limbs[i] = diff;
            borrow = b;
            i += 1;
        }

        result
    }

    /// Comparação
    pub const fn cmp(&self, rhs: &Self) -> i8 {
        let mut i = 31;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero_one() {
        assert!(U2048::ZERO.is_zero());
        assert!(!U2048::ONE.is_zero());
        assert!(U2048::ONE.is_odd());
    }

    #[test]
    fn test_addition() {
        let a = U2048::from_u64(100);
        let b = U2048::from_u64(200);
        let c = a.wrapping_add(&b);
        assert_eq!(c.limbs[0], 300);
    }
}
