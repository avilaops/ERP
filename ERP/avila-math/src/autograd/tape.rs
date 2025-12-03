//! Tape-based automatic differentiation

use super::variable::Variable;
use std::collections::HashMap;

/// Operation recorded on the tape
#[derive(Debug, Clone)]
pub(crate) enum Operation {
    /// No operation (leaf variable)
    Leaf,
    /// Addition: out = a + b
    Add { a: Variable, b: Variable },
    /// Subtraction: out = a - b
    Sub { a: Variable, b: Variable },
    /// Multiplication: out = a * b
    Mul { a: Variable, b: Variable },
    /// Division: out = a / b
    Div { a: Variable, b: Variable },
    /// Power: out = a^b
    Pow { a: Variable, b: f64 },
    /// Exponential: out = exp(a)
    Exp { a: Variable },
    /// Natural log: out = ln(a)
    Log { a: Variable },
    /// Sine: out = sin(a)
    Sin { a: Variable },
    /// Cosine: out = cos(a)
    Cos { a: Variable },
    /// Hyperbolic tangent: out = tanh(a)
    Tanh { a: Variable },
    /// ReLU: out = max(0, a)
    Relu { a: Variable },
    /// Sigmoid: out = 1 / (1 + exp(-a))
    Sigmoid { a: Variable },
}

/// Computational tape for reverse-mode automatic differentiation
#[derive(Debug)]
pub struct Tape {
    next_id: usize,
    operations: HashMap<usize, Operation>,
    gradients: HashMap<usize, f64>,
}

impl Tape {
    /// Create a new tape
    pub fn new() -> Self {
        Self {
            next_id: 0,
            operations: HashMap::new(),
            gradients: HashMap::new(),
        }
    }

    /// Create a new variable with initial value
    pub fn var(&mut self, value: f64) -> Variable {
        let id = self.next_id;
        self.next_id += 1;
        self.operations.insert(id, Operation::Leaf);
        Variable::new(id, value)
    }

    /// Record an operation on the tape
    pub(crate) fn record(&mut self, value: f64, op: Operation) -> Variable {
        let id = self.next_id;
        self.next_id += 1;
        self.operations.insert(id, op);
        Variable::new(id, value)
    }

    /// Get gradient of a variable (must call backward first)
    pub fn grad(&self, var: &Variable) -> f64 {
        self.gradients.get(&var.id).copied().unwrap_or(0.0)
    }

    /// Clear all gradients
    pub fn zero_grad(&mut self) {
        self.gradients.clear();
    }

    /// Perform backward pass starting from output variable
    pub fn backward(&mut self, output: &Variable) {
        self.zero_grad();
        self.gradients.insert(output.id, 1.0);

        // Topological sort (reverse order of IDs works for DAG)
        let mut sorted_ids: Vec<usize> = self.operations.keys().copied().collect();
        sorted_ids.sort_by(|a, b| b.cmp(a)); // Reverse order

        for &id in &sorted_ids {
            let grad = self.gradients.get(&id).copied().unwrap_or(0.0);
            if grad == 0.0 {
                continue;
            }

            if let Some(op) = self.operations.get(&id).cloned() {
                self.backward_op(&op, grad);
            }
        }
    }

    fn backward_op(&mut self, op: &Operation, grad: f64) {
        match op {
            Operation::Leaf => {}
            Operation::Add { a, b } => {
                self.accumulate_grad(a.id, grad);
                self.accumulate_grad(b.id, grad);
            }
            Operation::Sub { a, b } => {
                self.accumulate_grad(a.id, grad);
                self.accumulate_grad(b.id, -grad);
            }
            Operation::Mul { a, b } => {
                self.accumulate_grad(a.id, grad * b.value());
                self.accumulate_grad(b.id, grad * a.value());
            }
            Operation::Div { a, b } => {
                let b_val = b.value();
                self.accumulate_grad(a.id, grad / b_val);
                self.accumulate_grad(b.id, -grad * a.value() / (b_val * b_val));
            }
            Operation::Pow { a, b } => {
                let a_val = a.value();
                self.accumulate_grad(a.id, grad * b * a_val.powf(b - 1.0));
            }
            Operation::Exp { a } => {
                let a_val = a.value();
                self.accumulate_grad(a.id, grad * a_val.exp());
            }
            Operation::Log { a } => {
                let a_val = a.value();
                self.accumulate_grad(a.id, grad / a_val);
            }
            Operation::Sin { a } => {
                let a_val = a.value();
                self.accumulate_grad(a.id, grad * a_val.cos());
            }
            Operation::Cos { a } => {
                let a_val = a.value();
                self.accumulate_grad(a.id, -grad * a_val.sin());
            }
            Operation::Tanh { a } => {
                let a_val = a.value();
                let tanh_val = a_val.tanh();
                self.accumulate_grad(a.id, grad * (1.0 - tanh_val * tanh_val));
            }
            Operation::Relu { a } => {
                let a_val = a.value();
                self.accumulate_grad(a.id, if a_val > 0.0 { grad } else { 0.0 });
            }
            Operation::Sigmoid { a } => {
                let a_val = a.value();
                let sig = 1.0 / (1.0 + (-a_val).exp());
                self.accumulate_grad(a.id, grad * sig * (1.0 - sig));
            }
        }
    }

    fn accumulate_grad(&mut self, id: usize, grad: f64) {
        *self.gradients.entry(id).or_insert(0.0) += grad;
    }
}

impl Default for Tape {
    fn default() -> Self {
        Self::new()
    }
}
