//! Quantum-Inspired Optimization
//!
//! Quantum-inspired algorithms for task scheduling and optimization

use std::sync::{Arc, Mutex};

/// Quantum-inspired task scheduler using superposition and entanglement concepts
#[derive(Clone)]
pub struct QuantumScheduler {
    state: Arc<Mutex<QuantumState>>,
}

struct QuantumState {
    qubits: Vec<Qubit>,
    entanglement_matrix: Vec<Vec<f64>>,
    measurement_history: Vec<SchedulingDecision>,
}

#[derive(Clone, Debug)]
struct Qubit {
    alpha: f64,  // Amplitude for |0⟩ state
    beta: f64,   // Amplitude for |1⟩ state
    task_id: usize,
}

#[derive(Clone, Debug)]
pub struct SchedulingDecision {
    pub task_id: usize,
    pub thread_id: usize,
    pub priority: f64,
    pub confidence: f64,
}

impl QuantumScheduler {
    pub fn new(num_tasks: usize) -> Self {
        let qubits: Vec<Qubit> = (0..num_tasks)
            .map(|i| Qubit {
                alpha: (std::f64::consts::FRAC_1_SQRT_2),
                beta: (std::f64::consts::FRAC_1_SQRT_2),
                task_id: i,
            })
            .collect();

        let size = num_tasks;
        let entanglement_matrix = vec![vec![0.0; size]; size];

        Self {
            state: Arc::new(Mutex::new(QuantumState {
                qubits,
                entanglement_matrix,
                measurement_history: Vec::new(),
            })),
        }
    }

    /// Apply quantum rotation gate to adjust task priority
    pub fn rotate(&self, task_id: usize, theta: f64) {
        let mut state = self.state.lock().unwrap();
        if let Some(qubit) = state.qubits.get_mut(task_id) {
            let cos_theta = theta.cos();
            let sin_theta = theta.sin();
            let new_alpha = cos_theta * qubit.alpha - sin_theta * qubit.beta;
            let new_beta = sin_theta * qubit.alpha + cos_theta * qubit.beta;
            qubit.alpha = new_alpha;
            qubit.beta = new_beta;
        }
    }

    /// Create entanglement between two tasks
    pub fn entangle(&self, task_a: usize, task_b: usize, strength: f64) {
        let mut state = self.state.lock().unwrap();
        if task_a < state.entanglement_matrix.len() && task_b < state.entanglement_matrix.len() {
            state.entanglement_matrix[task_a][task_b] = strength;
            state.entanglement_matrix[task_b][task_a] = strength;
        }
    }

    /// Measure qubit state and make scheduling decision
    pub fn measure(&self, task_id: usize, num_threads: usize) -> Option<SchedulingDecision> {
        let mut state = self.state.lock().unwrap();

        if task_id >= state.qubits.len() {
            return None;
        }

        let qubit = &state.qubits[task_id];

        // Probability of measuring |1⟩ state (high priority)
        let prob = qubit.beta * qubit.beta;

        // Consider entanglement effects
        let mut entanglement_boost = 0.0;
        for (other_id, &strength) in state.entanglement_matrix[task_id].iter().enumerate() {
            if other_id != task_id && strength > 0.0 {
                entanglement_boost += strength * state.qubits[other_id].beta;
            }
        }

        let adjusted_prob = (prob + entanglement_boost * 0.1).min(1.0);

        // Quantum-inspired thread selection
        let thread_id = ((adjusted_prob * num_threads as f64).floor() as usize) % num_threads;

        let decision = SchedulingDecision {
            task_id,
            thread_id,
            priority: adjusted_prob,
            confidence: qubit.alpha.abs() + qubit.beta.abs(),
        };

        state.measurement_history.push(decision.clone());

        Some(decision)
    }

    /// Apply quantum interference to optimize scheduling
    pub fn interference(&self, task_a: usize, task_b: usize) -> f64 {
        let state = self.state.lock().unwrap();

        if task_a >= state.qubits.len() || task_b >= state.qubits.len() {
            return 0.0;
        }

        let q_a = &state.qubits[task_a];
        let q_b = &state.qubits[task_b];

        // Quantum interference pattern
        let interference = (q_a.alpha * q_b.alpha + q_a.beta * q_b.beta).abs();
        interference
    }

    /// Get optimal task ordering using quantum annealing simulation
    pub fn anneal(&self, temperature: f64) -> Vec<usize> {
        let state = self.state.lock().unwrap();
        let _n = state.qubits.len();

        let mut ordering: Vec<(usize, f64)> = state.qubits.iter()
            .map(|q| {
                let energy = -(q.beta * q.beta) / (1.0 + temperature);
                (q.task_id, energy)
            })
            .collect();

        // Sort by energy (lower energy = higher priority)
        ordering.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

        ordering.into_iter().map(|(id, _)| id).collect()
    }

    /// Get scheduling statistics
    pub fn stats(&self) -> QuantumStats {
        let state = self.state.lock().unwrap();

        let avg_priority = if !state.qubits.is_empty() {
            state.qubits.iter().map(|q| q.beta * q.beta).sum::<f64>() / state.qubits.len() as f64
        } else {
            0.0
        };

        let total_entanglement: f64 = state.entanglement_matrix.iter()
            .flat_map(|row| row.iter())
            .sum::<f64>() / 2.0; // Divide by 2 because matrix is symmetric

        QuantumStats {
            num_qubits: state.qubits.len(),
            avg_priority,
            total_entanglement,
            measurements: state.measurement_history.len(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct QuantumStats {
    pub num_qubits: usize,
    pub avg_priority: f64,
    pub total_entanglement: f64,
    pub measurements: usize,
}

impl std::fmt::Display for SchedulingDecision {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Decision[task={}, thread={}, priority={:.2}, confidence={:.2}]",
            self.task_id, self.thread_id, self.priority, self.confidence
        )
    }
}

impl std::fmt::Display for QuantumStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "QuantumStats[qubits={}, avg_priority={:.3}, entanglement={:.2}, measurements={}]",
            self.num_qubits, self.avg_priority, self.total_entanglement, self.measurements
        )
    }
}
