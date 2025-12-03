//! Autograd Example: Training a Simple Neural Network
//!
//! Demonstrates automatic differentiation for gradient descent.

use avila_math::autograd::{ops, Tape};

fn main() {
    println!("🧠 Autograd: Training Neural Network with Backpropagation\n");

    // Training data: XOR problem
    let training_data = vec![
        ([0.0, 0.0], 0.0),
        ([0.0, 1.0], 1.0),
        ([1.0, 0.0], 1.0),
        ([1.0, 1.0], 0.0),
    ];

    // Initialize weights randomly (simplified - normally use He initialization)
    let mut w1_11 = 0.5;
    let mut w1_12 = -0.3;
    let mut w1_21 = 0.4;
    let mut w1_22 = 0.2;
    let mut w2_1 = 0.6;
    let mut w2_2 = -0.4;
    let mut b1_1 = 0.1;
    let mut b1_2 = -0.1;
    let mut b2 = 0.0;

    let learning_rate = 0.5;
    let epochs = 1000;

    println!("Training XOR network for {} epochs...", epochs);

    for epoch in 0..epochs {
        let mut total_loss = 0.0;

        for (inputs, target) in &training_data {
            let mut tape = Tape::new();

            // Create variables for inputs
            let x1 = tape.var(inputs[0]);
            let x2 = tape.var(inputs[1]);

            // Weights as variables
            let w1_11_var = tape.var(w1_11);
            let w1_12_var = tape.var(w1_12);
            let w1_21_var = tape.var(w1_21);
            let w1_22_var = tape.var(w1_22);
            let w2_1_var = tape.var(w2_1);
            let w2_2_var = tape.var(w2_2);
            let b1_1_var = tape.var(b1_1);
            let b1_2_var = tape.var(b1_2);
            let b2_var = tape.var(b2);

            // Forward pass: Hidden layer
            let x1_w11 = ops::mul(&mut tape, &x1, &w1_11_var);
            let x2_w12 = ops::mul(&mut tape, &x2, &w1_12_var);
            let h1_sum = ops::add(&mut tape, &x1_w11, &x2_w12);
            let h1_z = ops::add(&mut tape, &h1_sum, &b1_1_var);
            let h1 = ops::tanh(&mut tape, &h1_z);

            let x1_w21 = ops::mul(&mut tape, &x1, &w1_21_var);
            let x2_w22 = ops::mul(&mut tape, &x2, &w1_22_var);
            let h2_sum = ops::add(&mut tape, &x1_w21, &x2_w22);
            let h2_z = ops::add(&mut tape, &h2_sum, &b1_2_var);
            let h2 = ops::tanh(&mut tape, &h2_z);

            // Output layer
            let h1_w1 = ops::mul(&mut tape, &h1, &w2_1_var);
            let h2_w2 = ops::mul(&mut tape, &h2, &w2_2_var);
            let out_sum = ops::add(&mut tape, &h1_w1, &h2_w2);
            let out_z = ops::add(&mut tape, &out_sum, &b2_var);
            let output = ops::sigmoid(&mut tape, &out_z);

            // Loss: Mean Squared Error
            let target_var = tape.var(*target);
            let diff = ops::sub(&mut tape, &output, &target_var);
            let loss = ops::mul(&mut tape, &diff, &diff);

            total_loss += loss.value();

            // Backward pass
            tape.backward(&loss);

            // Update weights using gradient descent
            w1_11 -= learning_rate * tape.grad(&w1_11_var);
            w1_12 -= learning_rate * tape.grad(&w1_12_var);
            w1_21 -= learning_rate * tape.grad(&w1_21_var);
            w1_22 -= learning_rate * tape.grad(&w1_22_var);
            w2_1 -= learning_rate * tape.grad(&w2_1_var);
            w2_2 -= learning_rate * tape.grad(&w2_2_var);
            b1_1 -= learning_rate * tape.grad(&b1_1_var);
            b1_2 -= learning_rate * tape.grad(&b1_2_var);
            b2 -= learning_rate * tape.grad(&b2_var);
        }

        if epoch % 100 == 0 {
            println!(
                "Epoch {}: Loss = {:.6}",
                epoch,
                total_loss / training_data.len() as f64
            );
        }
    }

    println!("\n✅ Training complete!\n");
    println!("Testing XOR predictions:");

    for (inputs, target) in &training_data {
        let mut tape = Tape::new();
        let x1 = tape.var(inputs[0]);
        let x2 = tape.var(inputs[1]);

        let w1_11_var = tape.var(w1_11);
        let w1_12_var = tape.var(w1_12);
        let w1_21_var = tape.var(w1_21);
        let w1_22_var = tape.var(w1_22);
        let w2_1_var = tape.var(w2_1);
        let w2_2_var = tape.var(w2_2);
        let b1_1_var = tape.var(b1_1);
        let b1_2_var = tape.var(b1_2);
        let b2_var = tape.var(b2);

        let x1_w11 = ops::mul(&mut tape, &x1, &w1_11_var);
        let x2_w12 = ops::mul(&mut tape, &x2, &w1_12_var);
        let h1_sum = ops::add(&mut tape, &x1_w11, &x2_w12);
        let h1_z = ops::add(&mut tape, &h1_sum, &b1_1_var);
        let h1 = ops::tanh(&mut tape, &h1_z);

        let x1_w21 = ops::mul(&mut tape, &x1, &w1_21_var);
        let x2_w22 = ops::mul(&mut tape, &x2, &w1_22_var);
        let h2_sum = ops::add(&mut tape, &x1_w21, &x2_w22);
        let h2_z = ops::add(&mut tape, &h2_sum, &b1_2_var);
        let h2 = ops::tanh(&mut tape, &h2_z);

        let h1_w1 = ops::mul(&mut tape, &h1, &w2_1_var);
        let h2_w2 = ops::mul(&mut tape, &h2, &w2_2_var);
        let out_sum = ops::add(&mut tape, &h1_w1, &h2_w2);
        let out_z = ops::add(&mut tape, &out_sum, &b2_var);
        let output = ops::sigmoid(&mut tape, &out_z);

        println!(
            "  Input: [{:.0}, {:.0}] → Output: {:.4} (Target: {:.0})",
            inputs[0],
            inputs[1],
            output.value(),
            target
        );
    }

    println!("\n🎯 XOR problem solved with autograd!");
}
