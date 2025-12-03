use core::cmp::Ordering;
use core::fmt;
use core::ops::{Add, AddAssign, BitAnd, BitAndAssign, BitOr, BitOrAssign, BitXor, BitXorAssign, Not, Shl, ShlAssign, Shr, ShrAssign, Sub, SubAssign};

use avila_nucleus::bits::{adc, sbb, set_bit as set_bit64, test_bit as test_bit64};

use crate::u512::U512;

/// Inteiro sem sinal de 256 bits armazenado em 4 * 64 bits na ordem little-endian.
#[derive(Clone, Copy, Default, PartialEq, Eq, Hash)]
pub struct U256 {
    limbs: [u64; 4],
}

impl U256 {
    /// Cria um valor com todos os bits zerados.
    #[inline]
    pub const fn zero() -> Self {
        Self { limbs: [0; 4] }
    }

    /// Cria o valor unitário (1).
    #[inline]
    pub const fn one() -> Self {
        Self {
            limbs: [1, 0, 0, 0],
        }
    }

    /// Constrói a partir de uma fatia de limbs.
    #[inline]
    pub const fn from_limbs(limbs: [u64; 4]) -> Self {
        Self { limbs }
    }

    /// Retorna os limbs internos.
    #[inline]
    pub const fn into_limbs(self) -> [u64; 4] {
        self.limbs
    }

    /// Referência aos limbs.
    #[inline]
    pub const fn limbs(&self) -> &[u64; 4] {
        &self.limbs
    }

    /// Valor zero?
    #[inline]
    pub const fn is_zero(&self) -> bool {
        self.limbs[0] == 0 && self.limbs[1] == 0 && self.limbs[2] == 0 && self.limbs[3] == 0
    }

    /// Maior que zero?
    #[inline]
    pub const fn is_one(&self) -> bool {
        self.limbs[0] == 1 && self.limbs[1] == 0 && self.limbs[2] == 0 && self.limbs[3] == 0
    }

    /// Retorna verdadeiro se o valor for par.
    #[inline]
    pub const fn is_even(&self) -> bool {
        self.limbs[0] & 1 == 0
    }

    /// Cria a partir de um valor `u64`.
    #[inline]
    pub const fn from_u64(value: u64) -> Self {
        Self {
            limbs: [value, 0, 0, 0],
        }
    }

    /// Converte para `u64`, retornando erro se não couber.
    #[inline]
    pub const fn try_to_u64(&self) -> Result<u64, ()> {
        if self.limbs[1] | self.limbs[2] | self.limbs[3] == 0 {
            Ok(self.limbs[0])
        } else {
            Err(())
        }
    }

    /// Número de zeros à esquerda.
    #[inline]
    pub fn leading_zeros(&self) -> u32 {
        for i in (0..4).rev() {
            let limb = self.limbs[i];
            if limb != 0 {
                let higher_words = (3 - i) as u32 * 64;
                return higher_words + limb.leading_zeros();
            }
        }
        256
    }

    /// Comprimento efetivo em bits.
    #[inline]
    pub fn bit_length(&self) -> u32 {
        256 - self.leading_zeros()
    }

    /// Lê um bit específico.
    #[inline]
    pub fn bit(&self, index: u32) -> bool {
        if index >= 256 {
            return false;
        }
        let limb = (index / 64) as usize;
        let bit = index % 64;
        test_bit64(self.limbs[limb], bit)
    }

    /// Define um bit específico e retorna o novo valor.
    #[inline]
    pub fn with_bit_set(mut self, index: u32) -> Self {
        if index < 256 {
            let limb = (index / 64) as usize;
            let bit = index % 64;
            self.limbs[limb] = set_bit64(self.limbs[limb], bit);
        }
        self
    }

