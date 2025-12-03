//! Inteiro de 512 bits unsigned

use avila_nucleus::{adc, sbb};

/// Inteiro de 512 bits (8 limbs de 64 bits)
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(align(64))]
pub struct U512 {
    pub limbs: [u64; 8],
}

impl U512 {
    pub const LIMBS: usize = 8;
    pub const BITS: usize = 512;
    pub const BYTES: usize = 64;

    pub const ZERO: Self = Self { limbs: [0; 8] };
    pub const ONE: Self = Self { limbs: [1, 0, 0, 0, 0, 0, 0, 0] };
    pub const MAX: Self = Self { limbs: [u64::MAX; 8] };

    pub const fn from_u64(value: u64) -> Self {
        Self { limbs: [value, 0, 0, 0, 0, 0, 0, 0] }
    }

    pub const fn is_zero(&self) -> bool {
        self.limbs[0] == 0 && self.limbs[1] == 0 && self.limbs[2] == 0 && self.limbs[3] == 0
            && self.limbs[4] == 0 && self.limbs[5] == 0 && self.limbs[6] == 0 && self.limbs[7] == 0
    }

    pub fn from_bytes_be(bytes: &[u8]) -> Self {
        assert!(bytes.len() <= 64);
        let mut limbs = [0u64; 8];
        let mut padded = [0u8; 64];
        padded[64 - bytes.len()..].copy_from_slice(bytes);

        for (i, chunk) in padded.chunks_exact(8).enumerate() {
            limbs[7 - i] = u64::from_be_bytes(chunk.try_into().unwrap());
        }

        Self { limbs }
    }
}
