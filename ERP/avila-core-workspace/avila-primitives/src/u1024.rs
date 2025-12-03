//! Inteiro de 1024 bits sem sinal

use core::cmp::Ordering;
use core::fmt;

/// Inteiro de 1024 bits (16 limbs de u64)
#[repr(C, align(64))]
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct U1024 {
    pub limbs: [u64; 16],
}

impl U1024 {
    pub const LIMBS: usize = 16;
    pub const BITS: usize = 1024;
    pub const BYTES: usize = 128;

    pub const ZERO: Self = Self { limbs: [0; 16] };
    pub const ONE: Self = Self {
        limbs: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    };
}

impl Ord for U1024 {
    fn cmp(&self, other: &Self) -> Ordering {
        for i in (0..16).rev() {
            match self.limbs[i].cmp(&other.limbs[i]) {
                Ordering::Equal => continue,
                other => return other,
            }
        }
        Ordering::Equal
    }
}

impl PartialOrd for U1024 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Debug for U1024 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "U1024(...)")
    }
}
