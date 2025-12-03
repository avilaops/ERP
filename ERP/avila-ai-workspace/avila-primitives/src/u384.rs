//! Inteiro de 384 bits unsigned (curva P-384, BLS12-381)

use avila_nucleus::{adc, sbb};

/// Inteiro de 384 bits (6 limbs de 64 bits)
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(align(64))]
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

    pub const fn from_u64(value: u64) -> Self {
        Self { limbs: [value, 0, 0, 0, 0, 0] }
    }

    pub const fn is_zero(&self) -> bool {
        self.limbs[0] == 0 && self.limbs[1] == 0 && self.limbs[2] == 0
            && self.limbs[3] == 0 && self.limbs[4] == 0 && self.limbs[5] == 0
    }

    pub const fn is_odd(&self) -> bool {
        (self.limbs[0] & 1) == 1
    }

    pub fn from_bytes_be(bytes: &[u8]) -> Self {
        assert!(bytes.len() <= 48);
        let mut limbs = [0u64; 6];
        let mut padded = [0u8; 48];
        padded[48 - bytes.len()..].copy_from_slice(bytes);

        for (i, chunk) in padded.chunks_exact(8).enumerate() {
            limbs[5 - i] = u64::from_be_bytes(chunk.try_into().unwrap());
        }

        Self { limbs }
    }

    pub fn to_bytes_be(&self) -> [u8; 48] {
        let mut bytes = [0u8; 48];
        for (i, &limb) in self.limbs.iter().rev().enumerate() {
            bytes[i * 8..(i + 1) * 8].copy_from_slice(&limb.to_be_bytes());
        }
        bytes
    }
}
