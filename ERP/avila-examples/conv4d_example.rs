/// Exemplo Completo de Convolução 4D para Redes Neurais e Processamento Espaço-Temporal
///
/// Demonstra:
/// 1. Conv4D básica para dados espaço-temporais (x, y, z, t)
/// 2. Rede neural 4D-convolucional simples
/// 3. Processamento de vídeo 3D + tempo
/// 4. Max Pooling e Average Pooling 4D
/// 5. Grouped Convolution
/// 6. Aplicação prática: detecção de eventos em dados volumétricos temporais
use avila_math::tensor::{avg_pool4d, conv4d, max_pool4d, Conv4DConfig, Conv4DLayer, Tensor};
use std::time::Instant;

// Tensores para Conv4D
type Tensor4D = Tensor<4>;
type Tensor6D = Tensor<6>;

fn main() {
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║  CONVOLUÇÃO 4D - Redes Neurais e Processamento Espaço-Temporal  ║");
    println!("╚══════════════════════════════════════════════════════════════╝\n");

    // Exemplo 1: Conv4D Básica
    example_1_basic_conv4d();

    // Exemplo 2: Pooling 4D
    example_2_pooling_4d();

    // Exemplo 3: Rede Neural 4D-Convolucional
    example_3_cnn_4d();

    // Exemplo 4: Grouped Convolution
    example_4_grouped_convolution();

    // Exemplo 5: Aplicação Prática - Detecção de Eventos
    example_5_event_detection();

    // Exemplo 6: Benchmark de Performance
    example_6_performance_benchmark();

    println!("\n✅ Todos os exemplos de Conv4D executados com sucesso!");
}

fn example_1_basic_conv4d() {
    println!("┌─────────────────────────────────────────────────────────────┐");
    println!("│  EXEMPLO 1: Convolução 4D Básica                           │");
    println!("└─────────────────────────────────────────────────────────────┘\n");

    // Cria input: [batch=1, channels=2, 8x8x8x8]
    println!("📦 Criando tensor de entrada 4D...");
    let mut input = Tensor6D::zeros([1, 2, 8, 8, 8, 8]);

    // Preenche com padrão conhecido
    for c in 0..2 {
        for i in 0..8 {
            for j in 0..8 {
                for k in 0..8 {
                    for l in 0..8 {
                        let value = (i + j + k + l) as f64 / 32.0 + c as f64 * 0.5;
                        input.set([0, c, i, j, k, l], value).unwrap();
                    }
                }
            }
        }
    }

    println!("  ✓ Input: [1, 2, 8, 8, 8, 8]");
    println!("  ✓ Valores: gradiente espacial de 0.0 a 1.0");

    // Cria kernel: [out_channels=4, in_channels=2, 3x3x3x3]
    println!("\n🔧 Criando kernel 4D...");
    let mut kernel = Tensor6D::zeros([4, 2, 3, 3, 3, 3]);

    // Preenche kernel com filtro de detecção de borda
    for oc in 0..4 {
        for ic in 0..2 {
            for i in 0..3 {
                for j in 0..3 {
                    for k in 0..3 {
                        for l in 0..3 {
                            // Centro do kernel tem peso positivo, bordas negativo
                            let weight = if i == 1 && j == 1 && k == 1 && l == 1 {
                                8.0
                            } else {
                                -1.0
                            };
                            kernel.set([oc, ic, i, j, k, l], weight).unwrap();
                        }
                    }
                }
            }
        }
    }

    println!("  ✓ Kernel: [4, 2, 3, 3, 3, 3]");
    println!("  ✓ Tipo: filtro Laplaciano 4D (detecção de bordas)");

    // Aplica convolução
    println!("\n🚀 Aplicando convolução 4D...");
    let start = Instant::now();
    let config = Conv4DConfig::default();
    let output = conv4d(&input, &kernel, None, &config).unwrap();
    let duration = start.elapsed();

    println!("  ✓ Output: {:?}", output.shape);
    println!("  ✓ Tempo: {:.2?}", duration);

    // Mostra algumas estatísticas
    let max_val = output
        .data
        .iter()
        .copied()
        .fold(f64::NEG_INFINITY, f64::max);
    let min_val = output.data.iter().copied().fold(f64::INFINITY, f64::min);
    let mean_val = output.data.iter().sum::<f64>() / output.data.len() as f64;

    println!("\n📊 Estatísticas do output:");
    println!("  • Max:  {:.4}", max_val);
    println!("  • Min:  {:.4}", min_val);
    println!("  • Mean: {:.4}", mean_val);
}

