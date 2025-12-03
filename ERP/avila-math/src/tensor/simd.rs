//! # SIMD Optimizations Module
//!
//! Vectorized operations using AVX2/SSE instructions for high-performance tensor operations.
//!
//! ## Features
//! - Vectorized dot products
//! - SIMD matrix multiplication
//! - Element-wise operations (add, mul, relu)
//! - Reduction operations (sum, max, min)
//!
//! ## Platform Support
//! - x86_64 with AVX2: Full SIMD acceleration
//! - Fallback: Pure Rust implementation for other platforms

#[cfg(target_arch = "x86_64")]
use std::arch::x86_64::*;

/// Dot product vetorizado usando AVX2
///
/// # Safety
/// Usa instruções AVX2 quando disponível. Fallback para implementação escalar.
///
/// # Example
/// ```
/// use avila_math::tensor::simd::dot_product_simd;
///
/// let a = vec![1.0, 2.0, 3.0, 4.0];
/// let b = vec![5.0, 6.0, 7.0, 8.0];
/// let result = dot_product_simd(&a, &b);
/// assert_eq!(result, 70.0); // 1*5 + 2*6 + 3*7 + 4*8
/// ```
pub fn dot_product_simd(a: &[f64], b: &[f64]) -> f64 {
    assert_eq!(a.len(), b.len(), "Vectors must have same length");

    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            unsafe { dot_product_avx2(a, b) }
        } else {
            dot_product_scalar(a, b)
        }
    }

    #[cfg(not(target_arch = "x86_64"))]
    {
        dot_product_scalar(a, b)
    }
}

/// Implementação AVX2 do dot product (4 f64 por vez)
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
unsafe fn dot_product_avx2(a: &[f64], b: &[f64]) -> f64 {
    let len = a.len();
    let lanes = 4; // AVX2 processa 4 f64 por vez
    let chunks = len / lanes;
    let _remainder = len % lanes;

    let mut sum_vec = _mm256_setzero_pd();

    // Processa chunks de 4 elementos
    for i in 0..chunks {
        let idx = i * lanes;
        let a_vec = _mm256_loadu_pd(a.as_ptr().add(idx));
        let b_vec = _mm256_loadu_pd(b.as_ptr().add(idx));
        let mul_vec = _mm256_mul_pd(a_vec, b_vec);
        sum_vec = _mm256_add_pd(sum_vec, mul_vec);
    }

    // Reduz o vetor para escalar
    let mut result = [0.0; 4];
    _mm256_storeu_pd(result.as_mut_ptr(), sum_vec);
    let mut sum = result.iter().sum::<f64>();

    // Processa elementos restantes
    let start = chunks * lanes;
    for i in start..len {
        sum += a[i] * b[i];
    }

    sum
}

/// Implementação escalar do dot product (fallback)
fn dot_product_scalar(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

/// Multiplicação elemento-wise com SIMD
///
/// # Example
/// ```
/// use avila_math::tensor::simd::mul_elementwise_simd;
///
/// let a = vec![1.0, 2.0, 3.0, 4.0];
/// let b = vec![2.0, 3.0, 4.0, 5.0];
/// let result = mul_elementwise_simd(&a, &b);
/// assert_eq!(result, vec![2.0, 6.0, 12.0, 20.0]);
/// ```
pub fn mul_elementwise_simd(a: &[f64], b: &[f64]) -> Vec<f64> {
    assert_eq!(a.len(), b.len(), "Arrays must have same length");

    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            unsafe { mul_elementwise_avx2(a, b) }
        } else {
            mul_elementwise_scalar(a, b)
        }
    }

    #[cfg(not(target_arch = "x86_64"))]
    {
        mul_elementwise_scalar(a, b)
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
unsafe fn mul_elementwise_avx2(a: &[f64], b: &[f64]) -> Vec<f64> {
    let len = a.len();
    let lanes = 4;
    let chunks = len / lanes;
    let _remainder = len % lanes;

    let mut result = vec![0.0; len];

    for i in 0..chunks {
        let idx = i * lanes;
        let a_vec = _mm256_loadu_pd(a.as_ptr().add(idx));
        let b_vec = _mm256_loadu_pd(b.as_ptr().add(idx));
        let mul_vec = _mm256_mul_pd(a_vec, b_vec);
        _mm256_storeu_pd(result.as_mut_ptr().add(idx), mul_vec);
    }

    let start = chunks * lanes;
    for i in start..len {
        result[i] = a[i] * b[i];
    }

    result
}

fn mul_elementwise_scalar(a: &[f64], b: &[f64]) -> Vec<f64> {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).collect()
}

