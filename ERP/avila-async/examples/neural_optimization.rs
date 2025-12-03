//! Example: Neural Network Runtime Optimization
//!
//! Demonstrates neural networks for performance prediction

use avila_async::{Runtime, NeuralNetwork, RecurrentNetwork, sleep};
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.spawn(async {
        println!("🧠 Neural Network Runtime Optimization");
        println!("========================================\n");

        // Create feedforward network
        println!("📦 Creating feedforward neural network...");
        let nn = NeuralNetwork::new(&[3, 8, 4, 1], 0.01);
        let stats = nn.stats();
        println!("  {}", stats);
        println!("  Architecture: {}\n", nn.to_json());

        // Train on synthetic workload data
        println!("🎓 Training neural network...\n");
        let training_data = vec![
            (vec![10.0, 5.0, 2.0], vec![0.3]),   // Low load
            (vec![50.0, 25.0, 10.0], vec![0.7]), // Medium load
            (vec![90.0, 45.0, 20.0], vec![0.95]), // High load
            (vec![30.0, 15.0, 5.0], vec![0.5]),  // Medium-low load
        ];

        for epoch in 0..100 {
            let mut total_loss = 0.0;
            for (inputs, targets) in &training_data {
                let loss = nn.train(inputs, targets);
                total_loss += loss;
            }

            if epoch % 20 == 0 {
                println!("  Epoch {}: avg loss = {:.6}", epoch, total_loss / training_data.len() as f64);
                sleep(Duration::from_millis(50)).await;
            }
        }

        // Test predictions
        println!("\n🔮 Testing predictions:\n");
        let test_cases = vec![
            vec![15.0, 8.0, 3.0],
            vec![60.0, 30.0, 12.0],
            vec![85.0, 42.0, 18.0],
        ];

        for inputs in test_cases {
            let outputs = nn.predict(&inputs);
            println!("  Input: {:?} → Output: {:.3}", inputs, outputs[0]);
        }

        // Recurrent Neural Network Demo
        println!("\n🔄 Recurrent Neural Network for Time-Series\n");
        let rnn = RecurrentNetwork::new(3, 8, 0.01);

        println!("📊 Feeding sequence data...\n");
        let sequence = vec![
            vec![10.0, 5.0, 2.0],
            vec![15.0, 7.0, 3.0],
            vec![20.0, 10.0, 4.0],
            vec![25.0, 12.0, 5.0],
        ];

        for (i, data) in sequence.iter().enumerate() {
            let output = rnn.step(data);
            let avg = output.iter().sum::<f64>() / output.len() as f64;
            println!("  Step {}: {:?} → hidden avg = {:.3}", i, data, avg);
            sleep(Duration::from_millis(100)).await;
        }

        // Predict next value
        println!("\n🎯 Predicting next value in sequence:");
        let next = rnn.predict_next(&vec![30.0, 15.0, 6.0]);
        println!("  Predicted next: {:.3}", next);

        // Reset and show state change
        println!("\n🔄 Resetting RNN state...");
        rnn.reset();
        let reset_output = rnn.step(&vec![10.0, 5.0, 2.0]);
        let reset_avg = reset_output.iter().sum::<f64>() / reset_output.len() as f64;
        println!("  After reset: hidden avg = {:.3}", reset_avg);

        println!("\n✅ Neural network demo complete!");
        println!("\n💡 Networks learn from runtime patterns to optimize performance");
    });

    rt.run();
}
