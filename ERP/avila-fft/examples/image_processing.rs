//! Exemplo de processamento de imagens 2D usando FFT
//!
//! Demonstra:
//! - FFT 2D e análise de frequências espaciais
//! - Filtros passa-baixas e passa-altas
//! - Detecção de bordas no domínio da frequência
//! - Análise de espectro de potência 2D

use avila_fft::{fft2d::*, filters::*};
use std::f64::consts::PI;

fn main() {
    println!("=== Processamento de Imagens 2D com FFT ===\n");

    // Cria imagem sintética 64x64 com padrões
    println!("Gerando imagem de teste 64x64...");
    let size = 64;
    let image = create_test_image(size);

    println!("Dimensões: {}x{}", image.width, image.height);
    println!("Total de pixels: {}\n", image.data.len());

    // 1. Análise de frequência espacial
    println!("=== 1. Análise de Frequência Espacial ===\n");
    analyze_spatial_frequency(&image);

    // 2. Filtro passa-baixas (blur)
    println!("\n=== 2. Filtro Passa-Baixas (Blur) ===\n");
    apply_lowpass_filter(&image);

    // 3. Filtro passa-altas (sharpen/edges)
    println!("\n=== 3. Filtro Passa-Altas (Detecção de Bordas) ===\n");
    apply_highpass_filter(&image);

    // 4. Filtro Gaussiano
    println!("\n=== 4. Filtro Gaussiano ===\n");
    apply_gaussian_blur(&image);

    // 5. Análise de potência por quadrante
    println!("\n=== 5. Análise de Potência por Quadrante ===\n");
    analyze_quadrants(&image);

    // 6. Demonstração de reversibilidade
    println!("\n=== 6. Teste de Reversibilidade 2D ===\n");
    test_reversibility(&image);

    println!("\n=== Processamento Completo ===");
}

/// Cria imagem de teste com padrões conhecidos
fn create_test_image(size: usize) -> Image2D<f64> {
    let mut data = Vec::with_capacity(size * size);

    for y in 0..size {
        for x in 0..size {
            let x_f = x as f64;
            let y_f = y as f64;

            // Padrão composto:
            // 1. Senoide horizontal (baixa frequência)
            let pattern1 = 0.5 * (2.0 * PI * x_f / (size as f64) * 2.0).sin();

            // 2. Senoide vertical (média frequência)
            let pattern2 = 0.3 * (2.0 * PI * y_f / (size as f64) * 4.0).sin();

            // 3. Padrão diagonal (alta frequência)
            let pattern3 = 0.2 * (2.0 * PI * (x_f + y_f) / (size as f64) * 8.0).sin();

            // 4. Região constante (DC)
            let dc = 1.0;

            // Combina todos
            let value = dc + pattern1 + pattern2 + pattern3;
            data.push(value);
        }
    }

    Image2D::from_real(size, size, data).unwrap()
}

/// Analisa frequências espaciais
fn analyze_spatial_frequency(image: &Image2D<f64>) {
    println!("Executando FFT 2D...");
    let freq = fft2d(image).unwrap();

    // Calcula espectro de potência
    let power = freq.power_spectrum();

    // Estatísticas
    let total_power: f64 = power.iter().sum();
    let max_power = power.iter().cloned().fold(0.0, f64::max);
    let avg_power = total_power / power.len() as f64;

    println!("Potência total: {:.2e}", total_power);
    println!("Potência média: {:.2e}", avg_power);
    println!("Potência máxima: {:.2e}", max_power);

    // Analisa componente DC
    let dc = freq.get(0, 0);
    println!("\nComponente DC: {:.2} + {:.2}i", dc.re, dc.im);
    println!("Magnitude DC: {:.2}", dc.norm());

    // Conta componentes significativas
    let threshold = max_power * 0.01; // 1% do máximo
    let significant = power.iter().filter(|&&p| p > threshold).count();
    println!("\nComponententes significativas (>1% max): {}", significant);
    println!("Percentual: {:.1}%", 100.0 * significant as f64 / power.len() as f64);
}

/// Aplica filtro passa-baixas (suavização/blur)
fn apply_lowpass_filter(image: &Image2D<f64>) {
    println!("Aplicando filtro passa-baixas ideal...");

    let mut freq = fft2d(image).unwrap();

    // Cutoff em 20% da frequência máxima
    let cutoff = (image.width as f64) * 0.2;
    let filter = IdealFilter::new(
        image.width,
        image.height,
        FilterType::LowPass,
        cutoff
    );

    filter.apply(&mut freq);

    let filtered = ifft2d(&freq).unwrap();

    // Estatísticas
    let original_variance = calculate_variance(&image.magnitude());
    let filtered_variance = calculate_variance(&filtered.magnitude());

    println!("Cutoff: {:.1} pixels", cutoff);
    println!("Variância original: {:.4}", original_variance);
    println!("Variância filtrada: {:.4}", filtered_variance);
    println!("Redução: {:.1}%",
        100.0 * (1.0 - filtered_variance / original_variance));
}