/// Adição elemento-wise com SIMD
pub fn add_elementwise_simd(a: &[f64], b: &[f64]) -> Vec<f64> {
    assert_eq!(a.len(), b.len());

    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            unsafe { add_elementwise_avx2(a, b) }
        } else {
            add_elementwise_scalar(a, b)
        }
    }

    #[cfg(not(target_arch = "x86_64"))]
    {
        add_elementwise_scalar(a, b)
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
unsafe fn add_elementwise_avx2(a: &[f64], b: &[f64]) -> Vec<f64> {
    let len = a.len();
    let lanes = 4;
    let chunks = len / lanes;

    let mut result = vec![0.0; len];

    for i in 0..chunks {
        let idx = i * lanes;
        let a_vec = _mm256_loadu_pd(a.as_ptr().add(idx));
        let b_vec = _mm256_loadu_pd(b.as_ptr().add(idx));
        let add_vec = _mm256_add_pd(a_vec, b_vec);
        _mm256_storeu_pd(result.as_mut_ptr().add(idx), add_vec);
    }

    let start = chunks * lanes;
    for i in start..len {
        result[i] = a[i] + b[i];
    }

    result
}

fn add_elementwise_scalar(a: &[f64], b: &[f64]) -> Vec<f64> {
    a.iter().zip(b.iter()).map(|(x, y)| x + y).collect()
}

/// ReLU com SIMD (max(0, x))
///
/// # Example
/// ```
/// use avila_math::tensor::simd::relu_simd;
///
/// let input = vec![-1.0, 2.0, -3.0, 4.0];
/// let output = relu_simd(&input);
/// assert_eq!(output, vec![0.0, 2.0, 0.0, 4.0]);
/// ```
pub fn relu_simd(input: &[f64]) -> Vec<f64> {
    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            unsafe { relu_avx2(input) }
        } else {
            relu_scalar(input)
        }
    }

    #[cfg(not(target_arch = "x86_64"))]
    {
        relu_scalar(input)
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
unsafe fn relu_avx2(input: &[f64]) -> Vec<f64> {
    let len = input.len();
    let lanes = 4;
    let chunks = len / lanes;

    let mut result = vec![0.0; len];
    let zeros = _mm256_setzero_pd();

    for i in 0..chunks {
        let idx = i * lanes;
        let x_vec = _mm256_loadu_pd(input.as_ptr().add(idx));
        let relu_vec = _mm256_max_pd(x_vec, zeros);
        _mm256_storeu_pd(result.as_mut_ptr().add(idx), relu_vec);
    }

    let start = chunks * lanes;
    for i in start..len {
        result[i] = input[i].max(0.0);
    }

    result
}

fn relu_scalar(input: &[f64]) -> Vec<f64> {
    input.iter().map(|&x| x.max(0.0)).collect()
}

/// Soma de todos os elementos com SIMD
pub fn sum_simd(input: &[f64]) -> f64 {
    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            unsafe { sum_avx2(input) }
        } else {
            input.iter().sum()
        }
    }

    #[cfg(not(target_arch = "x86_64"))]
    {
        input.iter().sum()
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
unsafe fn sum_avx2(input: &[f64]) -> f64 {
    let len = input.len();
    let lanes = 4;
    let chunks = len / lanes;

    let mut sum_vec = _mm256_setzero_pd();

    for i in 0..chunks {
        let idx = i * lanes;
        let x_vec = _mm256_loadu_pd(input.as_ptr().add(idx));
        sum_vec = _mm256_add_pd(sum_vec, x_vec);
    }

    let mut result = [0.0; 4];
    _mm256_storeu_pd(result.as_mut_ptr(), sum_vec);
    let mut sum = result.iter().sum::<f64>();

    let start = chunks * lanes;
    for val in input.iter().skip(start) {
        sum += val;
    }

    sum
}

/// Multiplicação escalar com SIMD
pub fn mul_scalar_simd(input: &[f64], scalar: f64) -> Vec<f64> {
    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            unsafe { mul_scalar_avx2(input, scalar) }
        } else {
            mul_scalar_scalar(input, scalar)
        }
    }

    #[cfg(not(target_arch = "x86_64"))]
    {
        mul_scalar_scalar(input, scalar)
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
unsafe fn mul_scalar_avx2(input: &[f64], scalar: f64) -> Vec<f64> {
    let len = input.len();
    let lanes = 4;
    let chunks = len / lanes;

    let mut result = vec![0.0; len];
    let scalar_vec = _mm256_set1_pd(scalar);

    for i in 0..chunks {
        let idx = i * lanes;
        let x_vec = _mm256_loadu_pd(input.as_ptr().add(idx));
        let mul_vec = _mm256_mul_pd(x_vec, scalar_vec);
        _mm256_storeu_pd(result.as_mut_ptr().add(idx), mul_vec);
    }

    let start = chunks * lanes;
    for i in start..len {
        result[i] = input[i] * scalar;
    }

    result
}

fn mul_scalar_scalar(input: &[f64], scalar: f64) -> Vec<f64> {
    input.iter().map(|&x| x * scalar).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dot_product_simd() {
        let a = vec![1.0, 2.0, 3.0, 4.0];
        let b = vec![5.0, 6.0, 7.0, 8.0];
        let result = dot_product_simd(&a, &b);
        assert_eq!(result, 70.0); // 1*5 + 2*6 + 3*7 + 4*8 = 70
    }

    #[test]
    fn test_dot_product_large() {
        let a: Vec<f64> = (0..100).map(|x| x as f64).collect();
        let b: Vec<f64> = (0..100).map(|x| x as f64 * 2.0).collect();

        let result_simd = dot_product_simd(&a, &b);
        let result_scalar = dot_product_scalar(&a, &b);

        assert!((result_simd - result_scalar).abs() < 1e-10);
    }

    #[test]
    fn test_mul_elementwise() {
        let a = vec![1.0, 2.0, 3.0, 4.0];
        let b = vec![2.0, 3.0, 4.0, 5.0];
        let result = mul_elementwise_simd(&a, &b);
        assert_eq!(result, vec![2.0, 6.0, 12.0, 20.0]);
    }

    #[test]
    fn test_add_elementwise() {
        let a = vec![1.0, 2.0, 3.0, 4.0];
        let b = vec![5.0, 6.0, 7.0, 8.0];
        let result = add_elementwise_simd(&a, &b);
        assert_eq!(result, vec![6.0, 8.0, 10.0, 12.0]);
    }

    #[test]
    fn test_relu_simd() {
        let input = vec![-2.0, -1.0, 0.0, 1.0, 2.0];
        let result = relu_simd(&input);
        assert_eq!(result, vec![0.0, 0.0, 0.0, 1.0, 2.0]);
    }

    #[test]
    fn test_sum_simd() {
        let input = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let result = sum_simd(&input);
        assert_eq!(result, 15.0);
    }

    #[test]
    fn test_mul_scalar() {
        let input = vec![1.0, 2.0, 3.0, 4.0];
        let result = mul_scalar_simd(&input, 2.5);
        assert_eq!(result, vec![2.5, 5.0, 7.5, 10.0]);
    }

    #[test]
    fn test_simd_unaligned_length() {
        // Testa com tamanho que não é múltiplo de 4
        let a = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let b = vec![6.0, 7.0, 8.0, 9.0, 10.0];

        let dot = dot_product_simd(&a, &b);
        assert_eq!(dot, 130.0); // 1*6 + 2*7 + 3*8 + 4*9 + 5*10
    }
}