    /// Soma com flag de carry.
    #[inline]
    pub fn overflowing_add(self, rhs: Self) -> (Self, bool) {
        let (r0, c0) = adc(self.limbs[0], rhs.limbs[0], 0);
        let (r1, c1) = adc(self.limbs[1], rhs.limbs[1], c0);
        let (r2, c2) = adc(self.limbs[2], rhs.limbs[2], c1);
        let (r3, c3) = adc(self.limbs[3], rhs.limbs[3], c2);
        (
            Self {
                limbs: [r0, r1, r2, r3],
            },
            c3 != 0,
        )
    }

    /// Subtração com flag de borrow.
    #[inline]
    pub fn overflowing_sub(self, rhs: Self) -> (Self, bool) {
        let (r0, b0) = sbb(self.limbs[0], rhs.limbs[0], 0);
        let (r1, b1) = sbb(self.limbs[1], rhs.limbs[1], b0);
        let (r2, b2) = sbb(self.limbs[2], rhs.limbs[2], b1);
        let (r3, b3) = sbb(self.limbs[3], rhs.limbs[3], b2);
        (
            Self {
                limbs: [r0, r1, r2, r3],
            },
            b3 != 0,
        )
    }

    /// Soma modular 2^256.
    #[inline]
    pub fn wrapping_add(self, rhs: Self) -> Self {
        self.overflowing_add(rhs).0
    }

    /// Subtração modular 2^256.
    #[inline]
    pub fn wrapping_sub(self, rhs: Self) -> Self {
        self.overflowing_sub(rhs).0
    }

    /// Multiplicação completa (resultado de 512 bits).
    #[inline]
    pub fn wide_mul(self, rhs: Self) -> U512 {
        let mut acc = [0u128; 8];
        for i in 0..4 {
            for j in 0..4 {
                acc[i + j] += (self.limbs[i] as u128) * (rhs.limbs[j] as u128);
            }
        }

        let mut out = [0u64; 8];
        let mut carry = 0u128;
        for i in 0..8 {
            let total = acc[i] + carry;
            out[i] = total as u64;
            carry = total >> 64;
        }

        U512::from_limbs(out)
    }

    /// Multiplicação com descarte da metade superior.
    #[inline]
    pub fn wrapping_mul(self, rhs: Self) -> Self {
        self.wide_mul(rhs).low()
    }

    /// Deslocamento lógico à esquerda.
    #[inline]
    pub fn wrapping_shl(self, shift: u32) -> Self {
        if shift == 0 {
            return self;
        }
        if shift >= 256 {
            return Self::zero();
        }
        let word_shift = (shift / 64) as usize;
        let bit_shift = shift % 64;
        let mut limbs = [0u64; 4];

        if bit_shift == 0 {
            for i in (word_shift..4).rev() {
                limbs[i] = self.limbs[i - word_shift];
            }
        } else {
            for i in (word_shift..4).rev() {
                let lower = self.limbs[i - word_shift] << bit_shift;
                let mut upper = 0u64;
                if i > word_shift {
                    upper = self.limbs[i - word_shift - 1] >> (64 - bit_shift);
                }
                limbs[i] = lower | upper;
            }
        }

        Self { limbs }
    }

    /// Deslocamento lógico à direita.
    #[inline]
    pub fn wrapping_shr(self, shift: u32) -> Self {
        if shift == 0 {
            return self;
        }
        if shift >= 256 {
            return Self::zero();
        }
        let word_shift = (shift / 64) as usize;
        let bit_shift = shift % 64;
        let mut limbs = [0u64; 4];

        if bit_shift == 0 {
            for i in 0..(4 - word_shift) {
                limbs[i] = self.limbs[i + word_shift];
            }
        } else {
            for i in 0..(4 - word_shift) {
                let higher = self.limbs[i + word_shift] >> bit_shift;
                let mut lower = 0u64;
                if i + word_shift + 1 < 4 {
                    lower = self.limbs[i + word_shift + 1] << (64 - bit_shift);
                }
                limbs[i] = higher | lower;
            }
        }

        Self { limbs }
    }