fn example_2_pooling_4d() {
    println!("\n\n┌─────────────────────────────────────────────────────────────┐");
    println!("│  EXEMPLO 2: Max Pooling e Average Pooling 4D               │");
    println!("└─────────────────────────────────────────────────────────────┘\n");

    // Cria input pequeno para visualização
    let mut input = Tensor6D::zeros([1, 1, 8, 8, 8, 8]);

    // Preenche com valores conhecidos
    println!("📦 Criando tensor de entrada 8x8x8x8...");
    for i in 0..8 {
        for j in 0..8 {
            for k in 0..8 {
                for l in 0..8 {
                    let value = (i * j * k * l) as f64 / 100.0;
                    input.set([0, 0, i, j, k, l], value).unwrap();
                }
            }
        }
    }

    // Max Pooling
    println!("\n🔥 Aplicando Max Pooling 4D (kernel 2x2x2x2)...");
    let start = Instant::now();
    let max_pooled = max_pool4d(&input, [2, 2, 2, 2], None).unwrap();
    let duration = start.elapsed();

    println!("  ✓ Output: {:?}", max_pooled.shape);
    println!("  ✓ Tempo: {:.2?}", duration);
    println!("  ✓ Redução: 8³ → 4³ (redução de 16x no volume)");

    // Average Pooling
    println!("\n💧 Aplicando Average Pooling 4D (kernel 2x2x2x2)...");
    let start = Instant::now();
    let avg_pooled = avg_pool4d(&input, [2, 2, 2, 2], None).unwrap();
    let duration = start.elapsed();

    println!("  ✓ Output: {:?}", avg_pooled.shape);
    println!("  ✓ Tempo: {:.2?}", duration);

    // Comparação
    println!("\n📊 Comparação Max vs Avg Pooling:");
    let max_sum: f64 = max_pooled.data.iter().sum();
    let avg_sum: f64 = avg_pooled.data.iter().sum();

    println!("  • Soma (Max Pooling): {:.4}", max_sum);
    println!("  • Soma (Avg Pooling): {:.4}", avg_sum);
    println!(
        "  • Diferença: {:.2}%",
        ((max_sum - avg_sum) / avg_sum * 100.0).abs()
    );
}

