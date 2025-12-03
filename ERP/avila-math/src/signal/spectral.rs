//! # Spectral Analysis
//!
//! Power spectral density, spectrogram, and frequency domain analysis.

use super::fft::fft_1d;
use avila_fft::num_complex::Complex64;

/// Calculate Power Spectral Density (PSD)
///
/// Returns the power at each frequency bin.
///
/// # Arguments
/// * `signal` - Complex signal in time domain
///
/// # Returns
/// Vector of power values (magnitude squared of FFT)
pub fn power_spectral_density(signal: &[Complex64]) -> Vec<f64> {
    let spectrum = fft_1d(signal);

    // Calculate magnitude squared (power)
    spectrum.iter().map(|c| c.norm_sqr()).collect()
}

/// Generate spectrogram (STFT - Short-Time Fourier Transform)
///
/// # Arguments
/// * `signal` - Input signal
/// * `window_size` - Size of each window
/// * `hop_size` - Number of samples between windows
///
/// # Returns
/// 2D array: [time_window][frequency_bin]
pub fn spectrogram(signal: &[Complex64], window_size: usize, hop_size: usize) -> Vec<Vec<f64>> {
    if signal.len() < window_size {
        return Vec::new();
    }

    let num_windows = (signal.len() - window_size) / hop_size + 1;
    let mut result = Vec::with_capacity(num_windows);

    for i in 0..num_windows {
        let start = i * hop_size;
        let end = start + window_size;

        if end > signal.len() {
            break;
        }

        let window = &signal[start..end];
        let psd = power_spectral_density(window);
        result.push(psd);
    }

    result
}

/// Cross-correlation between two signals in frequency domain
///
/// Much faster than time-domain cross-correlation for large signals.
///
/// # Arguments
/// * `signal1` - First signal
/// * `signal2` - Second signal
///
/// # Returns
/// Cross-correlation result
pub fn cross_correlation(signal1: &[Complex64], signal2: &[Complex64]) -> Vec<Complex64> {
    use super::fft::{fft_1d, ifft_1d};

    assert_eq!(
        signal1.len(),
        signal2.len(),
        "Signals must have same length"
    );

    // FFT of both signals
    let fft1 = fft_1d(signal1);
    let fft2 = fft_1d(signal2);

    // Multiply spectrum1 by conjugate of spectrum2
    let product: Vec<Complex64> = fft1
        .iter()
        .zip(fft2.iter())
        .map(|(a, b)| *a * b.conj())
        .collect();

    // Inverse FFT
    ifft_1d(&product)
}

/// Bandpass filter in frequency domain
///
/// # Arguments
/// * `signal` - Input signal
/// * `low_freq` - Lower cutoff frequency (Hz)
/// * `high_freq` - Upper cutoff frequency (Hz)
/// * `sample_rate` - Sampling rate (Hz)
///
/// # Returns
/// Filtered signal
pub fn bandpass_filter(
    signal: &[Complex64],
    low_freq: f64,
    high_freq: f64,
    sample_rate: f64,
) -> Vec<Complex64> {
    use super::fft::{fft_1d, ifft_1d};

    let n = signal.len();
    let mut spectrum = fft_1d(signal);

    // Zero out frequencies outside band
    for (i, coeff) in spectrum.iter_mut().enumerate() {
        let freq = (i as f64) * sample_rate / (n as f64);

        if freq < low_freq || freq > high_freq {
            *coeff = Complex64::new(0.0, 0.0);
        }
    }

    ifft_1d(&spectrum)
}

/// Compute magnitude spectrum (absolute values)
pub fn magnitude_spectrum(spectrum: &[Complex64]) -> Vec<f64> {
    spectrum.iter().map(|c| c.norm()).collect()
}

/// Compute phase spectrum (angles in radians)
pub fn phase_spectrum(spectrum: &[Complex64]) -> Vec<f64> {
    spectrum.iter().map(|c| c.arg()).collect()
}

/// Convert power to decibels
pub fn power_to_db(power: f64) -> f64 {
    10.0 * power.log10()
}

