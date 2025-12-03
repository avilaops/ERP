use arxis_quaternions::tensor::{Matrix, Vector};
use arxis_quaternions::tensor4d::{image_ops, Tensor4D};

fn main() {
    println!("=== Exemplos de Machine Learning com Tensores ===\n");

    // ========== BATCH DE DADOS ==========
    println!("--- Processamento em Batch ---");

    // Simula batch de imagens: (batch=8, canais=3, altura=32, largura=32)
    let batch_size = 8;
    let channels = 3;
    let height = 32;
    let width = 32;

    let mut batch = Tensor4D::from_images(batch_size, channels, height, width);

    // Preenche com dados simulados (normalmente viriamos de dataset)
    for b in 0..batch_size {
        for c in 0..channels {
            for i in 0..height {
                for j in 0..width {
                    let value = ((b * 100 + c * 50 + i + j) % 256) as f64 / 255.0;
                    batch.set([b, c, i, j], value).unwrap();
                }
            }
        }
    }

    println!("Batch de entrada: {:?}", batch.shape());
    println!("Total de pixels: {}", batch.size());

    // ========== NORMALIZAÇÃO ==========
    println!("\n--- Normalização de Dados ---");

    println!("Estatísticas antes da normalização:");
    println!("  Média: {:.6}", batch.mean());
    println!(
        "  Min: {:.6}",
        batch.data.iter().cloned().fold(f64::INFINITY, f64::min)
    );
    println!(
        "  Max: {:.6}",
        batch.data.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
    );

    let normalized = batch.batch_normalize(1e-5);

    println!("\nEstatísticas após batch normalization:");
    println!("  Média: {:.6}", normalized.mean());
    println!("  Norma: {:.6}", normalized.frobenius_norm());

    // ========== FUNÇÕES DE ATIVAÇÃO ==========
    println!("\n--- Funções de Ativação ---");

    let test_values =
        Tensor4D::from_data([1, 1, 2, 3], vec![-2.0, -1.0, 0.0, 1.0, 2.0, 3.0]).unwrap();

    println!("Valores de entrada:");
    for i in 0..2 {
        print!("  [");
        for j in 0..3 {
            print!("{:6.2}", test_values.get([0, 0, i, j]).unwrap());
        }
        println!(" ]");
    }

    // ReLU
    let relu_output = test_values.relu();
    println!("\nApós ReLU (max(0, x)):");
    for i in 0..2 {
        print!("  [");
        for j in 0..3 {
            print!("{:6.2}", relu_output.get([0, 0, i, j]).unwrap());
        }
        println!(" ]");
    }

    // Sigmoid
    let sigmoid_output = test_values.sigmoid();
    println!("\nApós Sigmoid (1/(1+e^-x)):");
    for i in 0..2 {
        print!("  [");
        for j in 0..3 {
            print!("{:6.4}", sigmoid_output.get([0, 0, i, j]).unwrap());
        }
        println!(" ]");
    }

    // Tanh
    let tanh_output = test_values.tanh();
    println!("\nApós Tanh:");
    for i in 0..2 {
        print!("  [");
        for j in 0..3 {
            print!("{:6.4}", tanh_output.get([0, 0, i, j]).unwrap());
        }
        println!(" ]");
    }

    // ========== CONVOLUÇÃO 2D ==========
    println!("\n--- Convolução 2D (Camada Convolucional) ---");

    // Entrada: (batch=1, in_channels=1, height=5, width=5)
    let mut input = Tensor4D::new(1, 1, 5, 5);
    for i in 0..5 {
        for j in 0..5 {
            input.set([0, 0, i, j], (i * 5 + j) as f64).unwrap();
        }
    }

    // Kernel: (out_channels=1, in_channels=1, kernel_h=3, kernel_w=3)
    // Detector de bordas (Sobel)
    let mut kernel = Tensor4D::new(1, 1, 3, 3);
    let sobel_values = vec![-1.0, 0.0, 1.0, -2.0, 0.0, 2.0, -1.0, 0.0, 1.0];
    for i in 0..3 {
        for j in 0..3 {
            kernel.set([0, 0, i, j], sobel_values[i * 3 + j]).unwrap();
        }
    }

    println!("Entrada 5×5:");
    for i in 0..5 {
        print!("  [");
        for j in 0..5 {
            print!("{:5.1}", input.get([0, 0, i, j]).unwrap());
        }
        println!(" ]");
    }

    println!("\nKernel Sobel 3×3:");
    for i in 0..3 {
        print!("  [");
        for j in 0..3 {
            print!("{:5.1}", kernel.get([0, 0, i, j]).unwrap());
        }
        println!(" ]");
    }

    let convolved = image_ops::conv2d(&input, &kernel, 1, 0).unwrap();
    println!("\nSaída após convolução {:?}:", convolved.shape());
    for i in 0..convolved.shape[2] {
        print!("  [");
        for j in 0..convolved.shape[3] {
            print!("{:7.1}", convolved.get([0, 0, i, j]).unwrap());
        }
        println!(" ]");
    }

    // ========== POOLING ==========
    println!("\n--- Operações de Pooling ---");

    let mut pool_input = Tensor4D::new(1, 1, 4, 4);
    for i in 0..4 {
        for j in 0..4 {
            pool_input.set([0, 0, i, j], (i * 4 + j) as f64).unwrap();
        }
    }

    println!("Entrada 4×4:");
    for i in 0..4 {
        print!("  [");
        for j in 0..4 {
            print!("{:5.1}", pool_input.get([0, 0, i, j]).unwrap());
        }
        println!(" ]");
    }

    // Max pooling
    let max_pooled = pool_input.max_pool_2d(2, 2).unwrap();
    println!("\nApós Max Pooling 2×2 (stride=2):");
    for i in 0..max_pooled.shape[2] {
        print!("  [");
        for j in 0..max_pooled.shape[3] {
            print!("{:5.1}", max_pooled.get([0, 0, i, j]).unwrap());
        }
        println!(" ]");
    }

    // Average pooling
    let avg_pooled = pool_input.avg_pool_2d(2, 2).unwrap();
    println!("\nApós Average Pooling 2×2 (stride=2):");
    for i in 0..avg_pooled.shape[2] {
        print!("  [");
        for j in 0..avg_pooled.shape[3] {
            print!("{:5.2}", avg_pooled.get([0, 0, i, j]).unwrap());
        }
        println!(" ]");
    }

    // ========== FULLY CONNECTED LAYER ==========
    println!("\n--- Camada Totalmente Conectada (Dense) ---");

    // Simula features extraídas: vetor de entrada
    let input_features = Vector::from_slice(&[0.5, 0.8, 0.3, 0.9]);
    println!("Features de entrada: {:?}", input_features.data);

    // Pesos da camada (matriz 3×4): 3 neurônios de saída, 4 entradas
    let weights = Matrix::from_data(
        [3, 4],
        vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.1, 0.2, 0.3],
    )
    .unwrap();

    // Bias
    let bias = Vector::from_slice(&[0.1, 0.2, 0.3]);

    // Forward pass: output = weights × input + bias
    let output = weights.matvec(&input_features).unwrap();
    let output_with_bias = output.add_elementwise(&bias).unwrap();

    println!(
        "\nSaída da camada (antes da ativação): {:?}",
        output_with_bias.data
    );

    // Aplica ReLU
    let activated = output_with_bias.map(|x| x.max(0.0));
    println!("Saída após ReLU: {:?}", activated.data);

    // ========== SOFTMAX PARA CLASSIFICAÇÃO ==========
    println!("\n--- Softmax (Classificação) ---");

    let logits = Vector::from_slice(&[2.0, 1.0, 0.1]);
    println!("Logits: {:?}", logits.data);

    // Softmax: exp(x_i) / sum(exp(x_j))
    let max_logit = logits
        .data
        .iter()
        .cloned()
        .fold(f64::NEG_INFINITY, f64::max);
    let exp_sum: f64 = logits.data.iter().map(|&x| (x - max_logit).exp()).sum();
    let probabilities: Vec<f64> = logits
        .data
        .iter()
        .map(|&x| (x - max_logit).exp() / exp_sum)
        .collect();

    println!("Probabilidades (softmax):");
    for (i, &p) in probabilities.iter().enumerate() {
        println!("  Classe {}: {:.4} ({:.1}%)", i, p, p * 100.0);
    }
    println!(
        "Soma das probabilidades: {:.6}",
        probabilities.iter().sum::<f64>()
    );

    // ========== GRADIENT DESCENT SIMULATION ==========
    println!("\n--- Simulação de Gradient Descent ---");

    // Função objetivo: f(x) = x² - 4x + 5
    // Derivada: f'(x) = 2x - 4

    let mut x = 0.0;
    let learning_rate = 0.1;
    let iterations = 10;

    println!("Minimizando f(x) = x² - 4x + 5");
    println!("Taxa de aprendizado: {}", learning_rate);

    for i in 0..iterations {
        let f_x = x * x - 4.0 * x + 5.0;
        let gradient = 2.0 * x - 4.0;

        println!(
            "Iteração {}: x = {:.4}, f(x) = {:.4}, ∇f = {:.4}",
            i, x, f_x, gradient
        );

        x = x - learning_rate * gradient;
    }

    println!("\nMínimo encontrado em x ≈ {:.4}", x);
    println!("Mínimo teórico em x = 2.0");

    // ========== OPERAÇÕES MATRICIAIS PARA BACKPROP ==========
    println!("\n--- Operações para Backpropagation ---");

    // Gradiente da camada
    let grad_output = Vector::from_slice(&[0.1, 0.2, 0.3]);
    println!("Gradiente da saída: {:?}", grad_output.data);

    // Gradiente em relação aos pesos: grad_W = grad_output ⊗ input
    println!("\nGradiente dos pesos (outer product):");
    for i in 0..3 {
        print!("  [");
        for j in 0..4 {
            let grad_w = grad_output.get([i]).unwrap() * input_features.get([j]).unwrap();
            print!("{:7.4}", grad_w);
        }
        println!(" ]");
    }

    // Gradiente em relação à entrada: grad_input = W^T × grad_output
    let weights_t = weights.transpose();
    let grad_input = weights_t.matvec(&grad_output).unwrap();
    println!("\nGradiente da entrada: {:?}", grad_input.data);

    // ========== DATA AUGMENTATION ==========
    println!("\n--- Data Augmentation (Redimensionamento) ---");

    let mut small_image = Tensor4D::new(1, 3, 4, 4);
    for c in 0..3 {
        for i in 0..4 {
            for j in 0..4 {
                small_image
                    .set([0, c, i, j], (c as f64 + i as f64) / 10.0)
                    .unwrap();
            }
        }
    }

    println!("Imagem original: {:?}", small_image.shape());

    // Extrai primeira imagem do batch
    let img = small_image.get_image(0).unwrap();

    // Redimensiona
    let resized = image_ops::resize_nearest(&img, 8, 8);
    println!("Imagem redimensionada: {:?}", resized.shape());

    // ========== MÉTRICAS DE AVALIAÇÃO ==========
    println!("\n--- Métricas de Avaliação ---");

    let predictions = Vector::from_slice(&[0.9, 0.1, 0.8, 0.3, 0.7]);
    let targets = Vector::from_slice(&[1.0, 0.0, 1.0, 0.0, 1.0]);

    // MSE (Mean Squared Error)
    let mut mse = 0.0;
    for i in 0..5 {
        let diff = predictions.get([i]).unwrap() - targets.get([i]).unwrap();
        mse += diff * diff;
    }
    mse /= 5.0;

    println!("Predições: {:?}", predictions.data);
    println!("Alvos: {:?}", targets.data);
    println!("MSE (Mean Squared Error): {:.4}", mse);
    println!("RMSE (Root Mean Squared Error): {:.4}", mse.sqrt());

    // Acurácia (threshold 0.5)
    let mut correct = 0;
    for i in 0..5 {
        let pred_class = if predictions.get([i]).unwrap() > 0.5 {
            1.0
        } else {
            0.0
        };
        if pred_class == targets.get([i]).unwrap() {
            correct += 1;
        }
    }
    let accuracy = correct as f64 / 5.0;
    println!("Acurácia: {:.1}%", accuracy * 100.0);

    println!("\n=== Fim dos Exemplos de Machine Learning ===");
}
