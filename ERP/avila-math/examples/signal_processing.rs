//! Processamento de Sinais com avila-math
//!
//! FFT, wavelets, filtros digitais

use avila_math::signal::{fft_1d, ifft_1d, cwt};
use num_complex::Complex64;

fn main() {
    println!("📡 Processamento de Sinais com avila-math\n");

    // 1. FFT - Análise de Frequência
    println!("1️⃣  FFT - Fast Fourier Transform");

    // Sinal: sin(2π*50*t) + 0.5*sin(2π*120*t)
    let sample_rate = 1000.0; // 1 kHz
    let duration = 1.0;
    let n_samples = (sample_rate * duration) as usize;

    let signal: Vec<Complex64> = (0..n_samples)
        .map(|i| {
            let t = i as f64 / sample_rate;
            let val = (2.0 * std::f64::consts::PI * 50.0 * t).sin() +
                0.5 * (2.0 * std::f64::consts::PI * 120.0 * t).sin();
            Complex64::new(val, 0.0)
        })
        .collect();

    println!("   Sinal: {} amostras @ {} Hz", n_samples, sample_rate);
    println!("   Componentes: 50 Hz + 120 Hz");

    // Aplicar FFT
    let spectrum = fft_1d(&signal);

    // Encontrar picos
    let magnitudes: Vec<f64> = spectrum.iter()
        .take(n_samples / 2)
        .map(|c| (c.re * c.re + c.im * c.im).sqrt())
        .collect();

    let mut peaks = Vec::new();
    for i in 1..magnitudes.len() - 1 {
        if magnitudes[i] > magnitudes[i-1] && magnitudes[i] > magnitudes[i+1] && magnitudes[i] > 50.0 {
            let freq = i as f64 * sample_rate / n_samples as f64;
            peaks.push((freq, magnitudes[i]));
        }
    }

    println!("✅ FFT calculado: {} pontos", spectrum.len());
    println!("   Picos detectados:");
    for (freq, mag) in peaks.iter().take(3) {
        println!("     {:.1} Hz (magnitude: {:.1})", freq, mag);
    }
    println!();

    // 2. IFFT - Reconstrução
    println!("2️⃣  IFFT - Reconstrução do Sinal");
    let reconstructed = ifft_1d(&spectrum);

    let error: f64 = signal.iter().zip(reconstructed.iter())
        .map(|(s, r)| (s.re - r.re).abs())
        .sum::<f64>() / signal.len() as f64;

    println!("✅ Sinal reconstruído");
    println!("   Erro médio: {:.2e} (quase zero)", error);
    println!();

    // 3. Wavelet Transform - Análise tempo-frequência
    println!("3️⃣  Wavelet Transform (Morlet CWT)");

    // Sinal chirp (frequência variável)
    let chirp: Vec<f64> = (0..128)
        .map(|i| {
            let t = i as f64 / 128.0;
            (2.0 * std::f64::consts::PI * (10.0 + 50.0 * t) * t).sin()
        })
        .collect();

    let scales = vec![1.0, 2.0, 4.0, 8.0, 16.0];
    let coeffs = cwt(&chirp, &scales);

    println!("   Sinal original: {} pontos", chirp.len());
    println!("✅ CWT aplicado:");
    println!("   Escalas: {:?}", scales);
    println!("   Coeficientes: {}×{}", coeffs.len(), coeffs[0].len());

    // Energia por escala
    for (i, scale_coeffs) in coeffs.iter().enumerate() {
        let energy: f64 = scale_coeffs.iter()
            .map(|c| c.norm_sqr())
            .sum();
        println!("   Escala {:.1}: energia = {:.2}", scales[i], energy);
    }
    println!();

    // 4. Filtro Passa-Baixa (média móvel)
    println!("4️⃣  Filtro Passa-Baixa");

    // Sinal ruidoso
    let noisy: Vec<f64> = (0..100)
        .map(|i| {
            let t = i as f64 / 10.0;
            (t).sin() + 0.3 * ((i * 17) as f64).sin() // signal + noise
        })
        .collect();

    // Aplicar média móvel (janela = 5)
    let window = 5;
    let filtered: Vec<f64> = (0..noisy.len())
        .map(|i| {
            let start = if i >= window/2 { i - window/2 } else { 0 };
            let end = (i + window/2 + 1).min(noisy.len());
            let sum: f64 = noisy[start..end].iter().sum();
            sum / (end - start) as f64
        })
        .collect();

    println!("   Janela: {} pontos", window);
    println!("   Antes: [{:.3}, {:.3}, {:.3}, ...]",
        noisy[10], noisy[11], noisy[12]);
    println!("   Depois: [{:.3}, {:.3}, {:.3}, ...]",
        filtered[10], filtered[11], filtered[12]);
    println!("   ✅ Ruído reduzido");
    println!();

    // 5. Detecção de Envelope
    println!("5️⃣  Detecção de Envelope");

    let am_signal: Vec<f64> = (0..200)
        .map(|i| {
            let t = i as f64 / 200.0;
            let carrier = (2.0 * std::f64::consts::PI * 50.0 * t).sin();
            let envelope = 0.5 + 0.5 * (2.0 * std::f64::consts::PI * 5.0 * t).sin();
            envelope * carrier
        })
        .collect();

    // Envelope via valor absoluto + filtro passa-baixa
    let abs_signal: Vec<f64> = am_signal.iter().map(|x| x.abs()).collect();
    let envelope: Vec<f64> = (0..abs_signal.len())
        .map(|i| {
            let start = if i >= 10 { i - 10 } else { 0 };
            let end = (i + 10).min(abs_signal.len());
            abs_signal[start..end].iter().sum::<f64>() / (end - start) as f64
        })
        .collect();

    println!("   AM signal: portadora 50 Hz, modulação 5 Hz");
    println!("   Envelope extraído:");
    println!("     t=0.00s: {:.3}", envelope[0]);
    println!("     t=0.50s: {:.3}", envelope[100]);
    println!("     t=1.00s: {:.3}", envelope[199]);
    println!("   ✅ Envelope detectado");
    println!();

    println!("🎉 Processamento de Sinais completo!");
}
