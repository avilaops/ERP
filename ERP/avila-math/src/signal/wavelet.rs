//! # Wavelet Transform Module
//!
//! Continuous Wavelet Transform (CWT) and Discrete Wavelet Transform (DWT)
//! for gravitational wave detection (LISA) and signal analysis.
//!
//! ## Features
//! - Continuous Wavelet Transform with Morlet wavelet
//! - Discrete Wavelet Transform with Daubechies wavelets
//! - Multi-resolution analysis
//! - Time-frequency representation
//!
//! ## LISA Application
//! Wavelets are critical for detecting gravitational waves in noisy data:
//! - CWT for chirp signal detection
//! - DWT for multi-scale noise reduction
//! - Time-frequency localization of merger events

use avila_fft::num_complex::Complex;
use std::f64::consts::PI;

/// Continuous Wavelet Transform (CWT) usando wavelet Morlet
///
/// # Arguments
/// * `signal` - Sinal de entrada no domínio do tempo
/// * `scales` - Escalas para análise (relacionadas à frequência)
///
/// # Returns
/// Matriz [scales.len() x signal.len()] de coeficientes complexos
///
/// # Example
/// ```
/// use avila_math::signal::wavelet::cwt;
///
/// let signal = vec![0.0, 1.0, 0.5, -0.5, -1.0, 0.0];
/// let scales = vec![1.0, 2.0, 4.0, 8.0];
/// let coeffs = cwt(&signal, &scales);
/// assert_eq!(coeffs.len(), scales.len());
/// assert_eq!(coeffs[0].len(), signal.len());
/// ```
pub fn cwt(signal: &[f64], scales: &[f64]) -> Vec<Vec<Complex<f64>>> {
    let n = signal.len();
    let mut coefficients = Vec::with_capacity(scales.len());

    for &scale in scales {
        let mut row = Vec::with_capacity(n);

        for t in 0..n {
            let mut sum = Complex::new(0.0, 0.0);

            // Convolução com wavelet Morlet escalada
            for (k, &sig_val) in signal.iter().enumerate().take(n) {
                let tau = k as f64 - t as f64;
                let wavelet = morlet_wavelet(tau / scale, scale);
                sum += wavelet * sig_val;
            }

            row.push(sum / scale.sqrt());
        }

        coefficients.push(row);
    }

    coefficients
}

/// Wavelet Morlet complexa (mother wavelet para CWT)
///
/// ψ(t) = π^(-1/4) * exp(iω₀t) * exp(-t²/2)
/// onde ω₀ = 6 (compromisso entre localização temporal e frequencial)
fn morlet_wavelet(t: f64, scale: f64) -> Complex<f64> {
    let omega0 = 6.0; // Frequência central
    let norm = (PI.powf(-0.25)) / scale.sqrt();
    let envelope = (-t * t / 2.0).exp();
    let oscillation = Complex::new(0.0, omega0 * t).exp();

    Complex::new(norm * envelope, 0.0) * oscillation
}

/// Discrete Wavelet Transform (DWT) usando Daubechies-4
///
/// # Arguments
/// * `signal` - Sinal de entrada (comprimento deve ser potência de 2)
///
/// # Returns
/// * `approximation` - Coeficientes de aproximação (baixa frequência)
/// * `detail` - Coeficientes de detalhe (alta frequência)
///
/// # Example
/// ```
/// use avila_math::signal::wavelet::dwt;
///
/// let signal = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
/// let (approx, detail) = dwt(&signal);
/// assert_eq!(approx.len(), signal.len() / 2);
/// assert_eq!(detail.len(), signal.len() / 2);
/// ```
pub fn dwt(signal: &[f64]) -> (Vec<f64>, Vec<f64>) {
    let n = signal.len();
    if n == 0 || !n.is_power_of_two() {
        panic!("Signal length must be a power of 2");
    }

    // Coeficientes Daubechies-4 (db4)
    let h = daubechies4_low_pass();
    let g = daubechies4_high_pass();

    let half_n = n / 2;
    let mut approximation = vec![0.0; half_n];
    let mut detail = vec![0.0; half_n];

    // Convolução e downsampling
    for i in 0..half_n {
        let mut sum_low = 0.0;
        let mut sum_high = 0.0;

        for k in 0..h.len() {
            let idx = (2 * i + k) % n;
            sum_low += h[k] * signal[idx];
            sum_high += g[k] * signal[idx];
        }

        approximation[i] = sum_low;
        detail[i] = sum_high;
    }

    (approximation, detail)
}

