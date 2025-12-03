//! Wiener Filter for optimal signal estimation
//!
//! Implements the Wiener filter for noise reduction and signal estimation.

use avila_fft::num_complex::Complex64;

/// Wiener filter for signal denoising
#[derive(Debug, Clone)]
pub struct WienerFilter {
    /// Filter coefficients
    coefficients: Vec<f64>,
    /// Filter order
    order: usize,
}

impl WienerFilter {
    /// Create a Wiener filter from signal and noise power spectra
    ///
    /// # Arguments
    /// * `signal_power` - Power spectral density of signal
    /// * `noise_power` - Power spectral density of noise
    pub fn from_power_spectra(signal_power: &[f64], noise_power: &[f64]) -> Self {
        assert_eq!(
            signal_power.len(),
            noise_power.len(),
            "Signal and noise spectra must have same length"
        );

        let order = signal_power.len();
        let coefficients = signal_power
            .iter()
            .zip(noise_power.iter())
            .map(|(s, n)| if s + n > 1e-10 { s / (s + n) } else { 0.0 })
            .collect();

        Self {
            coefficients,
            order,
        }
    }

    /// Create a Wiener filter with known SNR
    ///
    /// # Arguments
    /// * `order` - Filter order
    /// * `snr` - Signal-to-noise ratio
    pub fn from_snr(order: usize, snr: f64) -> Self {
        let coefficients = vec![snr / (snr + 1.0); order];
        Self {
            coefficients,
            order,
        }
    }

    /// Apply Wiener filter to a signal in frequency domain
    pub fn apply_frequency(&self, spectrum: &[Complex64]) -> Vec<Complex64> {
        assert_eq!(
            spectrum.len(),
            self.order,
            "Spectrum length must match filter order"
        );

        spectrum
            .iter()
            .zip(self.coefficients.iter())
            .map(|(s, c)| *s * *c)
            .collect()
    }

    /// Apply Wiener filter to a real signal (performs FFT internally)
    pub fn apply(&self, signal: &[f64]) -> Vec<f64> {
        use avila_fft::num_complex::Complex;

        let n = signal.len();

        // Forward FFT
        let buffer: Vec<Complex<f64>> = signal.iter().map(|&x| Complex::new(x, 0.0)).collect();
        let mut freq_buffer = avila_fft::fft(&buffer);

        // Apply filter
        for (i, coef) in self.coefficients.iter().enumerate().take(n.min(self.order)) {
            freq_buffer[i] = Complex::new(
                freq_buffer[i].re * coef,
                freq_buffer[i].im * coef,
            );
        }

        // Inverse FFT
        let result = avila_fft::ifft(&freq_buffer);
        result.iter().map(|c| c.re).collect()
    }

    /// Get filter coefficients
    pub fn coefficients(&self) -> &[f64] {
        &self.coefficients
    }

    /// Get filter order
    pub fn order(&self) -> usize {
        self.order
    }
}

/// Estimate signal and noise power from noisy signal using segments
pub fn estimate_power_spectra(
    signal: &[f64],
    segment_length: usize,
    overlap: usize,
) -> (Vec<f64>, Vec<f64>) {
    use avila_fft::num_complex::Complex;

    let step = segment_length - overlap;
    let num_segments = (signal.len() - overlap) / step;

    let mut power_sum = vec![0.0; segment_length];

    for i in 0..num_segments {
        let start = i * step;
        let end = start + segment_length;
        if end > signal.len() {
            break;
        }

        let segment = &signal[start..end];
        let buffer: Vec<Complex<f64>> = segment.iter().map(|&x| Complex::new(x, 0.0)).collect();

        let freq_buffer = avila_fft::fft(&buffer);

        for (j, c) in freq_buffer.iter().enumerate() {
            power_sum[j] += (c.re * c.re + c.im * c.im) / segment_length as f64;
        }
    }

    // Average power
    let power: Vec<f64> = power_sum.iter().map(|p| p / num_segments as f64).collect();

    // Estimate noise floor (assume lowest 10% is noise)
    let mut sorted = power.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let noise_floor = sorted[sorted.len() / 10];

    let signal_power = power.iter().map(|p| (p - noise_floor).max(0.0)).collect();
    let noise_power = vec![noise_floor; segment_length];

    (signal_power, noise_power)
}

#[cfg(test)]
mod tests {
    use super::*;
    use avila_rand::Rng;

    #[test]
    fn test_wiener_snr() {
        let wf = WienerFilter::from_snr(128, 10.0);
        assert!((wf.coefficients()[0] - 10.0 / 11.0).abs() < 1e-6);
    }

    #[test]
    fn test_wiener_apply() {
        let mut rng = avila_rand::thread_rng();
        let signal: Vec<f64> = (0..128).map(|i| (i as f64 * 0.1).sin()).collect();
        let noisy: Vec<f64> = signal.iter().map(|&s| s + rng.gen::<f64>() * 0.1).collect();

        let wf = WienerFilter::from_snr(128, 5.0);
        let filtered = wf.apply(&noisy);

        assert_eq!(filtered.len(), noisy.len());
    }
}
