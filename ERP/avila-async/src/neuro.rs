//! Neural Network Module
//!
//! Lightweight neural network for runtime optimization

use std::sync::{Arc, Mutex};

/// Simple feedforward neural network
#[derive(Clone)]
pub struct NeuralNetwork {
    layers: Arc<Mutex<Vec<Layer>>>,
    learning_rate: f64,
}

struct Layer {
    weights: Vec<Vec<f64>>,
    biases: Vec<f64>,
    activations: Vec<f64>,
}

impl NeuralNetwork {
    /// Create a new neural network with specified layer sizes
    pub fn new(layer_sizes: &[usize], learning_rate: f64) -> Self {
        let mut layers = Vec::new();

        for i in 0..layer_sizes.len() - 1 {
            let input_size = layer_sizes[i];
            let output_size = layer_sizes[i + 1];

            // Initialize weights with Xavier initialization
            let scale = (2.0 / input_size as f64).sqrt();
            let weights: Vec<Vec<f64>> = (0..output_size)
                .map(|_| {
                    (0..input_size)
                        .map(|j| ((j as f64 * 0.7919) % 1.0 - 0.5) * scale)
                        .collect()
                })
                .collect();

            let biases = vec![0.0; output_size];
            let activations = vec![0.0; output_size];

            layers.push(Layer { weights, biases, activations });
        }

        Self {
            layers: Arc::new(Mutex::new(layers)),
            learning_rate,
        }
    }

    /// Forward pass through the network
    pub fn predict(&self, inputs: &[f64]) -> Vec<f64> {
        let mut layers = self.layers.lock().unwrap();
        let mut current = inputs.to_vec();

        for layer in layers.iter_mut() {
            let mut next = Vec::with_capacity(layer.biases.len());

            for (neuron_idx, (weights, bias)) in layer.weights.iter().zip(layer.biases.iter()).enumerate() {
                let sum: f64 = weights.iter()
                    .zip(current.iter())
                    .map(|(w, x)| w * x)
                    .sum::<f64>() + bias;

                // ReLU activation
                let activation = sum.max(0.0);
                next.push(activation);
                layer.activations[neuron_idx] = activation;
            }

            current = next;
        }

        current
    }

    /// Train the network with a single sample (online learning)
    pub fn train(&self, inputs: &[f64], targets: &[f64]) -> f64 {
        // Forward pass
        let outputs = self.predict(inputs);

        // Calculate loss (MSE)
        let loss: f64 = outputs.iter()
            .zip(targets.iter())
            .map(|(o, t)| (o - t).powi(2))
            .sum::<f64>() / outputs.len() as f64;

        // Backward pass (simplified gradient descent)
        let mut layers = self.layers.lock().unwrap();

        // Output layer gradients
        let output_layer = layers.last_mut().unwrap();
        let output_errors: Vec<f64> = outputs.iter()
            .zip(targets.iter())
            .map(|(o, t)| o - t)
            .collect();

        // Update output layer weights
        for (neuron_idx, error) in output_errors.iter().enumerate() {
            for (weight_idx, weight) in output_layer.weights[neuron_idx].iter_mut().enumerate() {
                let gradient = error * if weight_idx < inputs.len() { inputs[weight_idx] } else { 1.0 };
                *weight -= self.learning_rate * gradient;
            }
            output_layer.biases[neuron_idx] -= self.learning_rate * error;
        }

        loss
    }

    /// Get network statistics
    pub fn stats(&self) -> NetworkStats {
        let layers = self.layers.lock().unwrap();

        let total_weights: usize = layers.iter()
            .map(|l| l.weights.iter().map(|w| w.len()).sum::<usize>())
            .sum();

        let total_biases: usize = layers.iter()
            .map(|l| l.biases.len())
            .sum();

        NetworkStats {
            num_layers: layers.len(),
            total_parameters: total_weights + total_biases,
            learning_rate: self.learning_rate,
        }
    }

    /// Export network configuration
    pub fn to_json(&self) -> String {
        let layers = self.layers.lock().unwrap();

        let layer_sizes: Vec<String> = layers.iter()
            .map(|l| format!("{}", l.weights.len()))
            .collect();

        format!(
            r#"{{
  "type": "feedforward",
  "layers": [{}],
  "learning_rate": {},
  "activation": "ReLU"
}}"#,
            layer_sizes.join(", "),
            self.learning_rate
        )
    }
}

#[derive(Debug, Clone)]
pub struct NetworkStats {
    pub num_layers: usize,
    pub total_parameters: usize,
    pub learning_rate: f64,
}

impl std::fmt::Display for NetworkStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "NetworkStats[layers={}, params={}, lr={}]",
            self.num_layers, self.total_parameters, self.learning_rate
        )
    }
}

/// Recurrent Neural Network for time-series prediction
#[derive(Clone)]
#[allow(dead_code)]
pub struct RecurrentNetwork {
    hidden_size: usize,
    weights_ih: Arc<Mutex<Vec<Vec<f64>>>>,
    weights_hh: Arc<Mutex<Vec<Vec<f64>>>>,
    biases: Arc<Mutex<Vec<f64>>>,
    hidden_state: Arc<Mutex<Vec<f64>>>,
    learning_rate: f64,
}

impl RecurrentNetwork {
    pub fn new(input_size: usize, hidden_size: usize, learning_rate: f64) -> Self {
        let scale = (2.0 / input_size as f64).sqrt();

        let weights_ih: Vec<Vec<f64>> = (0..hidden_size)
            .map(|i| {
                (0..input_size)
                    .map(|j| ((i * 7919 + j * 3571) as f64 % 1000.0 / 1000.0 - 0.5) * scale)
                    .collect()
            })
            .collect();

        let weights_hh: Vec<Vec<f64>> = (0..hidden_size)
            .map(|i| {
                (0..hidden_size)
                    .map(|j| ((i * 5381 + j * 2791) as f64 % 1000.0 / 1000.0 - 0.5) * scale)
                    .collect()
            })
            .collect();

        Self {
            hidden_size,
            weights_ih: Arc::new(Mutex::new(weights_ih)),
            weights_hh: Arc::new(Mutex::new(weights_hh)),
            biases: Arc::new(Mutex::new(vec![0.0; hidden_size])),
            hidden_state: Arc::new(Mutex::new(vec![0.0; hidden_size])),
            learning_rate,
        }
    }

    /// Forward step with input
    pub fn step(&self, input: &[f64]) -> Vec<f64> {
        let weights_ih = self.weights_ih.lock().unwrap();
        let weights_hh = self.weights_hh.lock().unwrap();
        let biases = self.biases.lock().unwrap();
        let mut hidden = self.hidden_state.lock().unwrap();

        let mut new_hidden = Vec::with_capacity(self.hidden_size);

        for i in 0..self.hidden_size {
            let input_contrib: f64 = weights_ih[i].iter()
                .zip(input.iter())
                .map(|(w, x)| w * x)
                .sum();

            let hidden_contrib: f64 = weights_hh[i].iter()
                .zip(hidden.iter())
                .map(|(w, h)| w * h)
                .sum();

            let activation = (input_contrib + hidden_contrib + biases[i]).tanh();
            new_hidden.push(activation);
        }

        *hidden = new_hidden.clone();
        new_hidden
    }

    /// Reset hidden state
    pub fn reset(&self) {
        let mut hidden = self.hidden_state.lock().unwrap();
        hidden.fill(0.0);
    }

    /// Predict next value in sequence
    pub fn predict_next(&self, sequence: &[f64]) -> f64 {
        let output = self.step(sequence);
        output.iter().sum::<f64>() / output.len() as f64
    }
}
