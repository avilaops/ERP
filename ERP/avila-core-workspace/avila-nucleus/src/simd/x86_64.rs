//! Implementação SIMD para x86_64 (AVX2 e AVX-512)

#[cfg(target_arch = "x86_64")]
use core::arch::x86_64::*;

/// Operações AVX2 (256 bits = 4x u64)
pub struct Avx2;

#[cfg(target_feature = "avx2")]
impl super::SimdOps for Avx2 {
    type Vector = __m256i;

    #[inline(always)]
    #[target_feature(enable = "avx2")]
    unsafe fn load(ptr: *const u64) -> Self::Vector {
        _mm256_loadu_si256(ptr as *const __m256i)
    }

    #[inline(always)]
    #[target_feature(enable = "avx2")]
    unsafe fn store(ptr: *mut u64, vec: Self::Vector) {
        _mm256_storeu_si256(ptr as *mut __m256i, vec);
    }

    #[inline(always)]
    #[target_feature(enable = "avx2")]
    unsafe fn add(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        _mm256_add_epi64(a, b)
    }

    #[inline(always)]
    #[target_feature(enable = "avx2")]
    unsafe fn sub(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        _mm256_sub_epi64(a, b)
    }

    #[inline(always)]
    #[target_feature(enable = "avx2")]
    unsafe fn xor(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        _mm256_xor_si256(a, b)
    }

    #[inline(always)]
    #[target_feature(enable = "avx2")]
    unsafe fn and(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        _mm256_and_si256(a, b)
    }
}

/// Operações AVX-512 (512 bits = 8x u64)
pub struct Avx512;

#[cfg(target_feature = "avx512f")]
impl super::SimdOps for Avx512 {
    type Vector = __m512i;

    #[inline(always)]
    #[target_feature(enable = "avx512f")]
    unsafe fn load(ptr: *const u64) -> Self::Vector {
        _mm512_loadu_epi64(ptr as *const i64)
    }

    #[inline(always)]
    #[target_feature(enable = "avx512f")]
    unsafe fn store(ptr: *mut u64, vec: Self::Vector) {
        _mm512_storeu_epi64(ptr as *mut i64, vec);
    }

    #[inline(always)]
    #[target_feature(enable = "avx512f")]
    unsafe fn add(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        _mm512_add_epi64(a, b)
    }

    #[inline(always)]
    #[target_feature(enable = "avx512f")]
    unsafe fn sub(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        _mm512_sub_epi64(a, b)
    }

    #[inline(always)]
    #[target_feature(enable = "avx512f")]
    unsafe fn xor(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        _mm512_xor_si512(a, b)
    }

    #[inline(always)]
    #[target_feature(enable = "avx512f")]
    unsafe fn and(a: Self::Vector, b: Self::Vector) -> Self::Vector {
        _mm512_and_si512(a, b)
    }
}
