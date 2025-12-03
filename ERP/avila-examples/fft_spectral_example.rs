//! Exemplo de FFT e Análise Espectral
//!
//! Demonstra o uso do módulo signal para:
//! - FFT 1D em sinais sintéticos
//! - Análise espectral (PSD, espectrograma)
//! - Aplicação de janelas
//! - FFT 4D para dados de espaço-tempo

use avila_math::signal::*;
use std::f64::consts::PI;

fn main() {
    println!("=== Exemplo de FFT e Análise Espectral ===\n");

    // 1. FFT 1D - Detecção de Frequências
    example_fft_1d();

    // 2. Janelas para Redução de Leakage Espectral
    example_windowing();

    // 3. Análise Espectral - PSD
    example_psd();

    // 4. Espectrograma - Análise Tempo-Frequência
    example_spectrogram();

    // 5. FFT 4D - Dados de Espaço-Tempo
    example_fft_4d();

    println!("\n=== Exemplo Completo ===");
}

/// Exemplo 1: FFT 1D para detectar frequências em um sinal
fn example_fft_1d() {
    println!("--- Exemplo 1: FFT 1D - Detecção de Frequências ---");

    // Criar sinal com duas frequências: 50 Hz e 120 Hz
    let sample_rate = 1000.0; // 1 kHz
    let duration = 1.0; // 1 segundo
    let n_samples = (sample_rate * duration) as usize;

    let mut signal = vec![0.0; n_samples];
    for i in 0..n_samples {
        let t = i as f64 / sample_rate;
        signal[i] = (2.0 * PI * 50.0 * t).sin() + 0.5 * (2.0 * PI * 120.0 * t).sin();
    }

    // Aplicar FFT
    let fft_result = fft_1d(&signal);

    // Calcular espectro de magnitude
    let spectrum = magnitude_spectrum(&fft_result);

    // Encontrar picos
    let peaks = find_peaks(&spectrum, 0.3);

    println!(
        "  Sinal: {} amostras, {} Hz sample rate",
        n_samples, sample_rate
    );
    println!("  FFT: {} bins de frequência", fft_result.len());
    println!("  Picos detectados em bins: {:?}", peaks);

    // Converter bins para frequências
    for &bin in &peaks {
        let freq = frequency_from_bin(bin, sample_rate, n_samples);
        println!("    Bin {}: {:.1} Hz", bin, freq);
    }

    println!();
}

/// Exemplo 2: Aplicação de janelas para reduzir leakage
fn example_windowing() {
    println!("--- Exemplo 2: Janelas para Redução de Leakage ---");

    // Sinal de teste
    let n = 256;
    let mut signal = vec![0.0; n];
    for i in 0..n {
        let t = i as f64 / n as f64;
        signal[i] = (2.0 * PI * 5.5 * t).sin(); // 5.5 ciclos (não inteiro → leakage)
    }

    // Testar diferentes janelas
    let windows = [
        ("Retangular (sem janela)", None),
        ("Hann", Some(hann_window(n))),
        ("Hamming", Some(hamming_window(n))),
        ("Blackman", Some(blackman_window(n))),
        ("Bartlett", Some(bartlett_window(n))),
    ];

    for (name, window) in windows.iter() {
        let windowed = if let Some(w) = window {
            apply_window(&signal, w)
        } else {
            signal.clone()
        };

        let fft = fft_1d(&windowed);
        let spectrum = magnitude_spectrum(&fft);

        // Calcular energia total do espectro
        let energy: f64 = spectrum.iter().map(|&x| x * x).sum();

        println!("  {}: energia espectral = {:.2e}", name, energy);
    }

    println!();
}

/// Exemplo 3: Densidade Espectral de Potência (PSD)
fn example_psd() {
    println!("--- Exemplo 3: Densidade Espectral de Potência ---");

    let sample_rate = 1000.0;
    let n = 1024;

    // Sinal com ruído + tom puro
    let mut signal = vec![0.0; n];
    for i in 0..n {
        let t = i as f64 / sample_rate;
        signal[i] = (2.0 * PI * 100.0 * t).sin() + 0.1 * rand::random::<f64>();
    }

    // Calcular PSD
    let psd = power_spectral_density(&signal, sample_rate);

    // Encontrar frequência dominante
    let (max_idx, &max_power) = psd
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
        .unwrap();

    let dominant_freq = frequency_from_bin(max_idx, sample_rate, n);

    println!("  Sinal: {} amostras", n);
    println!("  PSD calculado: {} bins", psd.len());
    println!("  Frequência dominante: {:.1} Hz", dominant_freq);
    println!("  Potência máxima: {:.2e}", max_power);

    // Converter para dB
    let psd_db = power_to_db(&psd);
    println!("  Potência em dB: {:.2} dB", psd_db[max_idx]);

    println!();
}

