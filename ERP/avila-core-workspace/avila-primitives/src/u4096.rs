//! Inteiro de 4096 bits sem sinal (RSA-4096)

use core::cmp::Ordering;
use core::fmt;

/// Inteiro de 4096 bits (64 limbs de u64)
#[repr(C, align(64))]
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct U4096 {
    pub limbs: [u64; 64],
}

impl U4096 {
    pub const LIMBS: usize = 64;
    pub const BITS: usize = 4096;
    pub const BYTES: usize = 512;

    pub const ZERO: Self = Self { limbs: [0; 64] };
}

impl Ord for U4096 {
    fn cmp(&self, other: &Self) -> Ordering {
        for i in (0..64).rev() {
            match self.limbs[i].cmp(&other.limbs[i]) {
                Ordering::Equal => continue,
                other => return other,
            }
        }
        Ordering::Equal
    }
}

impl PartialOrd for U4096 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Debug for U4096 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "U4096(...)")
    }
}