fn example_3_cnn_4d() {
    println!("\n\n┌─────────────────────────────────────────────────────────────┐");
    println!("│  EXEMPLO 3: Rede Neural 4D-Convolucional Simples           │");
    println!("└─────────────────────────────────────────────────────────────┘\n");

    println!("🧠 Construindo CNN 4D com 3 camadas...");

    // Layer 1: Conv4D (2 → 8 canais)
    let mut layer1 = Conv4DLayer::new(2, 8, [3, 3, 3, 3], Conv4DConfig::default()).with_bias(8);
    layer1.init_he();
    println!("  ✓ Layer 1: Conv4D(2→8, kernel=3³)");

    // Layer 2: Conv4D (8 → 16 canais)
    let mut layer2 = Conv4DLayer::new(8, 16, [3, 3, 3, 3], Conv4DConfig::default()).with_bias(16);
    layer2.init_he();
    println!("  ✓ Layer 2: Conv4D(8→16, kernel=3³)");

    // Layer 3: Conv4D (16 → 4 canais) - Output layer
    let mut layer3 = Conv4DLayer::new(16, 4, [3, 3, 3, 3], Conv4DConfig::default()).with_bias(4);
    layer3.init_xavier();
    println!("  ✓ Layer 3: Conv4D(16→4, kernel=3³)");

    // Input: [batch=2, channels=2, 12x12x12x12]
    println!("\n📦 Criando batch de entrada...");
    let input = Tensor6D::zeros([2, 2, 12, 12, 12, 12]);
    println!("  ✓ Input shape: [2, 2, 12, 12, 12, 12]");
    println!(
        "  ✓ Tamanho: {:.2} MB",
        input.data.len() as f64 * 8.0 / 1_000_000.0
    );

    // Forward pass
    println!("\n🚀 Executando forward pass...");
    let start = Instant::now();

    println!("  → Layer 1...");
    let x1 = layer1.forward(&input).unwrap();
    println!("    Output: {:?}", x1.shape);

    println!("  → Max Pool 4D...");
    let x1_pooled = max_pool4d(&x1, [2, 2, 2, 2], None).unwrap();
    println!("    Output: {:?}", x1_pooled.shape);

    println!("  → Layer 2...");
    let x2 = layer2.forward(&x1_pooled).unwrap();
    println!("    Output: {:?}", x2.shape);

    println!("  → Layer 3...");
    let x3 = layer3.forward(&x2).unwrap();
    println!("    Output: {:?}", x3.shape);

    let total_duration = start.elapsed();

    println!("\n⏱️  Tempo total: {:.2?}", total_duration);
    println!("  ✓ Forward pass completo!");

    // Estatísticas do output
    let output_mean = x3.data.iter().sum::<f64>() / x3.data.len() as f64;
    println!("\n📊 Output da rede:");
    println!("  • Shape: {:?}", x3.shape);
    println!("  • Mean activation: {:.6}", output_mean);
    println!("  • Total elements: {}", x3.data.len());
}

fn example_4_grouped_convolution() {
    println!("\n\n┌─────────────────────────────────────────────────────────────┐");
    println!("│  EXEMPLO 4: Grouped Convolution (Depthwise Separable)      │");
    println!("└─────────────────────────────────────────────────────────────┘\n");

    println!("🔀 Grouped Convolution permite reduzir parâmetros e FLOPs\n");

    // Input: [1 batch, 8 channels, 8x8x8x8]
    let input = Tensor6D::zeros([1, 8, 8, 8, 8, 8]);
    println!("📦 Input: [1, 8, 8, 8, 8, 8]");

    // Convolução normal: 8 → 16 canais
    let kernel_normal = Tensor6D::zeros([16, 8, 3, 3, 3, 3]);
    let params_normal = 16 * 8 * 3 * 3 * 3 * 3;
    println!("\n📊 Convolução Normal:");
    println!("  • Kernel: [16, 8, 3, 3, 3, 3]");
    println!("  • Parâmetros: {}", params_normal);

    let start = Instant::now();
    let _output_normal = conv4d(&input, &kernel_normal, None, &Conv4DConfig::default()).unwrap();
    let time_normal = start.elapsed();
    println!("  • Tempo: {:.2?}", time_normal);

    // Grouped convolution: 8 → 16 canais com 4 grupos
    let config_grouped = Conv4DConfig::default().with_groups(4);
    let kernel_grouped = Tensor6D::zeros([16, 2, 3, 3, 3, 3]); // 8/4 = 2 channels per group
    let params_grouped = 16 * 2 * 3 * 3 * 3 * 3;

    println!("\n📊 Grouped Convolution (4 grupos):");
    println!("  • Kernel: [16, 2, 3, 3, 3, 3]");
    println!("  • Parâmetros: {}", params_grouped);
    println!(
        "  • Redução: {:.1}x menos parâmetros",
        params_normal as f64 / params_grouped as f64
    );

    let start = Instant::now();
    let _output_grouped = conv4d(&input, &kernel_grouped, None, &config_grouped).unwrap();
    let time_grouped = start.elapsed();
    println!("  • Tempo: {:.2?}", time_grouped);
    println!(
        "  • Speedup: {:.2}x mais rápido",
        time_normal.as_secs_f64() / time_grouped.as_secs_f64()
    );
}

