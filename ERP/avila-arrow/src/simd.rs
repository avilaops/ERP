//! SIMD-accelerated operations for arrays
//!
//! Uses AVX2 instructions when available for 4x performance improvement

#[cfg(target_arch = "x86_64")]
use std::arch::x86_64::*;

/// SIMD-accelerated sum for f64 arrays
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
pub unsafe fn sum_f64_simd(data: &[f64]) -> f64 {
    let mut sum = 0.0;
    let len = data.len();
    let chunks = len / 4;

    if chunks > 0 {
        let mut accumulator = _mm256_setzero_pd();

        for i in 0..chunks {
            let offset = i * 4;
            let values = _mm256_loadu_pd(data.as_ptr().add(offset));
            accumulator = _mm256_add_pd(accumulator, values);
        }

        // Horizontal sum
        let mut temp = [0.0; 4];
        _mm256_storeu_pd(temp.as_mut_ptr(), accumulator);
        sum = temp.iter().sum();
    }

    // Handle remaining elements
    sum + data.iter().skip(chunks * 4).sum::<f64>()
}

/// SIMD-accelerated addition for f64 arrays
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
pub unsafe fn add_f64_simd(left: &[f64], right: &[f64], result: &mut [f64]) {
    let len = left.len().min(right.len()).min(result.len());
    let chunks = len / 4;

    for i in 0..chunks {
        let offset = i * 4;
        let a = _mm256_loadu_pd(left.as_ptr().add(offset));
        let b = _mm256_loadu_pd(right.as_ptr().add(offset));
        let sum = _mm256_add_pd(a, b);
        _mm256_storeu_pd(result.as_mut_ptr().add(offset), sum);
    }

    // Handle remaining elements
    for i in (chunks * 4)..len {
        result[i] = left[i] + right[i];
    }
}

/// SIMD-accelerated multiplication for f64 arrays
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
pub unsafe fn mul_f64_simd(left: &[f64], right: &[f64], result: &mut [f64]) {
    let len = left.len().min(right.len()).min(result.len());
    let chunks = len / 4;

    for i in 0..chunks {
        let offset = i * 4;
        let a = _mm256_loadu_pd(left.as_ptr().add(offset));
        let b = _mm256_loadu_pd(right.as_ptr().add(offset));
        let product = _mm256_mul_pd(a, b);
        _mm256_storeu_pd(result.as_mut_ptr().add(offset), product);
    }

    // Handle remaining elements
    for i in (chunks * 4)..len {
        result[i] = left[i] * right[i];
    }
}

/// SIMD-accelerated comparison for f64 arrays
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
pub unsafe fn gt_f64_simd(data: &[f64], scalar: f64, result: &mut [bool]) {
    let len = data.len().min(result.len());
    let chunks = len / 4;
    let scalar_vec = _mm256_set1_pd(scalar);

    for i in 0..chunks {
        let offset = i * 4;
        let values = _mm256_loadu_pd(data.as_ptr().add(offset));
        let cmp = _mm256_cmp_pd(values, scalar_vec, _CMP_GT_OQ);

        let mut mask = [0u64; 4];
        _mm256_storeu_pd(mask.as_mut_ptr() as *mut f64, cmp);

        for j in 0..4 {
            result[offset + j] = mask[j] != 0;
        }
    }

    // Handle remaining elements
    for i in (chunks * 4)..len {
        result[i] = data[i] > scalar;
    }
}

/// SIMD-accelerated subtraction for f64 arrays
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
pub unsafe fn sub_f64_simd(left: &[f64], right: &[f64], result: &mut [f64]) {
    let len = left.len().min(right.len()).min(result.len());
    let chunks = len / 4;

    for i in 0..chunks {
        let offset = i * 4;
        let a = _mm256_loadu_pd(left.as_ptr().add(offset));
        let b = _mm256_loadu_pd(right.as_ptr().add(offset));
        let diff = _mm256_sub_pd(a, b);
        _mm256_storeu_pd(result.as_mut_ptr().add(offset), diff);
    }

    // Handle remaining elements
    for i in (chunks * 4)..len {
        result[i] = left[i] - right[i];
    }
}

