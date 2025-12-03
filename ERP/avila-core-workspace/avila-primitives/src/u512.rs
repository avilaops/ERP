//! Inteiro de 512 bits sem sinal

use avila_nucleus::bits::{adc, sbb};
use core::cmp::Ordering;
use core::fmt;

/// Inteiro de 512 bits (8 limbs de u64)
#[repr(C, align(64))]
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct U512 {
    pub limbs: [u64; 8],
}

impl U512 {
    pub const LIMBS: usize = 8;
    pub const BITS: usize = 512;
    pub const BYTES: usize = 64;

    pub const ZERO: Self = Self { limbs: [0; 8] };
    pub const ONE: Self = Self { limbs: [1, 0, 0, 0, 0, 0, 0, 0] };

    #[inline(always)]
    pub const fn from_u64(value: u64) -> Self {
        Self { limbs: [value, 0, 0, 0, 0, 0, 0, 0] }
    }

    pub const fn is_zero(&self) -> bool {
        (self.limbs[0] | self.limbs[1] | self.limbs[2] | self.limbs[3] |
         self.limbs[4] | self.limbs[5] | self.limbs[6] | self.limbs[7]) == 0
    }

    pub const fn wrapping_add(&self, rhs: &Self) -> Self {
        let (l0, c0) = adc(self.limbs[0], rhs.limbs[0], 0);
        let (l1, c1) = adc(self.limbs[1], rhs.limbs[1], c0);
        let (l2, c2) = adc(self.limbs[2], rhs.limbs[2], c1);
        let (l3, c3) = adc(self.limbs[3], rhs.limbs[3], c2);
        let (l4, c4) = adc(self.limbs[4], rhs.limbs[4], c3);
        let (l5, c5) = adc(self.limbs[5], rhs.limbs[5], c4);
        let (l6, c6) = adc(self.limbs[6], rhs.limbs[6], c5);
        let (l7, _) = adc(self.limbs[7], rhs.limbs[7], c6);
        Self { limbs: [l0, l1, l2, l3, l4, l5, l6, l7] }
    }
}

impl PartialOrd for U512 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for U512 {
    fn cmp(&self, other: &Self) -> Ordering {
        for i in (0..8).rev() {
            match self.limbs[i].cmp(&other.limbs[i]) {
                Ordering::Equal => continue,
                other => return other,
            }
        }
        Ordering::Equal
    }
}

impl fmt::Debug for U512 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "U512(...)")
    }
}
