//! # FFT Implementation
//!
//! Fast Fourier Transform for 1D, 2D, 3D, and 4D data using rustfft.
//!
//! ## Examples
//!
//! ```
//! use avila_math::signal::fft::{fft_1d, ifft_1d};
//! use avila_fft::num_complex::Complex64;
//!
//! let signal = vec![
//!     Complex64::new(1.0, 0.0),
//!     Complex64::new(2.0, 0.0),
//!     Complex64::new(3.0, 0.0),
//!     Complex64::new(4.0, 0.0),
//! ];
//!
//! let spectrum = fft_1d(&signal);
//! let reconstructed = ifft_1d(&spectrum);
//! ```

use avila_fft::num_complex::Complex64;

/// 1D FFT
pub fn fft_1d(input: &[Complex64]) -> Vec<Complex64> {
    avila_fft::fft(input)
}

/// 1D Inverse FFT
pub fn ifft_1d(input: &[Complex64]) -> Vec<Complex64> {
    avila_fft::ifft(input)
}

/// 2D FFT (row-column algorithm)
pub fn fft_2d(input: &[Vec<Complex64>]) -> Vec<Vec<Complex64>> {
    if input.is_empty() {
        return Vec::new();
    }

    let rows = input.len();
    let cols = input[0].len();

    // FFT on rows
    let temp: Vec<Vec<Complex64>> = input.iter().map(|row| fft_1d(row)).collect();

    // Transpose
    let mut transposed = vec![vec![Complex64::new(0.0, 0.0); rows]; cols];
    for i in 0..rows {
        for j in 0..cols {
            transposed[j][i] = temp[i][j];
        }
    }

    // FFT on columns (now rows)
    let result: Vec<Vec<Complex64>> = transposed.iter().map(|row| fft_1d(row)).collect();

    // Transpose back
    let mut final_result = vec![vec![Complex64::new(0.0, 0.0); cols]; rows];
    for i in 0..cols {
        for j in 0..rows {
            final_result[j][i] = result[i][j];
        }
    }

    final_result
}

/// 2D Inverse FFT
pub fn ifft_2d(input: &[Vec<Complex64>]) -> Vec<Vec<Complex64>> {
    if input.is_empty() {
        return Vec::new();
    }

    let rows = input.len();
    let cols = input[0].len();

    // IFFT on rows
    let temp: Vec<Vec<Complex64>> = input.iter().map(|row| ifft_1d(row)).collect();

    // Transpose
    let mut transposed = vec![vec![Complex64::new(0.0, 0.0); rows]; cols];
    for i in 0..rows {
        for j in 0..cols {
            transposed[j][i] = temp[i][j];
        }
    }

    // IFFT on columns
    let result: Vec<Vec<Complex64>> = transposed.iter().map(|row| ifft_1d(row)).collect();

    // Transpose back
    let mut final_result = vec![vec![Complex64::new(0.0, 0.0); cols]; rows];
    for i in 0..cols {
        for j in 0..rows {
            final_result[j][i] = result[i][j];
        }
    }

    final_result
}

/// 3D FFT (sequential 1D FFTs along each dimension)
pub fn fft_3d(input: &[Vec<Vec<Complex64>>]) -> Vec<Vec<Vec<Complex64>>> {
    if input.is_empty() || input[0].is_empty() {
        return Vec::new();
    }

    let dim0 = input.len();
    let dim1 = input[0].len();
    let dim2 = input[0][0].len();

    // FFT along dimension 0
    let mut temp1 = vec![vec![vec![Complex64::new(0.0, 0.0); dim2]; dim1]; dim0];
    for j in 0..dim1 {
        for k in 0..dim2 {
            let slice: Vec<Complex64> = (0..dim0).map(|i| input[i][j][k]).collect();
            let fft_slice = fft_1d(&slice);
            for i in 0..dim0 {
                temp1[i][j][k] = fft_slice[i];
            }
        }
    }

    // FFT along dimension 1
    let mut temp2 = vec![vec![vec![Complex64::new(0.0, 0.0); dim2]; dim1]; dim0];
    for i in 0..dim0 {
        for k in 0..dim2 {
            let slice: Vec<Complex64> = (0..dim1).map(|j| temp1[i][j][k]).collect();
            let fft_slice = fft_1d(&slice);
            for j in 0..dim1 {
                temp2[i][j][k] = fft_slice[j];
            }
        }
    }

    // FFT along dimension 2
    let mut result = vec![vec![vec![Complex64::new(0.0, 0.0); dim2]; dim1]; dim0];
    for i in 0..dim0 {
        for j in 0..dim1 {
            let slice = &temp2[i][j];
            let fft_slice = fft_1d(slice);
            result[i][j] = fft_slice;
        }
    }

    result
}

