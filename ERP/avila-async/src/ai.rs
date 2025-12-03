//! AI/ML Integration for predictive runtime optimization
//!
//! Provides machine learning capabilities for:
//! - Workload prediction
//! - Anomaly detection
//! - Performance optimization
//! - Resource forecasting

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Simple moving average predictor
#[derive(Clone)]
pub struct WorkloadPredictor {
    window_size: usize,
    history: Arc<Mutex<VecDeque<WorkloadSample>>>,
}

#[derive(Clone, Debug)]
pub struct WorkloadSample {
    pub timestamp: std::time::Instant,
    pub queue_length: usize,
    pub active_tasks: usize,
    pub throughput: f64,
}

#[derive(Debug, Clone)]
pub struct WorkloadPrediction {
    pub predicted_queue_length: f64,
    pub predicted_throughput: f64,
    pub confidence: f64,
    pub trend: Trend,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trend {
    Increasing,
    Stable,
    Decreasing,
}

impl WorkloadPredictor {
    pub fn new(window_size: usize) -> Self {
        Self {
            window_size,
            history: Arc::new(Mutex::new(VecDeque::with_capacity(window_size))),
        }
    }

    pub fn record_sample(&self, sample: WorkloadSample) {
        let mut history = self.history.lock().unwrap();
        if history.len() >= self.window_size {
            history.pop_front();
        }
        history.push_back(sample);
    }

    pub fn predict(&self) -> Option<WorkloadPrediction> {
        let history = self.history.lock().unwrap();

        if history.len() < 3 {
            return None;
        }

        // Simple moving average
        let queue_avg: f64 = history.iter()
            .map(|s| s.queue_length as f64)
            .sum::<f64>() / history.len() as f64;

        let throughput_avg: f64 = history.iter()
            .map(|s| s.throughput)
            .sum::<f64>() / history.len() as f64;

        // Detect trend (simple linear regression slope)
        let trend = self.detect_trend(&history);

        // Confidence based on data stability
        let confidence = self.calculate_confidence(&history);

        Some(WorkloadPrediction {
            predicted_queue_length: queue_avg,
            predicted_throughput: throughput_avg,
            confidence,
            trend,
        })
    }

    fn detect_trend(&self, history: &VecDeque<WorkloadSample>) -> Trend {
        if history.len() < 2 {
            return Trend::Stable;
        }

        let recent_avg = history.iter()
            .rev()
            .take(history.len() / 2)
            .map(|s| s.queue_length as f64)
            .sum::<f64>() / (history.len() / 2) as f64;

        let older_avg = history.iter()
            .take(history.len() / 2)
            .map(|s| s.queue_length as f64)
            .sum::<f64>() / (history.len() / 2) as f64;

        let threshold = 0.15; // 15% change
        let change_ratio = (recent_avg - older_avg) / older_avg.max(1.0);

        if change_ratio > threshold {
            Trend::Increasing
        } else if change_ratio < -threshold {
            Trend::Decreasing
        } else {
            Trend::Stable
        }
    }