/// Exemplo 4: Espectrograma - Análise Tempo-Frequência
fn example_spectrogram() {
    println!("--- Exemplo 4: Espectrograma (STFT) ---");

    let sample_rate = 1000.0;
    let duration = 2.0;
    let n_samples = (sample_rate * duration) as usize;

    // Sinal chirp: frequência aumenta linearmente de 50 Hz a 250 Hz
    let mut signal = vec![0.0; n_samples];
    for i in 0..n_samples {
        let t = i as f64 / sample_rate;
        let freq = 50.0 + (250.0 - 50.0) * (t / duration); // Chirp linear
        let phase = 2.0 * PI * freq * t;
        signal[i] = phase.sin();
    }

    // Parâmetros do espectrograma
    let window_size = 256;
    let hop_size = 64;
    let window = hann_window(window_size);

    // Calcular espectrograma
    let spectrogram = spectrogram(&signal, window_size, hop_size, &window);

    println!("  Sinal: {} amostras, {:.1} s", n_samples, duration);
    println!("  Window size: {}, Hop size: {}", window_size, hop_size);
    println!(
        "  Espectrograma: {} frames × {} bins",
        spectrogram.len(),
        spectrogram[0].len()
    );
    println!(
        "  Resolução temporal: {:.2} ms",
        hop_size as f64 / sample_rate * 1000.0
    );
    println!(
        "  Resolução espectral: {:.2} Hz",
        sample_rate / window_size as f64
    );

    // Encontrar evolução da frequência dominante
    println!("  Frequências dominantes ao longo do tempo:");
    for (frame_idx, frame) in spectrogram.iter().step_by(10).enumerate() {
        let max_bin = frame
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .map(|(idx, _)| idx)
            .unwrap();

        let freq = frequency_from_bin(max_bin, sample_rate, window_size);
        let time = (frame_idx * 10 * hop_size) as f64 / sample_rate;

        println!("    t={:.2}s: {:.1} Hz", time, freq);
    }

    println!();
}

/// Exemplo 5: FFT 4D para dados de espaço-tempo
fn example_fft_4d() {
    println!("--- Exemplo 5: FFT 4D - Análise de Espaço-Tempo ---");

    // Simular uma pequena grade de espaço-tempo (t, x, y, z)
    let shape = [8, 8, 8, 8]; // 4096 pontos no total
    let n = shape.iter().product();

    println!(
        "  Grade espaço-tempo: {}×{}×{}×{} = {} pontos",
        shape[0], shape[1], shape[2], shape[3], n
    );

    // Criar dados sintéticos: onda gravitacional propagando
    let mut data = vec![0.0; n];
    for t in 0..shape[0] {
        for x in 0..shape[1] {
            for y in 0..shape[2] {
                for z in 0..shape[3] {
                    let idx = ((t * shape[1] + x) * shape[2] + y) * shape[3] + z;

                    // Onda propagando na direção +z com frequência temporal
                    let k = 2.0 * PI / shape[3] as f64; // Número de onda
                    let omega = 2.0 * PI / shape[0] as f64; // Frequência angular

                    data[idx] = (omega * t as f64 - k * z as f64).sin();
                }
            }
        }
    }

    // Aplicar FFT 4D
    println!("  Aplicando FFT 4D...");
    let fft_result = fft_4d(&data, &shape);

    // Calcular espectro de potência 4D
    let power_spectrum: Vec<f64> = fft_result.iter().map(|c| c.norm_sqr()).collect();

    // Encontrar modos dominantes
    let (max_idx, &max_power) = power_spectrum
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
        .unwrap();

    // Decompor índice 1D em índices 4D
    let t_idx = max_idx / (shape[1] * shape[2] * shape[3]);
    let rem = max_idx % (shape[1] * shape[2] * shape[3]);
    let x_idx = rem / (shape[2] * shape[3]);
    let rem = rem % (shape[2] * shape[3]);
    let y_idx = rem / shape[3];
    let z_idx = rem % shape[3];

    println!("  FFT 4D completo: {} componentes", fft_result.len());
    println!(
        "  Modo dominante em: k=({}, {}, {}, {})",
        t_idx, x_idx, y_idx, z_idx
    );
    println!("  Potência: {:.2e}", max_power);

    // Teste de round-trip
    let reconstructed = ifft_4d(&fft_result, &shape);
    let error: f64 = data
        .iter()
        .zip(reconstructed.iter())
        .map(|(&a, &b)| (a - b).abs())
        .sum::<f64>()
        / n as f64;

    println!("  Erro de reconstrução (round-trip): {:.2e}", error);

    println!();
}

// Módulo auxiliar para geração de números aleatórios
mod rand {
    pub fn random<T>() -> T
    where
        T: std::ops::Add<Output = T> + std::ops::Mul<Output = T> + From<f64>,
    {
        // Gerador pseudo-aleatório simples (Linear Congruential Generator)
        use std::cell::Cell;
        thread_local! {
            static SEED: Cell<u64> = Cell::new(0x123456789abcdef);
        }

        SEED.with(|seed| {
            let s = seed.get();
            let next = s
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            seed.set(next);
            T::from((next >> 33) as f64 / u32::MAX as f64)
        })
    }
}
