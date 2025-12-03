//! # Signal Processing Module
//!
//! FFT, spectral analysis, wavelet transforms, and signal processing operations for N-dimensional data.
//!
//! ## Features
//! - 1D, 2D, 3D, and 4D FFT (Fast Fourier Transform)
//! - Power spectral density (PSD)
//! - Spectrogram generation
//! - Frequency domain filtering
//! - Cross-correlation and convolution
//! - Window functions (Hann, Hamming, Blackman)
//! - Continuous Wavelet Transform (CWT)
//! - Discrete Wavelet Transform (DWT)

pub mod fft;
pub mod spectral;
pub mod wavelet;
pub mod windows;

pub use fft::{fft_1d, fft_2d, fft_3d, fft_4d, ifft_1d, ifft_2d, ifft_3d, ifft_4d};
pub use spectral::{cross_correlation, power_spectral_density, spectrogram};
pub use wavelet::{cwt, dwt, dwt_multilevel, idwt, scale_to_frequency, wavelet_energy};
pub use windows::{apply_window, blackman_window, hamming_window, hann_window};

/// Frequency bin to actual frequency conversion
pub fn frequency_from_bin(bin: usize, sample_rate: f64, fft_size: usize) -> f64 {
    (bin as f64) * sample_rate / (fft_size as f64)
}

/// Find dominant frequencies in spectrum
pub fn find_peaks(spectrum: &[f64], threshold: f64) -> Vec<usize> {
    let mut peaks = Vec::new();

    for i in 1..spectrum.len() - 1 {
        if spectrum[i] > threshold && spectrum[i] > spectrum[i - 1] && spectrum[i] > spectrum[i + 1]
        {
            peaks.push(i);
        }
    }

    peaks
}

/// Normalize spectrum to [0, 1]
pub fn normalize_spectrum(spectrum: &[f64]) -> Vec<f64> {
    let max = spectrum.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    if max == 0.0 {
        return vec![0.0; spectrum.len()];
    }
    spectrum.iter().map(|&x| x / max).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frequency_conversion() {
        let sample_rate = 1000.0; // 1 kHz
        let fft_size = 1024;

        // Bin 0 = DC component
        assert_eq!(frequency_from_bin(0, sample_rate, fft_size), 0.0);

        // Nyquist frequency at bin N/2
        let nyquist_bin = fft_size / 2;
        let nyquist_freq = frequency_from_bin(nyquist_bin, sample_rate, fft_size);
        assert!((nyquist_freq - 500.0).abs() < 1e-10);
    }

    #[test]
    fn test_find_peaks() {
        let spectrum = vec![0.1, 0.3, 0.5, 0.3, 0.1, 0.8, 0.4, 0.2, 0.6, 0.3];
        let peaks = find_peaks(&spectrum, 0.4);

        // Deve encontrar pelo menos 2 picos: bin 2 (0.5) e bin 5 (0.8)
        // Pode encontrar bin 8 (0.6) também dependendo da implementação
        assert!(
            peaks.len() >= 2,
            "Expected at least 2 peaks, found {}",
            peaks.len()
        );
        assert!(peaks.contains(&2)); // 0.5
        assert!(peaks.contains(&5)); // 0.8
    }

    #[test]
    fn test_normalize_spectrum() {
        let spectrum = vec![1.0, 2.0, 4.0, 2.0, 1.0];
        let normalized = normalize_spectrum(&spectrum);

        assert_eq!(normalized[2], 1.0); // Max value
        assert_eq!(normalized[0], 0.25);
        assert_eq!(normalized[1], 0.5);
    }
}
