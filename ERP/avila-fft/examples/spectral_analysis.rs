//! Exemplo de análise espectral usando avila-fft
//!
//! Demonstra:
//! - Geração de sinal composto (múltiplas frequências)
//! - Aplicação de janelamento
//! - FFT e análise do espectro
//! - Detecção de picos de frequência

use avila_fft::{Complex, FftPlanner, window};
use std::f64::consts::PI;

fn main() {
    println!("=== Análise Espectral com Avila FFT ===\n");

    // Parâmetros do sinal
    let sample_rate = 1000.0; // Hz
    let duration = 1.0; // segundos
    let n = (sample_rate * duration) as usize; // 1000 amostras

    // Garante potência de 2
    let n = n.next_power_of_two();
    println!("Amostras: {}", n);
    println!("Taxa de amostragem: {} Hz", sample_rate);
    println!("Resolução: {:.2} Hz\n", sample_rate / n as f64);

    // Gera sinal composto: 50Hz + 120Hz + 300Hz + ruído
    println!("Gerando sinal com 3 componentes:");
    println!("  - 50 Hz (amplitude 1.0)");
    println!("  - 120 Hz (amplitude 0.7)");
    println!("  - 300 Hz (amplitude 0.3)");
    println!("  + ruído branco\n");

    let signal: Vec<f64> = (0..n)
        .map(|i| {
            let t = i as f64 / sample_rate;

            // Componentes senoidais
            let sig1 = 1.0 * (2.0 * PI * 50.0 * t).sin();
            let sig2 = 0.7 * (2.0 * PI * 120.0 * t).sin();
            let sig3 = 0.3 * (2.0 * PI * 300.0 * t).sin();

            // Ruído simulado (pseudo-aleatório)
            let noise = 0.1 * ((t * 12345.0).sin() + (t * 67890.0).cos());

            sig1 + sig2 + sig3 + noise
        })
        .collect();

    // Aplica janela de Blackman-Harris (alta atenuação)
    println!("Aplicando janela de Blackman-Harris...");
    let window_fn = window::blackman_harris::<f64>(n);
    let windowed = window::apply(&signal, &window_fn);

    // Converte para complexo
    let complex_signal: Vec<Complex<f64>> = windowed
        .iter()
        .map(|&x| Complex::new(x, 0.0))
        .collect();

    // Cria planner e executa FFT
    println!("Executando FFT...");
    let planner = FftPlanner::new(n, false).unwrap();
    let spectrum = planner.process(&complex_signal).unwrap();

    // Analisa apenas metade do espectro (frequências positivas)
    println!("\n=== Espectro de Potência ===\n");

    let mut peaks = Vec::new();

    for k in 0..n/2 {
        let frequency = k as f64 * sample_rate / n as f64;
        let magnitude = spectrum[k].norm();
        let power_db = 20.0 * magnitude.log10();

        // Detecta picos significativos (> -20 dB)
        if power_db > -20.0 {
            peaks.push((frequency, power_db));
        }

        // Imprime algumas frequências representativas
        if k < 10 || (k % 50 == 0 && k < n/2) {
            println!("  {:6.1} Hz: {:7.2} dB", frequency, power_db);
        }
    }

    // Reporta picos detectados
    println!("\n=== Picos Detectados (> -20 dB) ===\n");
    peaks.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    for (i, (freq, db)) in peaks.iter().take(10).enumerate() {
        println!("  {}. {:6.1} Hz: {:7.2} dB", i+1, freq, db);
    }

    // Teste de reversibilidade
    println!("\n=== Teste de Reversibilidade ===\n");
    let ifft_planner = FftPlanner::new(n, true).unwrap();
    let recovered = ifft_planner.process(&spectrum).unwrap();

    // Calcula erro RMS
    let rms_error: f64 = complex_signal.iter()
        .zip(recovered.iter())
        .map(|(orig, rec)| (orig.re - rec.re).powi(2))
        .sum::<f64>()
        .sqrt() / (n as f64);

    println!("Erro RMS (IFFT roundtrip): {:.2e}", rms_error);

    if rms_error < 1e-10 {
        println!("✓ Reversibilidade perfeita!");
    }

    // Demonstra diferentes janelas
    println!("\n=== Comparação de Janelas ===\n");

    let windows = vec![
        ("Retangular", window::rectangular::<f64>(128)),
        ("Hamming", window::hamming::<f64>(128)),
        ("Hann", window::hann::<f64>(128)),
        ("Blackman", window::blackman::<f64>(128)),
    ];

    for (name, win) in windows {
        let sum: f64 = win.iter().sum();
        let max = win.iter().cloned().fold(0.0, f64::max);
        let min = win.iter().cloned().fold(1.0, f64::min);

        println!("  {:<15} - soma: {:.2}, min: {:.3}, max: {:.3}",
            name, sum, min, max);
    }

    println!("\n=== Análise Completa ===");
}
