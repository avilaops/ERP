//! AVX-512 intrinsics wrappers
//!
//! Operações vetorizadas usando AVX-512 (512-bit vectors)
//! Processa 8x u64 simultaneamente

#[cfg(target_arch = "x86_64")]
use core::arch::x86_64::*;

/// XOR de 512 bits (8x u64)
///
/// # Safety
///
/// Requer CPU com suporte AVX-512F. Use cpu_features() para verificar.
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn xor512(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
    let result = _mm512_xor_epi64(va, vb);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// AND de 512 bits (8x u64)
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn and512(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
    let result = _mm512_and_epi64(va, vb);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// OR de 512 bits (8x u64)
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn or512(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
    let result = _mm512_or_epi64(va, vb);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// ADD de 512 bits (8x u64) - sem propagação de carry entre lanes
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn add512_no_carry(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
    let result = _mm512_add_epi64(va, vb);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// SUB de 512 bits (8x u64) - sem propagação de borrow entre lanes
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn sub512_no_carry(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
    let result = _mm512_sub_epi64(va, vb);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// Comparação: a == b (retorna true se todos lanes iguais)
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn eq512(a: &[u64; 8], b: &[u64; 8]) -> bool {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);

    // Comparação retorna máscara de 8 bits
    let mask = _mm512_cmpeq_epi64_mask(va, vb);

    // Testa se todos os 8 bits estão setados
    mask == 0xFF
}

/// Shift left de cada lane independentemente (imediato)
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn shl512_lanes_imm<const SHIFT: i32>(a: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let result = _mm512_slli_epi64::<SHIFT>(va);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// Shift right de cada lane independentemente (imediato)
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn shr512_lanes_imm<const SHIFT: i32>(a: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let result = _mm512_srli_epi64::<SHIFT>(va);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// Shift left variável (cada lane pode ter shift diferente)
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn shl512_variable(a: &[u64; 8], shifts: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vs = _mm512_loadu_epi64(shifts.as_ptr() as *const i64);
    let result = _mm512_sllv_epi64(va, vs);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// Shift right variável
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn shr512_variable(a: &[u64; 8], shifts: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vs = _mm512_loadu_epi64(shifts.as_ptr() as *const i64);
    let result = _mm512_srlv_epi64(va, vs);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// Seta todos os lanes com o mesmo valor
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn set1_u64_512(value: u64) -> [u64; 8] {
    let vec = _mm512_set1_epi64(value as i64);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, vec);
    output
}

/// Zera vetor 512-bit
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn zero512() -> [u64; 8] {
    let vec = _mm512_setzero_si512();

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, vec);
    output
}

/// Operação ternária: a ? b : c (por lane, usando máscara)
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn blend512(mask: u8, a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
    let result = _mm512_mask_blend_epi64(mask, vb, va);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// Permutação de lanes (8x64 → 8x64)
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn permute512(a: &[u64; 8], indices: &[i64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vi = _mm512_loadu_epi64(indices.as_ptr());
    let result = _mm512_permutexvar_epi64(vi, va);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// Comparação com máscara: a < b (retorna máscara de 8 bits)
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn lt512_mask(a: &[u64; 8], b: &[u64; 8]) -> u8 {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
    _mm512_cmplt_epu64_mask(va, vb)
}

/// Comparação com máscara: a > b (retorna máscara de 8 bits)
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn gt512_mask(a: &[u64; 8], b: &[u64; 8]) -> u8 {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
    _mm512_cmpgt_epu64_mask(va, vb)
}

/// MIN de cada lane
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn min512(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
    let result = _mm512_min_epu64(va, vb);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

/// MAX de cada lane
#[target_feature(enable = "avx512f")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn max512(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
    let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
    let result = _mm512_max_epu64(va, vb);

    let mut output = [0u64; 8];
    _mm512_storeu_epi64(output.as_mut_ptr() as *mut i64, result);
    output
}

#[cfg(test)]
#[cfg(target_arch = "x86_64")]
mod tests {
    use super::*;

    #[test]
    fn test_avx512_xor() {
        if !is_x86_feature_detected!("avx512f") {
            println!("Skipping AVX-512 test - not supported");
            return;
        }

        let a = [1, 2, 3, 4, 5, 6, 7, 8];
        let b = [8, 7, 6, 5, 4, 3, 2, 1];

        unsafe {
            let result = xor512(&a, &b);
            for i in 0..8 {
                assert_eq!(result[i], a[i] ^ b[i]);
            }
        }
    }

    #[test]
    fn test_avx512_eq() {
        if !is_x86_feature_detected!("avx512f") {
            return;
        }

        let a = [1, 2, 3, 4, 5, 6, 7, 8];
        let b = [1, 2, 3, 4, 5, 6, 7, 8];
        let c = [1, 2, 3, 4, 5, 6, 7, 9];

        unsafe {
            assert!(eq512(&a, &b));
            assert!(!eq512(&a, &c));
        }
    }

    #[test]
    fn test_avx512_add() {
        if !is_x86_feature_detected!("avx512f") {
            return;
        }

        let a = [1, 2, 3, 4, 5, 6, 7, 8];
        let b = [10, 20, 30, 40, 50, 60, 70, 80];

        unsafe {
            let result = add512_no_carry(&a, &b);
            for i in 0..8 {
                assert_eq!(result[i], a[i] + b[i]);
            }
        }
    }

    #[test]
    fn test_avx512_comparisons() {
        if !is_x86_feature_detected!("avx512f") {
            return;
        }

        let a = [1, 2, 3, 4, 5, 6, 7, 8];
        let b = [2, 3, 4, 5, 6, 7, 8, 9];

        unsafe {
            let lt_mask = lt512_mask(&a, &b);
            let gt_mask = gt512_mask(&a, &b);

            // Todos lanes de a são < b
            assert_eq!(lt_mask, 0xFF);
            assert_eq!(gt_mask, 0x00);
        }
    }
}