/// SIMD-accelerated division for f64 arrays
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
pub unsafe fn div_f64_simd(left: &[f64], right: &[f64], result: &mut [f64]) {
    let len = left.len().min(right.len()).min(result.len());
    let chunks = len / 4;

    for i in 0..chunks {
        let offset = i * 4;
        let a = _mm256_loadu_pd(left.as_ptr().add(offset));
        let b = _mm256_loadu_pd(right.as_ptr().add(offset));
        let quotient = _mm256_div_pd(a, b);
        _mm256_storeu_pd(result.as_mut_ptr().add(offset), quotient);
    }

    // Handle remaining elements
    for i in (chunks * 4)..len {
        result[i] = left[i] / right[i];
    }
}

/// SIMD-accelerated square root for f64 arrays
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
pub unsafe fn sqrt_f64_simd(data: &[f64], result: &mut [f64]) {
    let len = data.len().min(result.len());
    let chunks = len / 4;

    for i in 0..chunks {
        let offset = i * 4;
        let values = _mm256_loadu_pd(data.as_ptr().add(offset));
        let roots = _mm256_sqrt_pd(values);
        _mm256_storeu_pd(result.as_mut_ptr().add(offset), roots);
    }

    // Handle remaining elements
    for i in (chunks * 4)..len {
        result[i] = data[i].sqrt();
    }
}

/// SIMD-accelerated FMA (fused multiply-add): result = a * b + c
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
pub unsafe fn fma_f64_simd(a: &[f64], b: &[f64], c: &[f64], result: &mut [f64]) {
    let len = a.len().min(b.len()).min(c.len()).min(result.len());
    let chunks = len / 4;

    for i in 0..chunks {
        let offset = i * 4;
        let va = _mm256_loadu_pd(a.as_ptr().add(offset));
        let vb = _mm256_loadu_pd(b.as_ptr().add(offset));
        let vc = _mm256_loadu_pd(c.as_ptr().add(offset));
        let vr = _mm256_fmadd_pd(va, vb, vc);
        _mm256_storeu_pd(result.as_mut_ptr().add(offset), vr);
    }

    // Handle remaining elements
    for i in (chunks * 4)..len {
        result[i] = a[i] * b[i] + c[i];
    }
}

/// Fallback sum for non-x86_64 or when AVX2 is not available
#[cfg(not(target_arch = "x86_64"))]
pub fn sum_f64_simd(data: &[f64]) -> f64 {
    data.iter().sum()
}

/// Fallback add for non-x86_64
#[cfg(not(target_arch = "x86_64"))]
pub fn add_f64_simd(left: &[f64], right: &[f64], result: &mut [f64]) {
    let len = left.len().min(right.len()).min(result.len());
    for i in 0..len {
        result[i] = left[i] + right[i];
    }
}

/// Fallback mul for non-x86_64
#[cfg(not(target_arch = "x86_64"))]
pub fn mul_f64_simd(left: &[f64], right: &[f64], result: &mut [f64]) {
    let len = left.len().min(right.len()).min(result.len());
    for i in 0..len {
        result[i] = left[i] * right[i];
    }
}

/// Fallback gt for non-x86_64
#[cfg(not(target_arch = "x86_64"))]
pub fn gt_f64_simd(data: &[f64], scalar: f64, result: &mut [bool]) {
    let len = data.len().min(result.len());
    for i in 0..len {
        result[i] = data[i] > scalar;
    }
}

/// Fallback sub for non-x86_64
#[cfg(not(target_arch = "x86_64"))]
pub fn sub_f64_simd(left: &[f64], right: &[f64], result: &mut [f64]) {
    let len = left.len().min(right.len()).min(result.len());
    for i in 0..len {
        result[i] = left[i] - right[i];
    }
}

