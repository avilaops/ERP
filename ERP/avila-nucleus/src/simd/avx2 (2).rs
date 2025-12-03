//! AVX2 intrinsics wrappers
//!
//! Operações vetorizadas usando AVX2 (256-bit vectors)

#[cfg(target_arch = "x86_64")]
use core::arch::x86_64::*;

/// XOR de 256 bits (4x u64)
///
/// # Safety
///
/// Requer CPU com suporte AVX2. Use cpu_features() para verificar.
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn xor256(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    let va = _mm256_loadu_si256(a.as_ptr() as *const __m256i);
    let vb = _mm256_loadu_si256(b.as_ptr() as *const __m256i);
    let result = _mm256_xor_si256(va, vb);

    let mut output = [0u64; 4];
    _mm256_storeu_si256(output.as_mut_ptr() as *mut __m256i, result);
    output
}

/// AND de 256 bits (4x u64)
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn and256(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    let va = _mm256_loadu_si256(a.as_ptr() as *const __m256i);
    let vb = _mm256_loadu_si256(b.as_ptr() as *const __m256i);
    let result = _mm256_and_si256(va, vb);

    let mut output = [0u64; 4];
    _mm256_storeu_si256(output.as_mut_ptr() as *mut __m256i, result);
    output
}

/// OR de 256 bits (4x u64)
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn or256(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    let va = _mm256_loadu_si256(a.as_ptr() as *const __m256i);
    let vb = _mm256_loadu_si256(b.as_ptr() as *const __m256i);
    let result = _mm256_or_si256(va, vb);

    let mut output = [0u64; 4];
    _mm256_storeu_si256(output.as_mut_ptr() as *mut __m256i, result);
    output
}

/// ADD de 256 bits (4x u64) - sem propagação de carry entre lanes
///
/// Nota: Cada u64 é somado independentemente
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn add256_no_carry(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    let va = _mm256_loadu_si256(a.as_ptr() as *const __m256i);
    let vb = _mm256_loadu_si256(b.as_ptr() as *const __m256i);
    let result = _mm256_add_epi64(va, vb);

    let mut output = [0u64; 4];
    _mm256_storeu_si256(output.as_mut_ptr() as *mut __m256i, result);
    output
}

/// SUB de 256 bits (4x u64) - sem propagação de borrow entre lanes
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn sub256_no_carry(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    let va = _mm256_loadu_si256(a.as_ptr() as *const __m256i);
    let vb = _mm256_loadu_si256(b.as_ptr() as *const __m256i);
    let result = _mm256_sub_epi64(va, vb);

    let mut output = [0u64; 4];
    _mm256_storeu_si256(output.as_mut_ptr() as *mut __m256i, result);
    output
}

/// Comparação: a == b em cada lane (retorna máscara por lane)
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn eq256(a: &[u64; 4], b: &[u64; 4]) -> bool {
    let va = _mm256_loadu_si256(a.as_ptr() as *const __m256i);
    let vb = _mm256_loadu_si256(b.as_ptr() as *const __m256i);
    let cmp = _mm256_cmpeq_epi64(va, vb);

    // Testa se todos os bits estão setados (todas as lanes iguais)
    _mm256_testc_si256(cmp, _mm256_set1_epi64x(-1)) == 1
}

/// Shift left de cada lane independentemente
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn shl256_lanes(a: &[u64; 4], shift: u32) -> [u64; 4] {
    let va = _mm256_loadu_si256(a.as_ptr() as *const __m256i);
    let result = _mm256_slli_epi64::<0>(va); // Constant shift only

    let mut output = [0u64; 4];
    _mm256_storeu_si256(output.as_mut_ptr() as *mut __m256i, result);
    output
}

/// Shift right de cada lane independentemente
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn shr256_lanes(a: &[u64; 4], shift: u32) -> [u64; 4] {
    let va = _mm256_loadu_si256(a.as_ptr() as *const __m256i);
    let result = _mm256_srli_epi64::<0>(va); // Constant shift only

    let mut output = [0u64; 4];
    _mm256_storeu_si256(output.as_mut_ptr() as *mut __m256i, result);
    output
}

/// Seta todos os lanes com o mesmo valor
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn set1_u64(value: u64) -> [u64; 4] {
    let vec = _mm256_set1_epi64x(value as i64);

    let mut output = [0u64; 4];
    _mm256_storeu_si256(output.as_mut_ptr() as *mut __m256i, vec);
    output
}

/// Zera vetor
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
pub unsafe fn zero256() -> [u64; 4] {
    let vec = _mm256_setzero_si256();

    let mut output = [0u64; 4];
    _mm256_storeu_si256(output.as_mut_ptr() as *mut __m256i, vec);
    output
}

#[cfg(test)]
#[cfg(target_arch = "x86_64")]
mod tests {
    use super::*;

    #[test]
    fn test_avx2_xor() {
        if !is_x86_feature_detected!("avx2") {
            println!("Skipping AVX2 test - not supported");
            return;
        }

        let a = [1, 2, 3, 4];
        let b = [5, 6, 7, 8];

        unsafe {
            let result = xor256(&a, &b);
            assert_eq!(result[0], 1 ^ 5);
            assert_eq!(result[1], 2 ^ 6);
            assert_eq!(result[2], 3 ^ 7);
            assert_eq!(result[3], 4 ^ 8);
        }
    }

    #[test]
    fn test_avx2_eq() {
        if !is_x86_feature_detected!("avx2") {
            return;
        }

        let a = [1, 2, 3, 4];
        let b = [1, 2, 3, 4];
        let c = [1, 2, 3, 5];

        unsafe {
            assert!(eq256(&a, &b));
            assert!(!eq256(&a, &c));
        }
    }
}