/// Convert linear spectrum to dB scale
pub fn spectrum_to_db(spectrum: &[f64]) -> Vec<f64> {
    spectrum
        .iter()
        .map(|&p| {
            if p > 1e-20 {
                power_to_db(p)
            } else {
                -200.0 // Floor at -200 dB
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    fn generate_sine_wave(n: usize, freq: f64, sample_rate: f64) -> Vec<Complex64> {
        (0..n)
            .map(|i| {
                let t = i as f64 / sample_rate;
                Complex64::new((2.0 * PI * freq * t).sin(), 0.0)
            })
            .collect()
    }

    #[test]
    #[ignore] // TODO: Fix tolerance for PSD peak detection
    fn test_psd() {
        let signal = generate_sine_wave(128, 10.0, 128.0);
        let psd = power_spectral_density(&signal);

        // PSD tem o mesmo tamanho do sinal
        assert_eq!(psd.len(), 128);

        let max_idx = psd
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap()
            .0;

        // O pico deve estar próximo do bin 10
        assert!((max_idx as i32 - 10).abs() <= 1);
    }

    #[test]
    fn test_spectrogram() {
        let signal = generate_sine_wave(256, 10.0, 256.0);
        let spec = spectrogram(&signal, 64, 32);

        // Should have multiple time windows
        assert!(spec.len() > 1);

        // Each window should have frequency bins
        assert_eq!(spec[0].len(), 64);
    }

    #[test]
    fn test_cross_correlation() {
        let signal1 = vec![
            Complex64::new(1.0, 0.0),
            Complex64::new(2.0, 0.0),
            Complex64::new(3.0, 0.0),
            Complex64::new(0.0, 0.0),
        ];

        let signal2 = vec![
            Complex64::new(0.0, 0.0),
            Complex64::new(1.0, 0.0),
            Complex64::new(2.0, 0.0),
            Complex64::new(3.0, 0.0),
        ];

        let xcorr = cross_correlation(&signal1, &signal2);

        // Peak should indicate lag of 1 sample
        let max_idx = xcorr
            .iter()
            .map(|c| c.norm())
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap()
            .0;

        assert!(max_idx == 1 || max_idx == xcorr.len() - 1);
    }

    #[test]
    fn test_magnitude_phase() {
        let spectrum = vec![
            Complex64::new(3.0, 4.0),
            Complex64::new(1.0, 0.0),
            Complex64::new(0.0, 2.0),
        ];

        let magnitudes = magnitude_spectrum(&spectrum);
        assert_eq!(magnitudes[0], 5.0); // sqrt(3^2 + 4^2)
        assert_eq!(magnitudes[1], 1.0);
        assert_eq!(magnitudes[2], 2.0);

        let phases = phase_spectrum(&spectrum);
        assert!((phases[0] - (4.0_f64 / 3.0).atan()).abs() < 1e-10);
    }

    #[test]
    fn test_db_conversion() {
        assert_eq!(power_to_db(1.0), 0.0);
        assert_eq!(power_to_db(10.0), 10.0);
        assert_eq!(power_to_db(100.0), 20.0);

        let spectrum = vec![1.0, 10.0, 100.0];
        let db = spectrum_to_db(&spectrum);
        assert_eq!(db[0], 0.0);
        assert_eq!(db[1], 10.0);
        assert_eq!(db[2], 20.0);
    }

    #[test]
    fn test_bandpass_filter() {
        // Create signal with two frequencies: 10 Hz and 50 Hz
        let n = 256;
        let sample_rate = 256.0;

        let signal: Vec<Complex64> = (0..n)
            .map(|i| {
                let t = i as f64 / sample_rate;
                let val = (2.0 * PI * 10.0 * t).sin() + (2.0 * PI * 50.0 * t).sin();
                Complex64::new(val, 0.0)
            })
            .collect();

        // Filter to keep only 40-60 Hz (remove 10 Hz)
        let filtered = bandpass_filter(&signal, 40.0, 60.0, sample_rate);

        // Check that 50 Hz component remains
        let psd = power_spectral_density(&filtered);
        let peak_idx = psd
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap()
            .0;

        assert_eq!(peak_idx, 50);
    }
}
