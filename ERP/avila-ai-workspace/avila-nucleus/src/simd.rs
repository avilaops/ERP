//! Operações SIMD otimizadas para AVX2 e AVX-512

#[cfg(target_arch = "x86_64")]
/// Módulo com operações SIMD para x86_64
pub mod x86_64 {
    use core::arch::x86_64::*;

    /// Adição vetorizada de 8 u64s (AVX-512)
    ///
    /// # Safety
    /// Requer CPU com suporte a AVX-512F
    #[target_feature(enable = "avx512f")]
    #[inline]
    pub unsafe fn add_avx512(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
        // SAFETY: Todas as operações SIMD são unsafe, mas:
        // - Ponteiros são válidos (vêm de slices)
        // - Alinhamento não é requerido (loadu/storeu)
        // - CPU tem AVX-512 (garantido por target_feature)
        unsafe {
            let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
            let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
            let sum = _mm512_add_epi64(va, vb);

            let mut result = [0u64; 8];
            _mm512_storeu_epi64(result.as_mut_ptr() as *mut i64, sum);
            result
        }
    }

    /// Adição vetorizada de 4 u64s (AVX2)
    ///
    /// # Safety
    /// Requer CPU com suporte a AVX2
    #[target_feature(enable = "avx2")]
    #[inline]
    pub unsafe fn add_avx2(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
        // SAFETY: Mesmas garantias que add_avx512
        unsafe {
            let va = _mm256_loadu_si256(a.as_ptr() as *const __m256i);
            let vb = _mm256_loadu_si256(b.as_ptr() as *const __m256i);
            let sum = _mm256_add_epi64(va, vb);

            let mut result = [0u64; 4];
            _mm256_storeu_si256(result.as_mut_ptr() as *mut __m256i, sum);
            result
        }
    }

    /// XOR vetorizado (AVX-512)
    ///
    /// # Safety
    /// Requer CPU com suporte a AVX-512F
    #[target_feature(enable = "avx512f")]
    #[inline]
    pub unsafe fn xor_avx512(a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
        // SAFETY: Mesmas garantias que add_avx512
        unsafe {
            let va = _mm512_loadu_epi64(a.as_ptr() as *const i64);
            let vb = _mm512_loadu_epi64(b.as_ptr() as *const i64);
            let result = _mm512_xor_si512(va, vb);

            let mut out = [0u64; 8];
            _mm512_storeu_epi64(out.as_mut_ptr() as *mut i64, result);
            out
        }
    }
}

#[cfg(target_arch = "aarch64")]
pub mod aarch64 {
    use core::arch::aarch64::*;

    /// Adição vetorizada de 2 u64s (NEON)
    ///
    /// # Safety
    /// Requer CPU ARM com suporte a NEON
    #[target_feature(enable = "neon")]
    #[inline]
    pub unsafe fn add_neon(a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
        let va = vld1q_u64(a.as_ptr());
        let vb = vld1q_u64(b.as_ptr());
        let sum = vaddq_u64(va, vb);

        let mut result = [0u64; 2];
        vst1q_u64(result.as_mut_ptr(), sum);
        result
    }
}

#[cfg(test)]
mod tests {
    #[cfg(target_arch = "x86_64")]
    #[test]
    fn test_avx2_add() {
        if is_x86_feature_detected!("avx2") {
            let a = [1, 2, 3, 4];
            let b = [5, 6, 7, 8];
            let result = unsafe { super::x86_64::add_avx2(&a, &b) };
            assert_eq!(result, [6, 8, 10, 12]);
        }
    }

    #[cfg(target_arch = "x86_64")]
    #[test]
    fn test_avx512_add() {
        if is_x86_feature_detected!("avx512f") {
            let a = [1, 2, 3, 4, 5, 6, 7, 8];
            let b = [8, 7, 6, 5, 4, 3, 2, 1];
            let result = unsafe { super::x86_64::add_avx512(&a, &b) };
            assert_eq!(result, [9, 9, 9, 9, 9, 9, 9, 9]);
        }
    }
}
