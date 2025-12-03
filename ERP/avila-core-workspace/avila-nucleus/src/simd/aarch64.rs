//! Implementação SIMD para ARM64 (NEON)

#[cfg(target_arch = "aarch64")]
use core::arch::aarch64::*;

/// Operações NEON (128 bits = 2x u64)
pub struct Neon;

#[cfg(target_feature = "neon")]
impl super::SimdOps for Neon {
    type Vector = uint64x2_t;

    #[inline(always)]
    #[target_feature(enable = "neon")]
    unsafe fn load(ptr: *const u64) -> Self::Vector {
        vld1q_u64(ptr)
    }

    #[inline(always)]
    #[target_feature(enable = "neon")]
    unsafe fn store(ptr: *mut u64, vec: Self::Vector) {
        vst1q_u64(ptr, vec);
    }

    #[inline(always)]
    #[target_feature(enable = "neon")]
    unsafe fn add(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        vaddq_u64(a, b)
    }

    #[inline(always)]
    #[target_feature(enable = "neon")]
    unsafe fn sub(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        vsubq_u64(a, b)
    }

    #[inline(always)]
    #[target_feature(enable = "neon")]
    unsafe fn xor(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        veorq_u64(a, b)
    }

    #[inline(always)]
    #[target_feature(enable = "neon")]
    unsafe fn and(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        vandq_u64(a, b)
    }
}
