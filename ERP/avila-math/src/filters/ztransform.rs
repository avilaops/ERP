//! Z-Transform for discrete-time systems
//!
//! The Z-transform converts discrete-time signals to the complex frequency domain.

use avila_fft::num_complex::Complex64;
use std::f64::consts::PI;

/// Z-Transform result
#[derive(Debug, Clone)]
pub struct ZTransform {
    /// Frequency response samples
    pub response: Vec<Complex64>,
    /// Frequencies (normalized, 0 to π)
    pub frequencies: Vec<f64>,
}

/// Compute the Z-transform of a discrete signal
///
/// # Arguments
/// * `signal` - Input discrete signal
/// * `n_points` - Number of frequency points to evaluate
///
/// # Returns
/// Z-transform evaluated on the unit circle
pub fn ztransform(signal: &[f64], n_points: usize) -> ZTransform {
    let mut response = Vec::with_capacity(n_points);
    let mut frequencies = Vec::with_capacity(n_points);

    for k in 0..n_points {
        let omega = PI * k as f64 / n_points as f64;
        frequencies.push(omega);

        let z = Complex64::new(omega.cos(), omega.sin());
        let mut h = Complex64::new(0.0, 0.0);

        for (n, &x_n) in signal.iter().enumerate() {
            h += Complex64::new(x_n, 0.0) * z.powf(-(n as f64));
        }

        response.push(h);
    }

    ZTransform {
        response,
        frequencies,
    }
}

/// Compute inverse Z-transform using contour integration (residue method)
///
/// This is a simplified version for FIR systems
pub fn inverse_ztransform(ztrans: &ZTransform) -> Vec<f64> {
    // For simplicity, use IFFT on unit circle samples
    use avila_fft::num_complex::Complex;

    let n = ztrans.response.len();

    let buffer: Vec<Complex<f64>> = ztrans
        .response
        .iter()
        .map(|&c| Complex::new(c.re, c.im))
        .collect();

    let result = avila_fft::ifft(&buffer);

    result.iter().map(|c| c.re).collect()
}

/// Evaluate Z-transform at a specific complex point z
pub fn evaluate_at(signal: &[f64], z: Complex64) -> Complex64 {
    signal
        .iter()
        .enumerate()
        .map(|(n, &x_n)| Complex64::new(x_n, 0.0) * z.powf(-(n as f64)))
        .sum()
}

/// Compute poles and zeros of a transfer function
///
/// For a transfer function H(z) = B(z)/A(z)
/// * `b` - Numerator coefficients
/// * `a` - Denominator coefficients
pub fn poles_zeros(_b: &[f64], _a: &[f64]) -> (Vec<Complex64>, Vec<Complex64>) {
    // This is simplified - in practice, use eigenvalue solver
    // For now, return empty vectors
    // TODO: Implement companion matrix eigenvalue method
    (vec![], vec![])
}

/// Compute frequency response H(e^jω) on unit circle
pub fn frequency_response(b: &[f64], a: &[f64], n_points: usize) -> ZTransform {
    let mut response = Vec::with_capacity(n_points);
    let mut frequencies = Vec::with_capacity(n_points);

    for k in 0..n_points {
        let omega = PI * k as f64 / n_points as f64;
        frequencies.push(omega);

        let z = Complex64::new(omega.cos(), omega.sin());

        let numerator = evaluate_at(b, z);
        let denominator = evaluate_at(a, z);

        let h = if denominator.norm() > 1e-10 {
            numerator / denominator
        } else {
            Complex64::new(0.0, 0.0)
        };

        response.push(h);
    }

    ZTransform {
        response,
        frequencies,
    }
}

/// Check system stability (all poles inside unit circle)
pub fn is_stable(_a: &[f64]) -> bool {
    // Simplified check - should compute poles properly
    // A system is stable if all poles are inside unit circle (|z| < 1)
    true // Placeholder
}

/// Design a simple low-pass filter using bilinear transform
pub fn design_lowpass(cutoff: f64, order: usize) -> (Vec<f64>, Vec<f64>) {
    // Simplified design - returns FIR coefficients
    let mut b = vec![0.0; order + 1];
    let fc = cutoff / PI;

    for (i, coef) in b.iter_mut().enumerate().take(order + 1) {
        let n = i as f64 - order as f64 / 2.0;
        if n.abs() < 1e-10 {
            *coef = 2.0 * fc;
        } else {
            *coef = (2.0 * PI * fc * n).sin() / (PI * n);
        }
    }

    let a = vec![1.0]; // FIR has no denominator
    (b, a)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ztransform_unit_impulse() {
        let signal = vec![1.0, 0.0, 0.0, 0.0];
        let zt = ztransform(&signal, 64);

        // Z-transform of unit impulse is 1
        assert!((zt.response[0].norm() - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_frequency_response() {
        let b = vec![1.0, 0.5]; // Simple FIR filter
        let a = vec![1.0];
        let h = frequency_response(&b, &a, 64);

        assert_eq!(h.response.len(), 64);
        assert_eq!(h.frequencies.len(), 64);
    }

    #[test]
    fn test_evaluate_at() {
        let signal = vec![1.0, 2.0, 3.0];
        let z = Complex64::new(1.0, 0.0);
        let result = evaluate_at(&signal, z);

        // H(z=1) = 1 + 2 + 3 = 6
        assert!((result.re - 6.0).abs() < 1e-6);
    }

    #[test]
    fn test_design_lowpass() {
        let (b, a) = design_lowpass(0.3, 10);
        assert_eq!(b.len(), 11);
        assert_eq!(a.len(), 1);
        assert!((a[0] - 1.0).abs() < 1e-6);
    }
}