/// 3D Inverse FFT
pub fn ifft_3d(input: &[Vec<Vec<Complex64>>]) -> Vec<Vec<Vec<Complex64>>> {
    if input.is_empty() || input[0].is_empty() {
        return Vec::new();
    }

    let dim0 = input.len();
    let dim1 = input[0].len();
    let dim2 = input[0][0].len();

    // IFFT along dimension 2
    let mut temp1 = vec![vec![vec![Complex64::new(0.0, 0.0); dim2]; dim1]; dim0];
    for i in 0..dim0 {
        for j in 0..dim1 {
            let slice = &input[i][j];
            let ifft_slice = ifft_1d(slice);
            temp1[i][j] = ifft_slice;
        }
    }

    // IFFT along dimension 1
    let mut temp2 = vec![vec![vec![Complex64::new(0.0, 0.0); dim2]; dim1]; dim0];
    for i in 0..dim0 {
        for k in 0..dim2 {
            let slice: Vec<Complex64> = (0..dim1).map(|j| temp1[i][j][k]).collect();
            let ifft_slice = ifft_1d(&slice);
            for j in 0..dim1 {
                temp2[i][j][k] = ifft_slice[j];
            }
        }
    }

    // IFFT along dimension 0
    let mut result = vec![vec![vec![Complex64::new(0.0, 0.0); dim2]; dim1]; dim0];
    for j in 0..dim1 {
        for k in 0..dim2 {
            let slice: Vec<Complex64> = (0..dim0).map(|i| temp2[i][j][k]).collect();
            let ifft_slice = ifft_1d(&slice);
            for i in 0..dim0 {
                result[i][j][k] = ifft_slice[i];
            }
        }
    }

    result
}

/// 4D FFT (sequential 1D FFTs along each dimension)
///
/// # Arguments
/// * `input` - 4D array as [dim0][dim1][dim2][dim3]
///
/// # Examples
///
/// ```
/// use avila_math::signal::fft::fft_4d;
/// use avila_fft::num_complex::Complex64;
///
/// // Create 4D signal (e.g., video: time, channels, height, width)
/// let signal = vec![
///     vec![
///         vec![
///             vec![Complex64::new(1.0, 0.0); 4]; // width
///             4 // height
///         ];
///         3 // channels
///     ];
///     10 // time
/// ];
///
/// let spectrum_4d = fft_4d(&signal);
/// ```
pub fn fft_4d(input: &[Vec<Vec<Vec<Complex64>>>]) -> Vec<Vec<Vec<Vec<Complex64>>>> {
    if input.is_empty() || input[0].is_empty() || input[0][0].is_empty() {
        return Vec::new();
    }

    let dim0 = input.len();
    let dim1 = input[0].len();
    let dim2 = input[0][0].len();
    let dim3 = input[0][0][0].len();

    // FFT along dimension 0
    let mut temp1 = vec![vec![vec![vec![Complex64::new(0.0, 0.0); dim3]; dim2]; dim1]; dim0];
    for j in 0..dim1 {
        for k in 0..dim2 {
            for l in 0..dim3 {
                let slice: Vec<Complex64> = (0..dim0).map(|i| input[i][j][k][l]).collect();
                let fft_slice = fft_1d(&slice);
                for i in 0..dim0 {
                    temp1[i][j][k][l] = fft_slice[i];
                }
            }
        }
    }

    // FFT along dimension 1
    let mut temp2 = vec![vec![vec![vec![Complex64::new(0.0, 0.0); dim3]; dim2]; dim1]; dim0];
    for i in 0..dim0 {
        for k in 0..dim2 {
            for l in 0..dim3 {
                let slice: Vec<Complex64> = (0..dim1).map(|j| temp1[i][j][k][l]).collect();
                let fft_slice = fft_1d(&slice);
                for j in 0..dim1 {
                    temp2[i][j][k][l] = fft_slice[j];
                }
            }
        }
    }

    // FFT along dimension 2
    let mut temp3 = vec![vec![vec![vec![Complex64::new(0.0, 0.0); dim3]; dim2]; dim1]; dim0];
    for i in 0..dim0 {
        for j in 0..dim1 {
            for l in 0..dim3 {
                let slice: Vec<Complex64> = (0..dim2).map(|k| temp2[i][j][k][l]).collect();
                let fft_slice = fft_1d(&slice);
                for k in 0..dim2 {
                    temp3[i][j][k][l] = fft_slice[k];
                }
            }
        }
    }

    // FFT along dimension 3
    let mut result = vec![vec![vec![vec![Complex64::new(0.0, 0.0); dim3]; dim2]; dim1]; dim0];
    for i in 0..dim0 {
        for j in 0..dim1 {
            for k in 0..dim2 {
                let slice = &temp3[i][j][k];
                let fft_slice = fft_1d(slice);
                result[i][j][k] = fft_slice;
            }
        }
    }

    result
}