    fn calculate_confidence(&self, history: &VecDeque<WorkloadSample>) -> f64 {
        if history.len() < 2 {
            return 0.0;
        }

        // Calculate variance
        let queue_avg: f64 = history.iter()
            .map(|s| s.queue_length as f64)
            .sum::<f64>() / history.len() as f64;

        let variance = history.iter()
            .map(|s| {
                let diff = s.queue_length as f64 - queue_avg;
                diff * diff
            })
            .sum::<f64>() / history.len() as f64;

        let std_dev = variance.sqrt();
        let coefficient_of_variation = std_dev / queue_avg.max(1.0);

        // Lower CV = higher confidence
        (1.0 - coefficient_of_variation.min(1.0)).max(0.0)
    }
}

/// Anomaly detector using statistical methods
#[derive(Clone)]
pub struct AnomalyDetector {
    sensitivity: f64,
    baseline: Arc<Mutex<Vec<f64>>>,
}

#[derive(Debug, Clone)]
pub struct AnomalyReport {
    pub is_anomaly: bool,
    pub severity: f64, // 0.0 to 1.0
    pub metric_name: String,
    pub current_value: f64,
    pub expected_range: (f64, f64),
}

impl AnomalyDetector {
    pub fn new(sensitivity: f64) -> Self {
        Self {
            sensitivity,
            baseline: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn update_baseline(&self, value: f64) {
        let mut baseline = self.baseline.lock().unwrap();
        if baseline.len() >= 100 {
            baseline.remove(0);
        }
        baseline.push(value);
    }

    pub fn detect(&self, metric_name: String, current_value: f64) -> AnomalyReport {
        let baseline = self.baseline.lock().unwrap();

        if baseline.len() < 10 {
            return AnomalyReport {
                is_anomaly: false,
                severity: 0.0,
                metric_name,
                current_value,
                expected_range: (0.0, 0.0),
            };
        }

        let mean: f64 = baseline.iter().sum::<f64>() / baseline.len() as f64;
        let variance: f64 = baseline.iter()
            .map(|v| (v - mean).powi(2))
            .sum::<f64>() / baseline.len() as f64;
        let std_dev = variance.sqrt();

        let z_score = (current_value - mean) / std_dev.max(0.001);
        let threshold = 2.0 + (1.0 - self.sensitivity) * 2.0; // 2-4 sigma

        let is_anomaly = z_score.abs() > threshold;
        let severity = (z_score.abs() / (threshold * 2.0)).min(1.0);

        let expected_range = (
            mean - threshold * std_dev,
            mean + threshold * std_dev,
        );

        AnomalyReport {
            is_anomaly,
            severity,
            metric_name,
            current_value,
            expected_range,
        }
    }
}

/// Performance optimizer using RL-like approach
#[derive(Clone)]
pub struct PerformanceOptimizer {
    #[allow(dead_code)]
    learning_rate: f64,
    optimal_params: Arc<Mutex<OptimalParameters>>,
}

#[derive(Clone, Debug)]
struct OptimalParameters {
    #[allow(dead_code)]
    thread_count: usize,
    #[allow(dead_code)]
    queue_target: usize,
    reward_history: Vec<f64>,
}

#[derive(Debug, Clone)]
pub struct OptimizationSuggestion {
    pub suggested_threads: usize,
    pub suggested_queue_target: usize,
    pub expected_improvement: f64,
    pub confidence: f64,
}

impl PerformanceOptimizer {
    pub fn new(learning_rate: f64) -> Self {
        Self {
            learning_rate,
            optimal_params: Arc::new(Mutex::new(OptimalParameters {
                thread_count: 4,
                queue_target: 100,
                reward_history: Vec::new(),
            })),
        }
    }

    pub fn record_performance(&self, throughput: f64, latency: Duration) {
        let reward = throughput / latency.as_secs_f64().max(0.001);
        let mut params = self.optimal_params.lock().unwrap();
        params.reward_history.push(reward);
        if params.reward_history.len() > 50 {
            params.reward_history.remove(0);
        }
    }

    pub fn suggest_optimization(&self, current_threads: usize, current_queue: usize) -> OptimizationSuggestion {
        let params = self.optimal_params.lock().unwrap();

        if params.reward_history.len() < 5 {
            return OptimizationSuggestion {
                suggested_threads: current_threads,
                suggested_queue_target: current_queue,
                expected_improvement: 0.0,
                confidence: 0.0,
            };
        }

        // Simple gradient-based optimization
        let recent_reward: f64 = params.reward_history.iter()
            .rev()
            .take(5)
            .sum::<f64>() / 5.0;

        let older_reward: f64 = if params.reward_history.len() >= 10 {
            params.reward_history.iter()
                .rev()
                .skip(5)
                .take(5)
                .sum::<f64>() / 5.0
        } else {
            recent_reward
        };

        let improvement = recent_reward - older_reward;
        let confidence = (params.reward_history.len() as f64 / 50.0).min(1.0);

        let suggested_threads = if improvement < 0.0 {
            current_threads.saturating_sub(1).max(2)
        } else if improvement > 0.1 {
            (current_threads + 1).min(16)
        } else {
            current_threads
        };

        OptimizationSuggestion {
            suggested_threads,
            suggested_queue_target: current_queue,
            expected_improvement: improvement,
            confidence,
        }
    }
}

impl std::fmt::Display for WorkloadPrediction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Prediction[queue={:.1}, tps={:.1}, trend={:?}, conf={:.1}%]",
            self.predicted_queue_length,
            self.predicted_throughput,
            self.trend,
            self.confidence * 100.0
        )
    }
}

impl std::fmt::Display for AnomalyReport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.is_anomaly {
            write!(
                f,
                "🚨 ANOMALY: {} = {:.2} (expected {:.2}-{:.2}, severity={:.1}%)",
                self.metric_name,
                self.current_value,
                self.expected_range.0,
                self.expected_range.1,
                self.severity * 100.0
            )
        } else {
            write!(f, "✅ Normal: {} = {:.2}", self.metric_name, self.current_value)
        }
    }
}