/// Inverse Discrete Wavelet Transform (IDWT)
///
/// Reconstrói o sinal original a partir dos coeficientes DWT
///
/// # Arguments
/// * `approximation` - Coeficientes de aproximação
/// * `detail` - Coeficientes de detalhe
///
/// # Returns
/// Sinal reconstruído
pub fn idwt(approximation: &[f64], detail: &[f64]) -> Vec<f64> {
    if approximation.len() != detail.len() {
        panic!("Approximation and detail must have same length");
    }

    let half_n = approximation.len();
    let n = half_n * 2;

    // Coeficientes de reconstrução
    let h = daubechies4_low_pass();
    let g = daubechies4_high_pass();

    let mut signal = vec![0.0; n];

    // Upsampling e convolução
    for i in 0..half_n {
        for k in 0..h.len() {
            let idx = (2 * i + k) % n;
            signal[idx] += h[k] * approximation[i] + g[k] * detail[i];
        }
    }

    signal
}

/// Multi-level DWT decomposition
///
/// # Arguments
/// * `signal` - Sinal de entrada
/// * `levels` - Número de níveis de decomposição
///
/// # Returns
/// Vec de tuplas (approximation, detail) para cada nível
pub fn dwt_multilevel(signal: &[f64], levels: usize) -> Vec<(Vec<f64>, Vec<f64>)> {
    if levels == 0 {
        return vec![];
    }

    let mut coeffs = Vec::with_capacity(levels);
    let mut current_signal = signal.to_vec();

    for _ in 0..levels {
        let (approx, detail) = dwt(&current_signal);
        coeffs.push((approx.clone(), detail));
        current_signal = approx;
    }

    coeffs
}

/// Coeficientes Daubechies-4 para filtro passa-baixa
fn daubechies4_low_pass() -> [f64; 4] {
    let sqrt2 = 2.0_f64.sqrt();
    let sqrt3 = 3.0_f64.sqrt();
    [
        (1.0 + sqrt3) / (4.0 * sqrt2),
        (3.0 + sqrt3) / (4.0 * sqrt2),
        (3.0 - sqrt3) / (4.0 * sqrt2),
        (1.0 - sqrt3) / (4.0 * sqrt2),
    ]
}

/// Coeficientes Daubechies-4 para filtro passa-alta
fn daubechies4_high_pass() -> [f64; 4] {
    let h = daubechies4_low_pass();
    [h[3], -h[2], h[1], -h[0]]
}

/// Calcula a energia dos coeficientes wavelet em cada escala
///
/// Útil para detecção de eventos (como mergers de buracos negros)
pub fn wavelet_energy(coeffs: &[Vec<Complex<f64>>]) -> Vec<f64> {
    coeffs
        .iter()
        .map(|row| row.iter().map(|c| c.norm_sqr()).sum())
        .collect()
}

/// Encontra posição do máximo coeficiente em cada escala
///
/// Útil para localização temporal de eventos
pub fn wavelet_peak_positions(coeffs: &[Vec<Complex<f64>>]) -> Vec<usize> {
    coeffs
        .iter()
        .map(|row| {
            row.iter()
                .enumerate()
                .max_by(|(_, a), (_, b)| a.norm().partial_cmp(&b.norm()).unwrap())
                .map(|(i, _)| i)
                .unwrap_or(0)
        })
        .collect()
}