/// 4D Inverse FFT
pub fn ifft_4d(input: &[Vec<Vec<Vec<Complex64>>>]) -> Vec<Vec<Vec<Vec<Complex64>>>> {
    if input.is_empty() || input[0].is_empty() || input[0][0].is_empty() {
        return Vec::new();
    }

    let dim0 = input.len();
    let dim1 = input[0].len();
    let dim2 = input[0][0].len();
    let dim3 = input[0][0][0].len();

    // IFFT along dimension 3
    let mut temp1 = vec![vec![vec![vec![Complex64::new(0.0, 0.0); dim3]; dim2]; dim1]; dim0];
    for i in 0..dim0 {
        for j in 0..dim1 {
            for k in 0..dim2 {
                let slice = &input[i][j][k];
                let ifft_slice = ifft_1d(slice);
                temp1[i][j][k] = ifft_slice;
            }
        }
    }

    // IFFT along dimension 2
    let mut temp2 = vec![vec![vec![vec![Complex64::new(0.0, 0.0); dim3]; dim2]; dim1]; dim0];
    for i in 0..dim0 {
        for j in 0..dim1 {
            for l in 0..dim3 {
                let slice: Vec<Complex64> = (0..dim2).map(|k| temp1[i][j][k][l]).collect();
                let ifft_slice = ifft_1d(&slice);
                for k in 0..dim2 {
                    temp2[i][j][k][l] = ifft_slice[k];
                }
            }
        }
    }

    // IFFT along dimension 1
    let mut temp3 = vec![vec![vec![vec![Complex64::new(0.0, 0.0); dim3]; dim2]; dim1]; dim0];
    for i in 0..dim0 {
        for k in 0..dim2 {
            for l in 0..dim3 {
                let slice: Vec<Complex64> = (0..dim1).map(|j| temp2[i][j][k][l]).collect();
                let ifft_slice = ifft_1d(&slice);
                for j in 0..dim1 {
                    temp3[i][j][k][l] = ifft_slice[j];
                }
            }
        }
    }

    // IFFT along dimension 0
    let mut result = vec![vec![vec![vec![Complex64::new(0.0, 0.0); dim3]; dim2]; dim1]; dim0];
    for j in 0..dim1 {
        for k in 0..dim2 {
            for l in 0..dim3 {
                let slice: Vec<Complex64> = (0..dim0).map(|i| temp3[i][j][k][l]).collect();
                let ifft_slice = ifft_1d(&slice);
                for i in 0..dim0 {
                    result[i][j][k][l] = ifft_slice[i];
                }
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn test_fft_1d_round_trip() {
        let signal = vec![
            Complex64::new(1.0, 0.0),
            Complex64::new(2.0, 0.0),
            Complex64::new(3.0, 0.0),
            Complex64::new(4.0, 0.0),
        ];

        let spectrum = fft_1d(&signal);
        let reconstructed = ifft_1d(&spectrum);

        for (original, recon) in signal.iter().zip(reconstructed.iter()) {
            assert!((original.re - recon.re).abs() < 1e-10);
            assert!((original.im - recon.im).abs() < 1e-10);
        }
    }

    #[test]
    #[ignore] // TODO: Fix tolerance for FFT peak detection
    fn test_fft_1d_sine_wave() {
        let n = 64;
        let freq = 5.0; // 5 Hz
        let sample_rate = 64.0;

        // Generate sine wave
        let signal: Vec<Complex64> = (0..n)
            .map(|i| {
                let t = i as f64 / sample_rate;
                Complex64::new((2.0 * PI * freq * t).sin(), 0.0)
            })
            .collect();

        let spectrum = fft_1d(&signal);

        // Check that peak is at expected frequency
        let magnitudes: Vec<f64> = spectrum.iter().map(|c| c.norm()).collect();
        let max_idx = magnitudes
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap()
            .0;

        // O pico deve estar no bin 5 ou no bin espelhado (128-5=123)
        assert!(
            max_idx == 5 || max_idx == 123,
            "Expected peak at bin 5 or 123, found at bin {}",
            max_idx
        );
    }

    #[test]
    fn test_fft_2d_round_trip() {
        let rows = 4;
        let cols = 4;

        let signal: Vec<Vec<Complex64>> = (0..rows)
            .map(|i| {
                (0..cols)
                    .map(|j| Complex64::new((i + j) as f64, 0.0))
                    .collect()
            })
            .collect();

        let spectrum = fft_2d(&signal);
        let reconstructed = ifft_2d(&spectrum);

        for i in 0..rows {
            for j in 0..cols {
                assert!((signal[i][j].re - reconstructed[i][j].re).abs() < 1e-10);
                assert!((signal[i][j].im - reconstructed[i][j].im).abs() < 1e-10);
            }
        }
    }

    #[test]
    fn test_fft_3d_small() {
        let dim0 = 2;
        let dim1 = 2;
        let dim2 = 2;

        let signal: Vec<Vec<Vec<Complex64>>> = (0..dim0)
            .map(|i| {
                (0..dim1)
                    .map(|j| {
                        (0..dim2)
                            .map(|k| Complex64::new((i + j + k) as f64, 0.0))
                            .collect()
                    })
                    .collect()
            })
            .collect();

        let spectrum = fft_3d(&signal);
        let reconstructed = ifft_3d(&spectrum);

        for i in 0..dim0 {
            for j in 0..dim1 {
                for k in 0..dim2 {
                    assert!((signal[i][j][k].re - reconstructed[i][j][k].re).abs() < 1e-10);
                }
            }
        }
    }

    #[test]
    fn test_fft_4d_small() {
        let dim0 = 2;
        let dim1 = 2;
        let dim2 = 2;
        let dim3 = 2;

        let signal: Vec<Vec<Vec<Vec<Complex64>>>> = (0..dim0)
            .map(|i| {
                (0..dim1)
                    .map(|j| {
                        (0..dim2)
                            .map(|k| {
                                (0..dim3)
                                    .map(|l| Complex64::new((i + j + k + l) as f64, 0.0))
                                    .collect()
                            })
                            .collect()
                    })
                    .collect()
            })
            .collect();

        let spectrum = fft_4d(&signal);
        let reconstructed = ifft_4d(&spectrum);

        for i in 0..dim0 {
            for j in 0..dim1 {
                for k in 0..dim2 {
                    for l in 0..dim3 {
                        let diff = (signal[i][j][k][l].re - reconstructed[i][j][k][l].re).abs();
                        assert!(
                            diff < 1e-10,
                            "Mismatch at [{i}][{j}][{k}][{l}]: diff = {diff}"
                        );
                    }
                }
            }
        }
    }
}
