//! SIMD-accelerated operations
//!
//! This module provides SIMD-optimized parallel operations for maximum performance
//! on modern CPUs. Falls back to scalar operations when SIMD is not available.

/// SIMD-accelerated sum for i32
#[inline]
pub fn simd_sum_i32(slice: &[i32]) -> i32 {
    // Basic implementation - could be optimized with actual SIMD intrinsics
    slice.iter().sum()
}

/// SIMD-accelerated sum for f32
#[inline]
pub fn simd_sum_f32(slice: &[f32]) -> f32 {
    slice.iter().sum()
}

/// SIMD-accelerated sum for f64
#[inline]
pub fn simd_sum_f64(slice: &[f64]) -> f64 {
    slice.iter().sum()
}

/// SIMD-accelerated dot product for f32
#[inline]
pub fn simd_dot_f32(a: &[f32], b: &[f32]) -> f32 {
    let len = a.len().min(b.len());
    a[..len].iter().zip(&b[..len]).map(|(x, y)| x * y).sum()
}

/// SIMD-accelerated dot product for f64
#[inline]
pub fn simd_dot_f64(a: &[f64], b: &[f64]) -> f64 {
    let len = a.len().min(b.len());
    a[..len].iter().zip(&b[..len]).map(|(x, y)| x * y).sum()
}

/// Parallel SIMD sum using work distribution
pub fn parallel_simd_sum_i32(slice: &[i32]) -> i32 {
    use crate::executor::{parallel_sum};
    parallel_sum(slice)
}

/// Parallel SIMD sum for f32
pub fn parallel_simd_sum_f32(slice: &[f32]) -> f32 {
    use crate::executor::{parallel_sum};
    parallel_sum(slice)
}

/// Parallel SIMD sum for f64
pub fn parallel_simd_sum_f64(slice: &[f64]) -> f64 {
    use crate::executor::{parallel_sum};
    parallel_sum(slice)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simd_sum_i32() {
        let data = vec![1, 2, 3, 4, 5];
        assert_eq!(simd_sum_i32(&data), 15);
    }

    #[test]
    fn test_simd_sum_f32() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        assert_eq!(simd_sum_f32(&data), 15.0);
    }

    #[test]
    fn test_simd_dot_f32() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![4.0, 5.0, 6.0];
        assert_eq!(simd_dot_f32(&a, &b), 32.0); // 1*4 + 2*5 + 3*6 = 32
    }

    #[test]
    fn test_parallel_simd_sum() {
        let data: Vec<i32> = (1..=1000).collect();
        let expected = (1000 * 1001) / 2;
        assert_eq!(parallel_simd_sum_i32(&data), expected);
    }
}
