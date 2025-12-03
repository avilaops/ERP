use core::cmp::Ordering;
use core::fmt;

use avila_nucleus::bits::{adc, sbb};

use crate::u256::U256;

/// Inteiro sem sinal de 512 bits em formato little-endian (8 * 64 bits).
#[derive(Clone, Copy, Default, PartialEq, Eq, Hash)]
pub struct U512 {
    limbs: [u64; 8],
}

impl U512 {
    /// Valor zero.
    #[inline]
    pub const fn zero() -> Self {
        Self { limbs: [0; 8] }
    }

    /// Constrói a partir de limbs little-endian.
    #[inline]
    pub const fn from_limbs(limbs: [u64; 8]) -> Self {
        Self { limbs }
    }

    /// Consome a estrutura retornando os limbs.
    #[inline]
    pub const fn into_limbs(self) -> [u64; 8] {
        self.limbs
    }

    /// Referência aos limbs.
    #[inline]
    pub const fn limbs(&self) -> &[u64; 8] {
        &self.limbs
    }

    /// Resultado mínimo (LSB) em 256 bits.
    #[inline]
    pub const fn low(&self) -> U256 {
        U256::from_limbs([self.limbs[0], self.limbs[1], self.limbs[2], self.limbs[3]])
    }

    /// Resultado máximo (MSB) em 256 bits.
    #[inline]
    pub const fn high(&self) -> U256 {
        U256::from_limbs([self.limbs[4], self.limbs[5], self.limbs[6], self.limbs[7]])
    }

    /// Verifica se é zero.
    #[inline]
    pub fn is_zero(&self) -> bool {
        self.limbs.iter().all(|&x| x == 0)
    }

    /// Soma com carry.
    #[inline]
    pub fn overflowing_add(self, rhs: Self) -> (Self, bool) {
        let mut out = [0u64; 8];
        let mut carry = 0u64;
        for i in 0..8 {
            let (sum, c) = adc(self.limbs[i], rhs.limbs[i], carry);
            out[i] = sum;
            carry = c;
        }
        (Self { limbs: out }, carry != 0)
    }

    /// Subtração com borrow.
    #[inline]
    pub fn overflowing_sub(self, rhs: Self) -> (Self, bool) {
        let mut out = [0u64; 8];
        let mut borrow = 0u64;
        for i in 0..8 {
            let (diff, b) = sbb(self.limbs[i], rhs.limbs[i], borrow);
            out[i] = diff;
            borrow = b;
        }
        (Self { limbs: out }, borrow != 0)
    }

    /// Serializa em big-endian.
    #[inline]
    pub fn to_be_bytes(self) -> [u8; 64] {
        let mut out = [0u8; 64];
        for (i, limb) in self.limbs.iter().rev().enumerate() {
            let bytes = limb.to_be_bytes();
            out[i * 8..(i + 1) * 8].copy_from_slice(&bytes);
        }
        out
    }

    /// Serializa em little-endian.
    #[inline]
    pub fn to_le_bytes(self) -> [u8; 64] {
        let mut out = [0u8; 64];
        for (i, limb) in self.limbs.iter().enumerate() {
            let bytes = limb.to_le_bytes();
            out[i * 8..(i + 1) * 8].copy_from_slice(&bytes);
        }
        out
    }

    /// Constrói a partir de bytes big-endian.
    #[inline]
    pub fn from_be_bytes(bytes: [u8; 64]) -> Self {
        let mut limbs = [0u64; 8];
        for i in 0..8 {
            let start = i * 8;
            let mut chunk = [0u8; 8];
            chunk.copy_from_slice(&bytes[start..start + 8]);
            limbs[7 - i] = u64::from_be_bytes(chunk);
        }
        Self { limbs }
    }

    /// Constrói a partir de bytes little-endian.
    #[inline]
    pub fn from_le_bytes(bytes: [u8; 64]) -> Self {
        let mut limbs = [0u64; 8];
        for i in 0..8 {
            let start = i * 8;
            let mut chunk = [0u8; 8];
            chunk.copy_from_slice(&bytes[start..start + 8]);
            limbs[i] = u64::from_le_bytes(chunk);
        }
        Self { limbs }
    }
}

impl Ord for U512 {
    fn cmp(&self, other: &Self) -> Ordering {
        for i in (0..8).rev() {
            match self.limbs[i].cmp(&other.limbs[i]) {
                Ordering::Equal => continue,
                ord => return ord,
            }
        }
        Ordering::Equal
    }
}

impl PartialOrd for U512 {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Debug for U512 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "0x")?;
        for limb in self.limbs.iter().rev() {
            write!(f, "{:016x}", limb)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::U512;
    use crate::U256;

    #[test]
    fn zero_and_high_low() {
        let wide = U512::zero();
        assert!(wide.is_zero());
        assert_eq!(wide.low(), U256::zero());
        assert_eq!(wide.high(), U256::zero());
    }

    #[test]
    fn bytes_roundtrip() {
        let original = U512::from_limbs([
            0x0123_4567_89AB_CDEF,
            0x0FED_CBA9_8765_4321,
            0x1111_2222_3333_4444,
            0x5555_6666_7777_8888,
            0x9999_AAAA_BBBB_CCCC,
            0xDDDD_EEEE_FFFF_0000,
            0x2222_3333_4444_5555,
            0x6666_7777_8888_9999,
        ]);
        let be = original.to_be_bytes();
        let le = original.to_le_bytes();
        assert_eq!(U512::from_be_bytes(be), original);
        assert_eq!(U512::from_le_bytes(le), original);
    }

    #[test]
    fn addition_and_subtraction() {
        let a = U512::from_limbs([1, 0, 0, 0, 0, 0, 0, 0]);
        let b = U512::from_limbs([u64::MAX, 0, 0, 0, 0, 0, 0, 0]);
        let (sum, carry) = a.overflowing_add(b);
        assert_eq!(sum.limbs()[0], 0);
        assert_eq!(sum.limbs()[1], 1);
        assert!(!carry);

        let (diff, borrow) = sum.overflowing_sub(a);
        assert!(!borrow);
        assert_eq!(diff, b);
    }
}