/// Conversão de escala para pseudo-frequência (CWT)
///
/// # Arguments
/// * `scale` - Escala da wavelet
/// * `delta_t` - Intervalo de amostragem
///
/// # Returns
/// Frequência central correspondente
pub fn scale_to_frequency(scale: f64, delta_t: f64) -> f64 {
    let fc = 0.8125; // Frequência central da Morlet (ω₀/(2π))
    fc / (scale * delta_t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cwt_basic() {
        let signal = vec![0.0, 1.0, 0.5, -0.5, -1.0, 0.0];
        let scales = vec![1.0, 2.0, 4.0];

        let coeffs = cwt(&signal, &scales);

        assert_eq!(coeffs.len(), scales.len());
        assert_eq!(coeffs[0].len(), signal.len());
    }

    #[test]
    fn test_dwt_basic() {
        let signal = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];

        let (approx, detail) = dwt(&signal);

        assert_eq!(approx.len(), signal.len() / 2);
        assert_eq!(detail.len(), signal.len() / 2);
    }

    #[test]
    fn test_dwt_idwt_reconstruction() {
        let signal = vec![1.0, 2.0, 3.0, 4.0];

        let (approx, detail) = dwt(&signal);
        let reconstructed = idwt(&approx, &detail);

        assert_eq!(reconstructed.len(), signal.len());

        // Verifica reconstrução aproximada (pode ter pequenos erros numéricos)
        for (orig, recon) in signal.iter().zip(reconstructed.iter()) {
            assert!((orig - recon).abs() < 1e-10);
        }
    }

    #[test]
    fn test_dwt_multilevel() {
        let signal = vec![1.0; 16];
        let levels = 3;

        let coeffs = dwt_multilevel(&signal, levels);

        assert_eq!(coeffs.len(), levels);
        assert_eq!(coeffs[0].0.len(), 8); // First level: 16 -> 8
        assert_eq!(coeffs[1].0.len(), 4); // Second level: 8 -> 4
        assert_eq!(coeffs[2].0.len(), 2); // Third level: 4 -> 2
    }

    #[test]
    fn test_wavelet_energy() {
        let coeffs = vec![
            vec![Complex::new(1.0, 1.0), Complex::new(2.0, 0.0)],
            vec![Complex::new(0.5, 0.5), Complex::new(1.0, 1.0)],
        ];

        let energy = wavelet_energy(&coeffs);

        assert_eq!(energy.len(), 2);
        assert!((energy[0] - 6.0).abs() < 1e-10); // 1² + 1² + 2² = 6
        assert!((energy[1] - 2.5).abs() < 1e-10); // 0.5² + 0.5² + 1² + 1² = 2.5
    }

    #[test]
    fn test_scale_to_frequency() {
        let scale = 10.0;
        let delta_t = 0.1;

        let freq = scale_to_frequency(scale, delta_t);

        assert!(freq > 0.0);
        assert!(freq < 1.0); // Deve ser razoável para esses parâmetros
    }

    #[test]
    fn test_morlet_wavelet() {
        let t = 0.0;
        let scale = 1.0;

        let psi = morlet_wavelet(t, scale);

        // Em t=0, Morlet tem valor máximo
        assert!(psi.norm() > 0.5);
    }

    #[test]
    fn test_daubechies_coefficients_sum() {
        let h = daubechies4_low_pass();
        let g = daubechies4_high_pass();

        // Filtros devem ser normalizados
        let h_sum: f64 = h.iter().map(|x| x * x).sum();
        let g_sum: f64 = g.iter().map(|x| x * x).sum();

        assert!((h_sum - 1.0).abs() < 1e-10);
        assert!((g_sum - 1.0).abs() < 1e-10);
    }

    #[test]
    #[should_panic(expected = "power of 2")]
    fn test_dwt_invalid_length() {
        let signal = vec![1.0, 2.0, 3.0]; // Not a power of 2
        dwt(&signal);
    }
}