/// Aplica filtro passa-altas (detecção de bordas)
fn apply_highpass_filter(image: &Image2D<f64>) {
    println!("Aplicando filtro passa-altas ideal...");

    let mut freq = fft2d(image).unwrap();

    // Cutoff em 10% (remove baixas frequências)
    let cutoff = (image.width as f64) * 0.1;
    let filter = IdealFilter::new(
        image.width,
        image.height,
        FilterType::HighPass,
        cutoff
    );

    filter.apply(&mut freq);

    let filtered = ifft2d(&freq).unwrap();

    // Calcula intensidade de bordas
    let edge_intensity: f64 = filtered.magnitude().iter()
        .map(|&m| m.abs())
        .sum::<f64>() / filtered.data.len() as f64;

    println!("Cutoff: {:.1} pixels", cutoff);
    println!("Intensidade média de bordas: {:.4}", edge_intensity);

    // Detecta pixels de borda significativos
    let threshold = edge_intensity * 2.0;
    let edge_pixels = filtered.magnitude().iter()
        .filter(|&&m| m > threshold)
        .count();

    println!("Pixels de borda detectados: {} ({:.1}%)",
        edge_pixels,
        100.0 * edge_pixels as f64 / filtered.data.len() as f64);
}

/// Aplica filtro Gaussiano (blur suave)
fn apply_gaussian_blur(image: &Image2D<f64>) {
    println!("Aplicando filtro Gaussiano...");

    let mut freq = fft2d(image).unwrap();

    // Sigma = 5.0 (blur moderado)
    let sigma = 5.0;
    let filter = GaussianFilter::new(
        image.width,
        image.height,
        sigma,
        false // low-pass
    );

    filter.apply(&mut freq);

    let filtered = ifft2d(&freq).unwrap();

    // Comparação
    let original_mean = image.magnitude().iter().sum::<f64>() / image.data.len() as f64;
    let filtered_mean = filtered.magnitude().iter().sum::<f64>() / filtered.data.len() as f64;

    println!("Sigma: {:.1}", sigma);
    println!("Média original: {:.4}", original_mean);
    println!("Média filtrada: {:.4}", filtered_mean);
    println!("Tipo: Gaussiano (sem ringing)");
}

/// Analisa potência por quadrante
fn analyze_quadrants(image: &Image2D<f64>) {
    println!("Dividindo espectro em quadrantes...");

    let mut freq = fft2d(image).unwrap();
    freq.fftshift(); // Move DC para centro

    let half_w = freq.width / 2;
    let half_h = freq.height / 2;

    // Calcula potência em cada quadrante
    let mut quadrants = vec![0.0; 4];

    for y in 0..freq.height {
        for x in 0..freq.width {
            let power = freq.get(x, y).norm_sqr();
            let q = if x < half_w {
                if y < half_h { 0 } else { 2 }
            } else {
                if y < half_h { 1 } else { 3 }
            };
            quadrants[q] += power;
        }
    }

    let total: f64 = quadrants.iter().sum();

    println!("\nDistribuição de potência por quadrante:");
    for (i, &power) in quadrants.iter().enumerate() {
        println!("  Q{}: {:.2e} ({:.1}%)",
            i + 1, power, 100.0 * power / total);
    }

    // Identifica direção dominante
    let horizontal = (quadrants[0] + quadrants[1]) / total;
    let vertical = (quadrants[0] + quadrants[2]) / total;

    println!("\nDireção dominante:");
    println!("  Horizontal: {:.1}%", horizontal * 100.0);
    println!("  Vertical: {:.1}%", vertical * 100.0);
}

/// Testa reversibilidade FFT 2D
fn test_reversibility(image: &Image2D<f64>) {
    println!("Testando FFT -> IFFT...");

    let freq = fft2d(image).unwrap();
    let recovered = ifft2d(&freq).unwrap();

    // Calcula erro
    let mut max_error: f64 = 0.0;
    let mut total_error = 0.0;

    for i in 0..image.data.len() {
        let error = (image.data[i].re - recovered.data[i].re).abs();
        max_error = max_error.max(error);
        total_error += error * error;
    }

    let rms_error = (total_error / image.data.len() as f64).sqrt();

    println!("Erro RMS: {:.2e}", rms_error);
    println!("Erro máximo: {:.2e}", max_error);

    if rms_error < 1e-10 {
        println!("✓ Reversibilidade perfeita!");
    } else {
        println!("⚠ Pequeno erro numérico (aceitável)");
    }

    // Verifica Parseval
    let energy_spatial: f64 = image.data.iter()
        .map(|c| c.norm_sqr())
        .sum();

    let energy_freq: f64 = freq.data.iter()
        .map(|c| c.norm_sqr())
        .sum::<f64>() / (image.data.len() as f64);

    let parseval_error = (energy_spatial - energy_freq).abs() / energy_spatial;

    println!("\nTeorema de Parseval:");
    println!("Energia espacial: {:.2e}", energy_spatial);
    println!("Energia frequência: {:.2e}", energy_freq);
    println!("Erro relativo: {:.2e}", parseval_error);

    if parseval_error < 1e-8 {
        println!("✓ Parseval verificado!");
    }
}

/// Calcula variância de um vetor
fn calculate_variance(data: &[f64]) -> f64 {
    let mean = data.iter().sum::<f64>() / data.len() as f64;
    let variance = data.iter()
        .map(|&x| (x - mean).powi(2))
        .sum::<f64>() / data.len() as f64;
    variance
}
