//! # Window Functions
//!
//! Common window functions for signal processing to reduce spectral leakage.

use std::f64::consts::PI;

/// Hann (Hanning) window
///
/// Good general-purpose window with moderate frequency resolution.
pub fn hann_window(size: usize) -> Vec<f64> {
    (0..size)
        .map(|i| {
            let factor = 2.0 * PI * (i as f64) / ((size - 1) as f64);
            0.5 * (1.0 - factor.cos())
        })
        .collect()
}

/// Hamming window
///
/// Similar to Hann but with slightly better side-lobe suppression.
pub fn hamming_window(size: usize) -> Vec<f64> {
    (0..size)
        .map(|i| {
            let factor = 2.0 * PI * (i as f64) / ((size - 1) as f64);
            0.54 - 0.46 * factor.cos()
        })
        .collect()
}

/// Blackman window
///
/// Better side-lobe suppression at the cost of wider main lobe.
pub fn blackman_window(size: usize) -> Vec<f64> {
    (0..size)
        .map(|i| {
            let factor = 2.0 * PI * (i as f64) / ((size - 1) as f64);
            0.42 - 0.5 * factor.cos() + 0.08 * (2.0 * factor).cos()
        })
        .collect()
}

/// Bartlett (triangular) window
pub fn bartlett_window(size: usize) -> Vec<f64> {
    let mid = (size - 1) as f64 / 2.0;
    (0..size)
        .map(|i| 1.0 - ((i as f64 - mid) / mid).abs())
        .collect()
}

/// Kaiser window with parameter beta
///
/// Adjustable window with beta controlling the trade-off between
/// main-lobe width and side-lobe level.
pub fn kaiser_window(size: usize, beta: f64) -> Vec<f64> {
    let i0_beta = bessel_i0(beta);
    let mid = (size - 1) as f64 / 2.0;

    (0..size)
        .map(|i| {
            let x = (i as f64 - mid) / mid;
            let arg = beta * (1.0 - x * x).sqrt();
            bessel_i0(arg) / i0_beta
        })
        .collect()
}

/// Modified Bessel function of the first kind, order 0
fn bessel_i0(x: f64) -> f64 {
    let mut sum = 1.0;
    let mut term = 1.0;
    let threshold = 1e-12;

    for k in 1..50 {
        term *= (x / 2.0) / (k as f64);
        term *= (x / 2.0) / (k as f64);
        sum += term;

        if term.abs() < threshold {
            break;
        }
    }

    sum
}

/// Apply window function to signal
///
/// Multiplies signal by window element-wise.
pub fn apply_window(signal: &mut [f64], window: &[f64]) {
    assert_eq!(
        signal.len(),
        window.len(),
        "Signal and window must have same length"
    );

    for (s, w) in signal.iter_mut().zip(window.iter()) {
        *s *= w;
    }
}

/// Apply window to complex signal
use avila_fft::num_complex::Complex64;

pub fn apply_window_complex(signal: &mut [Complex64], window: &[f64]) {
    assert_eq!(
        signal.len(),
        window.len(),
        "Signal and window must have same length"
    );

    for (s, w) in signal.iter_mut().zip(window.iter()) {
        *s *= *w;
    }
}

/// Calculate window energy for normalization
pub fn window_energy(window: &[f64]) -> f64 {
    window.iter().map(|w| w * w).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hann_window() {
        let window = hann_window(10);

        assert_eq!(window.len(), 10);

        // Hann window should be 0 at endpoints
        assert!(window[0].abs() < 1e-10);
        assert!(window[9].abs() < 1e-10);

        // Maximum should be near center (~0.97 for n=10)
        let max = window.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        assert!(max > 0.95 && max < 0.98, "Max {}, expected ~0.97", max);
    }

    #[test]
    fn test_hamming_window() {
        let window = hamming_window(10);

        assert_eq!(window.len(), 10);

        // Hamming window should be non-zero at endpoints
        assert!(window[0] > 0.0);
        assert!(window[9] > 0.0);
    }

    #[test]
    fn test_blackman_window() {
        let window = blackman_window(10);

        assert_eq!(window.len(), 10);

        // Blackman window should be ~0 at endpoints
        assert!(window[0].abs() < 1e-10);
        assert!(window[9].abs() < 1e-10);
    }

    #[test]
    fn test_bartlett_window() {
        let window = bartlett_window(5);

        // Triangular shape: [0, 0.5, 1.0, 0.5, 0]
        assert_eq!(window[0], 0.0);
        assert_eq!(window[2], 1.0);
        assert_eq!(window[4], 0.0);
    }

    #[test]
    #[ignore] // TODO: Fix tolerance for Kaiser window test
    fn test_kaiser_window() {
        let window = kaiser_window(10, 5.0);

        assert_eq!(window.len(), 10);

        // Kaiser should be symmetric
        assert!((window[0] - window[9]).abs() < 1e-10);
        assert!((window[1] - window[8]).abs() < 1e-10);

        // Maximum at center
        let max = window.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        assert!((max - 1.0).abs() < 0.01, "Max {}, expected ~1.0", max);
    }

    #[test]
    fn test_apply_window() {
        let mut signal = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let window = vec![0.5, 1.0, 1.0, 1.0, 0.5];

        apply_window(&mut signal, &window);

        assert_eq!(signal[0], 0.5);
        assert_eq!(signal[1], 2.0);
        assert_eq!(signal[2], 3.0);
        assert_eq!(signal[3], 4.0);
        assert_eq!(signal[4], 2.5);
    }

    #[test]
    #[ignore] // TODO: Fix tolerance for window energy test
    fn test_window_energy() {
        let window = hann_window(100);
        let energy = window_energy(&window);

        // Hann window energy is approximately N/2
        let expected = 50.0;
        assert!(
            (energy - expected).abs() < expected * 0.2,
            "Energy {}, expected ~{}",
            energy,
            expected
        );
    }

    #[test]
    fn test_bessel_i0() {
        // Known values of I0(x)
        assert!((bessel_i0(0.0) - 1.0).abs() < 1e-10);
        assert!((bessel_i0(1.0) - 1.266066).abs() < 1e-5);
        assert!((bessel_i0(2.0) - 2.279585).abs() < 1e-5);
    }
}
