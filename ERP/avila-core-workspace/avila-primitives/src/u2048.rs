//! Inteiro de 2048 bits sem sinal (RSA-2048)

use core::cmp::Ordering;
use core::fmt;

/// Inteiro de 2048 bits (32 limbs de u64)
#[repr(C, align(64))]
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct U2048 {
    pub limbs: [u64; 32],
}

impl U2048 {
    pub const LIMBS: usize = 32;
    pub const BITS: usize = 2048;
    pub const BYTES: usize = 256;

    pub const ZERO: Self = Self { limbs: [0; 32] };
    pub const ONE: Self = Self {
        limbs: [
            1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
    };

    pub fn from_bytes_be(bytes: &[u8; 256]) -> Self {
        let mut limbs = [0u64; 32];
        for i in 0..32 {
            let offset = i * 8;
            limbs[31 - i] = u64::from_be_bytes([
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

    pub fn to_bytes_be(&self) -> [u8; 256] {
        let mut bytes = [0u8; 256];
        for i in 0..32 {
            let limb_bytes = self.limbs[31 - i].to_be_bytes();
            let offset = i * 8;
            bytes[offset..offset + 8].copy_from_slice(&limb_bytes);
        }
        bytes
    }
}

impl Ord for U2048 {
    fn cmp(&self, other: &Self) -> Ordering {
        for i in (0..32).rev() {
            match self.limbs[i].cmp(&other.limbs[i]) {
                Ordering::Equal => continue,
                other => return other,
            }
        }
        Ordering::Equal
    }
}

impl PartialOrd for U2048 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Debug for U2048 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "U2048(...)")
    }
}