fn example_5_event_detection() {
    println!("\n\n┌─────────────────────────────────────────────────────────────┐");
    println!("│  EXEMPLO 5: Detecção de Eventos em Dados Volumétricos      │");
    println!("└─────────────────────────────────────────────────────────────┘\n");

    println!("🎯 Aplicação: Detectar eventos espaço-temporais em simulações 4D\n");

    // Simula dados volumétricos temporais (ex: simulação de fluidos)
    println!("📦 Criando simulação 4D (10x10x10x20)...");
    println!("   Dimensões: [x=10, y=10, z=10, t=20 frames]");

    let mut data = Tensor6D::zeros([1, 1, 10, 10, 10, 20]);

    // Injeta "evento" em posição específica
    for t in 5..15 {
        for i in 3..7 {
            for j in 3..7 {
                for k in 3..7 {
                    let intensity = 1.0 - ((t - 10) as f64 / 5.0).abs();
                    data.set([0, 0, i, j, k, t], intensity).unwrap();
                }
            }
        }
    }
    println!("   ✓ Evento injetado em t=5-15, posição (3-7, 3-7, 3-7)");

    // Detector de eventos: Conv4D com kernel temporal
    println!("\n🔍 Criando detector de eventos 4D...");
    let mut detector = Tensor6D::zeros([1, 1, 3, 3, 3, 5]); // kernel 3x3x3x5 (5 frames temporais)

    // Kernel de detecção: diferença temporal
    for i in 0..3 {
        for j in 0..3 {
            for k in 0..3 {
                detector.set([0, 0, i, j, k, 0], -1.0).unwrap(); // frame anterior
                detector.set([0, 0, i, j, k, 2], 1.0).unwrap(); // frame posterior
            }
        }
    }
    println!("   ✓ Kernel de diferença temporal criado");

    // Aplica detecção
    println!("\n🚀 Detectando eventos...");
    let config = Conv4DConfig::default();
    let detected = conv4d(&data, &detector, None, &config).unwrap();

    println!("   ✓ Shape de saída: {:?}", detected.shape);

    // Analisa resultados
    let max_response = detected
        .data
        .iter()
        .copied()
        .fold(f64::NEG_INFINITY, f64::max);
    let events_detected = detected.data.iter().filter(|&&x| x.abs() > 0.5).count();

    println!("\n📊 Resultados da detecção:");
    println!("   • Resposta máxima: {:.4}", max_response);
    println!("   • Voxels com eventos: {}", events_detected);
    println!(
        "   • Taxa de detecção: {:.2}%",
        events_detected as f64 / detected.data.len() as f64 * 100.0
    );
}

fn example_6_performance_benchmark() {
    println!("\n\n┌─────────────────────────────────────────────────────────────┐");
    println!("│  EXEMPLO 6: Benchmark de Performance                       │");
    println!("└─────────────────────────────────────────────────────────────┘\n");

    println!("⏱️  Testando diferentes tamanhos de entrada...\n");

    let test_cases = vec![
        ("Pequeno", [1, 2, 4, 4, 4, 4], [4, 2, 3, 3, 3, 3]),
        ("Médio", [1, 4, 8, 8, 8, 8], [8, 4, 3, 3, 3, 3]),
        ("Grande", [2, 8, 10, 10, 10, 10], [16, 8, 3, 3, 3, 3]),
    ];

    println!("┌─────────┬────────────────────┬────────────────────┬──────────┐");
    println!("│  Caso   │  Input Shape       │  Kernel Shape      │  Tempo   │");
    println!("├─────────┼────────────────────┼────────────────────┼──────────┤");

    for (name, input_shape, kernel_shape) in test_cases {
        let input = Tensor6D::zeros(input_shape);
        let kernel = Tensor6D::zeros(kernel_shape);

        let start = Instant::now();
        let _output = conv4d(&input, &kernel, None, &Conv4DConfig::default()).unwrap();
        let duration = start.elapsed();

        println!(
            "│ {:7} │ {:?} │ {:?} │ {:7.2?} │",
            name, input_shape, kernel_shape, duration
        );
    }

    println!("└─────────┴────────────────────┴────────────────────┴──────────┘");

    println!("\n💡 Observações:");
    println!("   • Conv4D usa paralelização com Rayon");
    println!("   • Performance escala com número de cores disponíveis");
    println!("   • Memória é o principal gargalo para tensores grandes");
}
