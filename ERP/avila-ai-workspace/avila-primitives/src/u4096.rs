//! Inteiro de 4096 bits unsigned (RSA-4096)

use avila_nucleus::{adc, sbb};

/// Inteiro de 4096 bits (64 limbs de 64 bits)
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(align(64))]
pub struct U4096 {
    pub limbs: [u64; 64],
}

impl U4096 {
    pub const LIMBS: usize = 64;
    pub const BITS: usize = 4096;
    pub const BYTES: usize = 512;

    pub const ZERO: Self = Self { limbs: [0; 64] };
    pub const ONE: Self = {
        let mut limbs = [0; 64];
        limbs[0] = 1;
        Self { limbs }
    };

    pub const fn from_u64(value: u64) -> Self {
        let mut limbs = [0; 64];
        limbs[0] = value;
        Self { limbs }
    }

    pub const fn is_zero(&self) -> bool {
        let mut i = 0;
        while i < 64 {
            if self.limbs[i] != 0 {
                return false;
            }
            i += 1;
        }
        true
    }

    pub fn from_bytes_be(bytes: &[u8]) -> Self {
        assert!(bytes.len() <= 512);
        let mut limbs = [0u64; 64];
        let mut padded = [0u8; 512];
        padded[512 - bytes.len()..].copy_from_slice(bytes);

        for (i, chunk) in padded.chunks_exact(8).enumerate() {
            limbs[63 - i] = u64::from_be_bytes(chunk.try_into().unwrap());
        }

        Self { limbs }
    }

    pub fn to_bytes_be(&self) -> [u8; 512] {
        let mut bytes = [0u8; 512];
        for (i, &limb) in self.limbs.iter().rev().enumerate() {
            bytes[i * 8..(i + 1) * 8].copy_from_slice(&limb.to_be_bytes());
        }
        bytes
    }
}