    /// Serializa em big-endian.
    #[inline]
    pub fn to_be_bytes(self) -> [u8; 32] {
        let mut out = [0u8; 32];
        for (i, limb) in self.limbs.iter().rev().enumerate() {
            let bytes = limb.to_be_bytes();
            out[i * 8..(i + 1) * 8].copy_from_slice(&bytes);
        }
        out
    }

    /// Serializa em little-endian.
    #[inline]
    pub fn to_le_bytes(self) -> [u8; 32] {
        let mut out = [0u8; 32];
        for (i, limb) in self.limbs.iter().enumerate() {
            let bytes = limb.to_le_bytes();
            out[i * 8..(i + 1) * 8].copy_from_slice(&bytes);
        }
        out
    }

    /// Constrói a partir de bytes big-endian.
    #[inline]
    pub fn from_be_bytes(bytes: [u8; 32]) -> Self {
        let mut limbs = [0u64; 4];
        for i in 0..4 {
            let start = i * 8;
            let mut chunk = [0u8; 8];
            chunk.copy_from_slice(&bytes[start..start + 8]);
            limbs[3 - i] = u64::from_be_bytes(chunk);
        }
        Self { limbs }
    }

    /// Constrói a partir de bytes little-endian.
    #[inline]
    pub fn from_le_bytes(bytes: [u8; 32]) -> Self {
        let mut limbs = [0u64; 4];
        for i in 0..4 {
            let start = i * 8;
            let mut chunk = [0u8; 8];
            chunk.copy_from_slice(&bytes[start..start + 8]);
            limbs[i] = u64::from_le_bytes(chunk);
        }
        Self { limbs }
    }
}

impl From<u64> for U256 {
    #[inline]
    fn from(value: u64) -> Self {
        Self::from_u64(value)
    }
}

impl From<u128> for U256 {
    #[inline]
    fn from(value: u128) -> Self {
        let low = value as u64;
        let high = (value >> 64) as u64;
        Self {
            limbs: [low, high, 0, 0],
        }
    }
}

impl From<U256> for [u8; 32] {
    #[inline]
    fn from(value: U256) -> Self {
        value.to_be_bytes()
    }
}

impl Ord for U256 {
    fn cmp(&self, other: &Self) -> Ordering {
        for i in (0..4).rev() {
            match self.limbs[i].cmp(&other.limbs[i]) {
                Ordering::Equal => continue,
                ord => return ord,
            }
        }
        Ordering::Equal
    }
}

impl PartialOrd for U256 {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Debug for U256 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "0x")?;
        for limb in self.limbs.iter().rev() {
            write!(f, "{:016x}", limb)?;
        }
        Ok(())
    }
}

impl Add for U256 {
    type Output = Self;

    #[inline]
    fn add(self, rhs: Self) -> Self::Output {
        self.wrapping_add(rhs)
    }
}

impl AddAssign for U256 {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        *self = self.wrapping_add(rhs);
    }
}

impl Sub for U256 {
    type Output = Self;

    #[inline]
    fn sub(self, rhs: Self) -> Self::Output {
        self.wrapping_sub(rhs)
    }
}

impl SubAssign for U256 {
    #[inline]
    fn sub_assign(&mut self, rhs: Self) {
        *self = self.wrapping_sub(rhs);
    }
}

impl BitAnd for U256 {
    type Output = Self;

    #[inline]
    fn bitand(self, rhs: Self) -> Self::Output {
        let mut limbs = [0u64; 4];
        for i in 0..4 {
            limbs[i] = self.limbs[i] & rhs.limbs[i];
        }
        Self { limbs }
    }
}

impl BitAndAssign for U256 {
    #[inline]
    fn bitand_assign(&mut self, rhs: Self) {
        for i in 0..4 {
            self.limbs[i] &= rhs.limbs[i];
        }
    }
}

impl BitOr for U256 {
    type Output = Self;

    #[inline]
    fn bitor(self, rhs: Self) -> Self::Output {
        let mut limbs = [0u64; 4];
        for i in 0..4 {
            limbs[i] = self.limbs[i] | rhs.limbs[i];
        }
        Self { limbs }
    }
}

