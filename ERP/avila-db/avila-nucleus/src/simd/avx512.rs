//! Wrappers mínimos para instruções AVX-512 sobre vetores de 512 bits (8 x `u64`).
//! Todas as rotinas são `unsafe` e pressupõem suporte da CPU a `avx512f`/`avx512bw`.

#![allow(clippy::too_many_arguments)]

use core::arch::x86_64::*;

#[inline]
unsafe fn load(ptr: &[u64; 8]) -> __m512i {
    _mm512_loadu_si512(ptr.as_ptr() as *const _)
}

#[inline]
unsafe fn store(vec: __m512i) -> [u64; 8] {
    let mut out = core::mem::MaybeUninit::<[u64; 8]>::uninit();
    _mm512_storeu_si512(out.as_mut_ptr() as *mut _, vec);
    out.assume_init()
}

/// XOR por-lane de oito `u64`.
#[target_feature(enable = "avx512f")]
#[inline]
pub unsafe fn xor_u64x8(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    store(_mm512_xor_si512(load(a), load(b)))
}

/// AND por-lane de oito `u64`.
#[target_feature(enable = "avx512f")]
#[inline]
pub unsafe fn and_u64x8(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    store(_mm512_and_si512(load(a), load(b)))
}

/// Soma por-lane de oito `u64`.
#[target_feature(enable = "avx512f")]
#[inline]
pub unsafe fn add_u64x8(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    store(_mm512_add_epi64(load(a), load(b)))
}

/// Subtração por-lane de oito `u64`.
#[target_feature(enable = "avx512f")]
#[inline]
pub unsafe fn sub_u64x8(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    store(_mm512_sub_epi64(load(a), load(b)))
}

/// Deslocamento lógico à esquerda.
#[target_feature(enable = "avx512f")]
#[inline]
pub unsafe fn shl_u64x8(a: &[u64; 8], shift: i32) -> [u64; 8] {
    store(_mm512_sll_epi64(load(a), _mm_cvtsi32_si128(shift)))
}

/// Deslocamento lógico à direita.
#[target_feature(enable = "avx512f")]
#[inline]
pub unsafe fn shr_u64x8(a: &[u64; 8], shift: i32) -> [u64; 8] {
    store(_mm512_srl_epi64(load(a), _mm_cvtsi32_si128(shift)))
}

/// Compara os vetores lane a lane retornando `true` se todos forem iguais.
#[target_feature(enable = "avx512f")]
#[inline]
pub unsafe fn eq_u64x8(a: &[u64; 8], b: &[u64; 8]) -> bool {
    _mm512_cmpeq_epu64_mask(load(a), load(b)) == 0xFF
}
