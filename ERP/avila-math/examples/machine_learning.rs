//! Machine Learning com avila-math
//!
//! Demonstra Conv4D, backpropagation, gradientes

use avila_math::tensor::{Conv4DLayer, Conv4DConfig, Tensor6D};
use avila_math::linalg::{svd, eigenvalues};
use avila_math::calculus::gradient_4d;

fn main() {
    println!("🧠 Machine Learning com avila-math\n");

    // 1. Conv4D Neural Network
    println!("1️⃣  Rede Neural Conv4D");
    let mut layer = Conv4DLayer::new(
        3,              // RGB channels
        16,             // output features
        [3, 3, 3, 3],   // 4D kernel
        Conv4DConfig {
            stride: [1, 1, 1, 1],
            padding: [1, 1, 1, 1],
            dilation: [1, 1, 1, 1],
            groups: 1,
        }
    ).with_bias(16);

    // Xavier initialization
    layer.init_xavier();
    println!("✅ Layer criado: 3→16 canais, kernel 3x3x3x3");

    // Forward pass
    let batch_size = 2;
    let input = Tensor6D::filled(
        [batch_size, 3, 8, 8, 8, 8],
        0.1
    );

    let output = layer.forward(&input).unwrap();
    println!("✅ Forward: {:?} → {:?}", input.shape, output.shape);

    // Backward pass (training)
    let grad_output = Tensor6D::filled(output.shape, 0.01);
    let (grad_input, grad_weights, grad_bias) =
        layer.backward(&input, &grad_output).unwrap();

    println!("✅ Backward: grad_weights shape = {:?}", grad_weights.shape);
    println!("   Gradientes calculados para backpropagation\n");

    // 2. SVD para PCA
    println!("2️⃣  PCA com SVD");
    use avila_math::tensor::Matrix;

    // Dataset 100x5 (100 samples, 5 features)
    let mut data = vec![0.0; 500];
    for i in 0..500 {
        data[i] = (i as f64 * 0.1).sin() + (i as f64 * 0.01);
    }
    let matrix = Matrix::from_data([100, 5], data).unwrap();

    let (u, s, vt) = svd(&matrix).unwrap();
    println!("✅ SVD: U={:?}, Σ={} valores, Vᵀ={:?}",
        u.shape, s.len(), vt.shape);

    println!("   Singular values: {:?}", &s[..3.min(s.len())]);
    println!("   Variance explained: {:.1}%\n",
        (s[0] / s.iter().sum::<f64>()) * 100.0);

    // 3. Eigenvalues para análise
    println!("3️⃣  Análise de Autovalores");
    let covariance = Matrix::from_data([3, 3], vec![
        4.0, 2.0, 1.0,
        2.0, 3.0, 1.0,
        1.0, 1.0, 2.0,
    ]).unwrap();

    let eigenvals = eigenvalues(&covariance).unwrap();
    println!("✅ Autovalores: {:?}", eigenvals);
    println!("   Maior autovalor: {:.3} (componente principal)\n",
        eigenvals[0]);

    // 4. Gradient Descent 4D
    println!("4️⃣  Gradient Descent em 4D");

    // Loss function: f(w) = w₀² + w₁² + w₂² + w₃²
    let loss = |w: &[f64]| {
        w[0]*w[0] + w[1]*w[1] + w[2]*w[2] + w[3]*w[3]
    };

    let mut weights = [1.0, 2.0, 3.0, 4.0];
    let learning_rate = 0.1;

    println!("   Iteração 0: w={:?}, loss={:.4}", weights, loss(&weights));

    for iter in 1..=5 {
        // Calcular gradiente
        let grad = gradient_4d(&loss, &weights, 1e-7);

        // Update: w = w - lr * ∇f
        for i in 0..4 {
            weights[i] -= learning_rate * grad[i];
        }

        println!("   Iteração {}: w=[{:.3}, {:.3}, {:.3}, {:.3}], loss={:.4}",
            iter, weights[0], weights[1], weights[2], weights[3], loss(&weights));
    }
    println!("   ✅ Convergindo para mínimo [0, 0, 0, 0]\n");

    // 5. Batch Normalization (simulado)
    println!("5️⃣  Batch Normalization");
    let batch = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];

    let mean = batch.iter().sum::<f64>() / batch.len() as f64;
    let variance = batch.iter()
        .map(|x| (x - mean).powi(2))
        .sum::<f64>() / batch.len() as f64;
    let std = variance.sqrt();

    let normalized: Vec<f64> = batch.iter()
        .map(|x| (x - mean) / (std + 1e-5))
        .collect();

    println!("   Original: {:?}", &batch[..4]);
    println!("   Mean={:.2}, Std={:.2}", mean, std);
    println!("   Normalized: [{:.2}, {:.2}, {:.2}, {:.2}]",
        normalized[0], normalized[1], normalized[2], normalized[3]);
    println!("   ✅ Batch normalizado (μ≈0, σ≈1)\n");

    println!("🎉 Machine Learning demo completa!");
}