impl BitOrAssign for U256 {
    #[inline]
    fn bitor_assign(&mut self, rhs: Self) {
        for i in 0..4 {
            self.limbs[i] |= rhs.limbs[i];
        }
    }
}

impl BitXor for U256 {
    type Output = Self;

    #[inline]
    fn bitxor(self, rhs: Self) -> Self::Output {
        let mut limbs = [0u64; 4];
        for i in 0..4 {
            limbs[i] = self.limbs[i] ^ rhs.limbs[i];
        }
        Self { limbs }
    }
}

impl BitXorAssign for U256 {
    #[inline]
    fn bitxor_assign(&mut self, rhs: Self) {
        for i in 0..4 {
            self.limbs[i] ^= rhs.limbs[i];
        }
    }
}

impl Not for U256 {
    type Output = Self;

    #[inline]
    fn not(self) -> Self::Output {
        let mut limbs = [0u64; 4];
        for i in 0..4 {
            limbs[i] = !self.limbs[i];
        }
        Self { limbs }
    }
}

impl Shl<u32> for U256 {
    type Output = Self;

    #[inline]
    fn shl(self, rhs: u32) -> Self::Output {
        self.wrapping_shl(rhs)
    }
}

impl ShlAssign<u32> for U256 {
    #[inline]
    fn shl_assign(&mut self, rhs: u32) {
        *self = self.wrapping_shl(rhs);
    }
}

impl Shr<u32> for U256 {
    type Output = Self;

    #[inline]
    fn shr(self, rhs: u32) -> Self::Output {
        self.wrapping_shr(rhs)
    }
}

impl ShrAssign<u32> for U256 {
    #[inline]
    fn shr_assign(&mut self, rhs: u32) {
        *self = self.wrapping_shr(rhs);
    }
}

#[cfg(test)]
mod tests {
    use super::U256;

    #[test]
    fn zero_and_one() {
        assert!(U256::zero().is_zero());
        assert!(U256::one().is_one());
    }

    #[test]
    fn addition_with_carry() {
        let a = U256::from_limbs([u64::MAX, u64::MAX, u64::MAX, u64::MAX]);
        let b = U256::one();
        let (sum, carry) = a.overflowing_add(b);
        assert!(sum.is_zero());
        assert!(carry);
    }

    #[test]
    fn subtraction_with_borrow() {
        let a = U256::zero();
        let b = U256::one();
        let (diff, borrow) = a.overflowing_sub(b);
        assert!(borrow);
        assert_eq!(diff, U256::from_limbs([u64::MAX, u64::MAX, u64::MAX, u64::MAX]));
    }

    #[test]
    fn bit_operations() {
        let value = U256::one().with_bit_set(129);
        assert!(value.bit(0));
        assert!(value.bit(129));
        assert!(!value.bit(255));
        assert_eq!(value.leading_zeros(), 256 - 130);
    }

    #[test]
    fn shifts_behave() {
        let value = U256::from_u64(1);
        let shifted = value << 65;
        assert!(shifted.bit(65));
        assert!(!shifted.bit(64));

        let back = shifted >> 65;
        assert_eq!(back, value);
    }

    #[test]
    fn wide_multiplication() {
        let a = U256::from_u64(0x1_0000_0000);
        let b = U256::from_u64(0xFFFF_FFFF);
        let wide = a.wide_mul(b);
        let expected = U256::from((0x1_0000_0000u128) * (0xFFFF_FFFFu128));
        assert_eq!(wide.low(), expected);
        assert!(wide.high().is_zero());
    }

    #[test]
    fn bytes_roundtrip() {
        let original = U256::from_limbs([
            0x0123_4567_89AB_CDEF,
            0x0FED_CBA9_8765_4321,
            0x1111_2222_3333_4444,
            0x5555_6666_7777_8888,
        ]);
        let be = original.to_be_bytes();
        let le = original.to_le_bytes();
        assert_eq!(U256::from_be_bytes(be), original);
        assert_eq!(U256::from_le_bytes(le), original);
    }
}