/// Fallback div for non-x86_64
#[cfg(not(target_arch = "x86_64"))]
pub fn div_f64_simd(left: &[f64], right: &[f64], result: &mut [f64]) {
    let len = left.len().min(right.len()).min(result.len());
    for i in 0..len {
        result[i] = left[i] / right[i];
    }
}

/// Fallback sqrt for non-x86_64
#[cfg(not(target_arch = "x86_64"))]
pub fn sqrt_f64_simd(data: &[f64], result: &mut [f64]) {
    let len = data.len().min(result.len());
    for i in 0..len {
        result[i] = data[i].sqrt();
    }
}

/// Fallback FMA for non-x86_64
#[cfg(not(target_arch = "x86_64"))]
pub fn fma_f64_simd(a: &[f64], b: &[f64], c: &[f64], result: &mut [f64]) {
    let len = a.len().min(b.len()).min(c.len()).min(result.len());
    for i in 0..len {
        result[i] = a[i] * b[i] + c[i];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sum_f64_simd() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
        let sum = unsafe { sum_f64_simd(&data) };
        assert_eq!(sum, 36.0);
    }

    #[test]
    fn test_add_f64_simd() {
        let left = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let right = vec![10.0, 20.0, 30.0, 40.0, 50.0];
        let mut result = vec![0.0; 5];

        unsafe { add_f64_simd(&left, &right, &mut result) };

        assert_eq!(result, vec![11.0, 22.0, 33.0, 44.0, 55.0]);
    }

    #[test]
    fn test_mul_f64_simd() {
        let left = vec![2.0, 3.0, 4.0, 5.0];
        let right = vec![10.0, 10.0, 10.0, 10.0];
        let mut result = vec![0.0; 4];

        unsafe { mul_f64_simd(&left, &right, &mut result) };

        assert_eq!(result, vec![20.0, 30.0, 40.0, 50.0]);
    }

    #[test]
    fn test_gt_f64_simd() {
        let data = vec![1.0, 5.0, 10.0, 15.0, 20.0];
        let mut result = vec![false; 5];

        unsafe { gt_f64_simd(&data, 8.0, &mut result) };

        assert_eq!(result, vec![false, false, true, true, true]);
    }

    #[test]
    fn test_sub_f64_simd() {
        let left = vec![10.0, 20.0, 30.0, 40.0, 50.0];
        let right = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let mut result = vec![0.0; 5];

        unsafe { sub_f64_simd(&left, &right, &mut result) };

        assert_eq!(result, vec![9.0, 18.0, 27.0, 36.0, 45.0]);
    }

    #[test]
    fn test_div_f64_simd() {
        let left = vec![100.0, 200.0, 300.0, 400.0];
        let right = vec![10.0, 10.0, 10.0, 10.0];
        let mut result = vec![0.0; 4];

        unsafe { div_f64_simd(&left, &right, &mut result) };

        assert_eq!(result, vec![10.0, 20.0, 30.0, 40.0]);
    }

    #[test]
    fn test_sqrt_f64_simd() {
        let data = vec![4.0, 9.0, 16.0, 25.0, 36.0];
        let mut result = vec![0.0; 5];

        unsafe { sqrt_f64_simd(&data, &mut result) };

        assert_eq!(result, vec![2.0, 3.0, 4.0, 5.0, 6.0]);
    }

    #[test]
    fn test_fma_f64_simd() {
        let a = vec![2.0, 3.0, 4.0, 5.0];
        let b = vec![10.0, 10.0, 10.0, 10.0];
        let c = vec![1.0, 2.0, 3.0, 4.0];
        let mut result = vec![0.0; 4];

        unsafe { fma_f64_simd(&a, &b, &c, &mut result) };

        assert_eq!(result, vec![21.0, 32.0, 43.0, 54.0]);
    }

    #[test]
    fn test_simd_non_aligned() {
        // Test with non-multiple of 4 length
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0];
        let sum = unsafe { sum_f64_simd(&data) };
        assert_eq!(sum, 28.0);
    }
}
