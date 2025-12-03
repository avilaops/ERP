//! Wrappers mínimos para instruções AVX2 sobre vetores de 256 bits (4 x `u64`).
//! Todas as funções são `unsafe` porque exigem que a CPU suporte AVX2.

#![allow(clippy::too_many_arguments)]

use core::arch::x86_64::*;

#[inline]
unsafe fn load(ptr: &[u64; 4]) -> __m256i {
    _mm256_loadu_si256(ptr.as_ptr() as *const __m256i)
}

#[inline]
unsafe fn store(vec: __m256i) -> [u64; 4] {
    let mut out = core::mem::MaybeUninit::<[u64; 4]>::uninit();
    _mm256_storeu_si256(out.as_mut_ptr() as *mut __m256i, vec);
    out.assume_init()
}

/// XOR por-lane de quatro `u64`.
#[target_feature(enable = "avx2")]
#[inline]
pub unsafe fn xor_u64x4(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    let va = load(a);
    let vb = load(b);
    store(_mm256_xor_si256(va, vb))
}

/// AND por-lane de quatro `u64`.
#[target_feature(enable = "avx2")]
#[inline]
pub unsafe fn and_u64x4(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    store(_mm256_and_si256(load(a), load(b)))
}

/// OR por-lane de quatro `u64`.
#[target_feature(enable = "avx2")]
#[inline]
pub unsafe fn or_u64x4(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    store(_mm256_or_si256(load(a), load(b)))
}

/// Soma por-lane (não propaga carry entre lanes).
#[target_feature(enable = "avx2")]
#[inline]
pub unsafe fn add_u64x4(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    store(_mm256_add_epi64(load(a), load(b)))
}

/// Subtração por-lane (não propaga borrow entre lanes).
#[target_feature(enable = "avx2")]
#[inline]
pub unsafe fn sub_u64x4(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    store(_mm256_sub_epi64(load(a), load(b)))
}

/// Deslocamento lógico à esquerda de cada lane.
#[target_feature(enable = "avx2")]
#[inline]
pub unsafe fn shl_u64x4(a: &[u64; 4], shift: i32) -> [u64; 4] {
    store(_mm256_sll_epi64(load(a), _mm_cvtsi32_si128(shift)))
}

/// Deslocamento lógico à direita de cada lane.
#[target_feature(enable = "avx2")]
#[inline]
pub unsafe fn shr_u64x4(a: &[u64; 4], shift: i32) -> [u64; 4] {
    store(_mm256_srl_epi64(load(a), _mm_cvtsi32_si128(shift)))
}

/// Compara os vetores lane a lane retornando `true` se todos forem iguais.
#[target_feature(enable = "avx2")]
#[inline]
pub unsafe fn eq_u64x4(a: &[u64; 4], b: &[u64; 4]) -> bool {
    let cmp = _mm256_cmpeq_epi64(load(a), load(b));
    _mm256_testc_si256(cmp, _mm256_set1_epi64x(-1)) == 1
}
