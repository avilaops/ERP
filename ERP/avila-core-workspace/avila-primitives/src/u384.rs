//! Inteiro de 384 bits sem sinal (P-384 curve)

use avila_nucleus::bits::{adc, sbb};
use core::cmp::Ordering;
use core::fmt;

/// Inteiro de 384 bits (6 limbs de u64)
#[repr(C, align(64))]
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct U384 {
    pub limbs: [u64; 6],
}

impl U384 {
    pub const LIMBS: usize = 6;
    pub const BITS: usize = 384;
    pub const BYTES: usize = 48;

    pub const ZERO: Self = Self { limbs: [0; 6] };
    pub const ONE: Self = Self { limbs: [1, 0, 0, 0, 0, 0] };
    pub const MAX: Self = Self { limbs: [u64::MAX; 6] };

    #[inline(always)]
    pub const fn from_u64(value: u64) -> Self {
        Self { limbs: [value, 0, 0, 0, 0, 0] }
    }

    pub const fn is_zero(&self) -> bool {
        (self.limbs[0] | self.limbs[1] | self.limbs[2] |
         self.limbs[3] | self.limbs[4] | self.limbs[5]) == 0
    }

    pub const fn wrapping_add(&self, rhs: &Self) -> Self {
        let (l0, c0) = adc(self.limbs[0], rhs.limbs[0], 0);
        let (l1, c1) = adc(self.limbs[1], rhs.limbs[1], c0);
        let (l2, c2) = adc(self.limbs[2], rhs.limbs[2], c1);
        let (l3, c3) = adc(self.limbs[3], rhs.limbs[3], c2);
        let (l4, c4) = adc(self.limbs[4], rhs.limbs[4], c3);
        let (l5, _) = adc(self.limbs[5], rhs.limbs[5], c4);
        Self { limbs: [l0, l1, l2, l3, l4, l5] }
    }

    pub const fn wrapping_sub(&self, rhs: &Self) -> Self {
        let (l0, b0) = sbb(self.limbs[0], rhs.limbs[0], 0);
        let (l1, b1) = sbb(self.limbs[1], rhs.limbs[1], b0);
        let (l2, b2) = sbb(self.limbs[2], rhs.limbs[2], b1);
        let (l3, b3) = sbb(self.limbs[3], rhs.limbs[3], b2);
        let (l4, b4) = sbb(self.limbs[4], rhs.limbs[4], b3);
        let (l5, _) = sbb(self.limbs[5], rhs.limbs[5], b4);
        Self { limbs: [l0, l1, l2, l3, l4, l5] }
    }
}

impl PartialOrd for U384 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for U384 {
    fn cmp(&self, other: &Self) -> Ordering {
        for i in (0..6).rev() {
            match self.limbs[i].cmp(&other.limbs[i]) {
                Ordering::Equal => continue,
                other => return other,
            }
        }
        Ordering::Equal
    }
}

impl fmt::Debug for U384 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "U384(0x")?;
        for &limb in self.limbs.iter().rev() {
            write!(f, "{:016x}", limb)?;
        }
        write!(f, ")")
    }
}
