//! # 4D Convolutional Neural Network Example
//!
//! Demonstrates how to build and train a simple 4D CNN for
//! processing spatio-temporal data (x, y, z, t).

use avila_math::tensor::{Conv4DConfig, Conv4DLayer, Tensor6D};

fn main() {
    println!("🧠 4D Convolutional Neural Network Example\n");

    // Input: [batch=2, channels=1, depth=16, height=16, width=16, time=16]
    println!("Creating input tensor: [2, 1, 16, 16, 16, 16]");
    let mut input = Tensor6D::zeros([2, 1, 16, 16, 16, 16]);

    // Fill with some test data (sine wave pattern)
    for b in 0..2 {
        for d in 0..16 {
            for h in 0..16 {
                for w in 0..16 {
                    for t in 0..16 {
                        let value = ((d + h + w + t) as f64 * 0.1).sin();
                        input
                            .set([b, 0, d, h, w, t], value)
                            .expect("Failed to set value");
                    }
                }
            }
        }
    }

    println!("Input tensor created successfully!");
    println!("Input shape: {:?}\n", input.shape());

    // Create convolutional layer
    println!("Creating Conv4D layer:");
    println!("  - Input channels: 1");
    println!("  - Output channels: 8");
    println!("  - Kernel size: [3, 3, 3, 3]");
    println!("  - Stride: [1, 1, 1, 1]");

    let config = Conv4DConfig::default().with_stride([1, 1, 1, 1]);

    let mut layer = Conv4DLayer::new(1, 8, [3, 3, 3, 3], config).with_bias(8);

    // Initialize weights with Xavier initialization
    layer.init_xavier();
    println!("Weights initialized with Xavier initialization\n");

    // Forward pass
    println!("Running forward pass...");
    let output = layer.forward(&input).expect("Forward pass failed");
    println!("✓ Forward pass completed!");
    println!("Output shape: {:?}", output.shape());

    // Calculate output statistics
    let output_mean = output.data.iter().sum::<f64>() / output.data.len() as f64;
    let output_max = output
        .data
        .iter()
        .cloned()
        .fold(f64::NEG_INFINITY, f64::max);
    let output_min = output.data.iter().cloned().fold(f64::INFINITY, f64::min);

    println!("\nOutput statistics:");
    println!("  - Mean: {:.6}", output_mean);
    println!("  - Max: {:.6}", output_max);
    println!("  - Min: {:.6}", output_min);

    // Simulate gradient for backward pass
    println!("\n📉 Running backward pass...");
    let grad_output = Tensor6D::filled(output.shape, 0.01);

    let (grad_input, grad_weights, grad_bias) = layer
        .backward(&input, &grad_output)
        .expect("Backward pass failed");

    println!("✓ Backward pass completed!");
    println!("Gradient shapes:");
    println!("  - Input gradient: {:?}", grad_input.shape());
    println!("  - Weights gradient: {:?}", grad_weights.shape());
    if let Some(ref gb) = grad_bias {
        println!("  - Bias gradient: {:?}", gb.shape());
    }

    // Calculate gradient statistics
    let grad_sum: f64 = grad_weights.data.iter().sum();
    println!("\nGradient statistics:");
    println!("  - Weight gradient sum: {:.6}", grad_sum);

    println!("\n✨ 4D CNN example completed successfully!");
}
