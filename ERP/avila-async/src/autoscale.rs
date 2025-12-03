//! Auto-scaling capabilities for Industry 4.0 adaptive systems
//!
//! Dynamically adjusts thread pool size based on workload

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub struct AutoScaler {
    config: ScalingConfig,
    last_scale: Arc<std::sync::Mutex<Instant>>,
    current_threads: Arc<AtomicUsize>,
}

#[derive(Clone, Debug)]
pub struct ScalingConfig {
    pub min_threads: usize,
    pub max_threads: usize,
    pub target_queue_length: usize,
    pub scale_up_threshold: f64,
    pub scale_down_threshold: f64,
    pub cooldown_period: Duration,
}

impl Default for ScalingConfig {
    fn default() -> Self {
        Self {
            min_threads: 2,
            max_threads: std::thread::available_parallelism()
                .map(|n| n.get() * 2)
                .unwrap_or(16),
            target_queue_length: 100,
            scale_up_threshold: 0.8,
            scale_down_threshold: 0.3,
            cooldown_period: Duration::from_secs(30),
        }
    }
}

impl AutoScaler {
    pub fn new(config: ScalingConfig) -> Self {
        let initial_threads = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);

        Self {
            config,
            last_scale: Arc::new(std::sync::Mutex::new(Instant::now())),
            current_threads: Arc::new(AtomicUsize::new(initial_threads)),
        }
    }

    /// Evaluate scaling decision based on metrics
    pub fn evaluate(&self, queue_length: usize, _active_tasks: usize) -> ScalingDecision {
        let last_scale = self.last_scale.lock().unwrap();
        if last_scale.elapsed() < self.config.cooldown_period {
            return ScalingDecision::NoAction;
        }
        drop(last_scale);

        let current_threads = self.current_threads.load(Ordering::Relaxed);
        let utilization = queue_length as f64 / self.config.target_queue_length as f64;

        if utilization > self.config.scale_up_threshold && current_threads < self.config.max_threads {
            let new_threads = (current_threads + 1).min(self.config.max_threads);
            ScalingDecision::ScaleUp { from: current_threads, to: new_threads }
        } else if utilization < self.config.scale_down_threshold && current_threads > self.config.min_threads {
            let new_threads = (current_threads.saturating_sub(1)).max(self.config.min_threads);
            ScalingDecision::ScaleDown { from: current_threads, to: new_threads }
        } else {
            ScalingDecision::NoAction
        }
    }

    /// Apply scaling decision
    pub fn apply_decision(&self, decision: &ScalingDecision) {
        match decision {
            ScalingDecision::ScaleUp { to, .. } | ScalingDecision::ScaleDown { to, .. } => {
                self.current_threads.store(*to, Ordering::Relaxed);
                let mut last_scale = self.last_scale.lock().unwrap();
                *last_scale = Instant::now();
            }
            ScalingDecision::NoAction => {}
        }
    }

    pub fn current_threads(&self) -> usize {
        self.current_threads.load(Ordering::Relaxed)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScalingDecision {
    ScaleUp { from: usize, to: usize },
    ScaleDown { from: usize, to: usize },
    NoAction,
}

impl std::fmt::Display for ScalingDecision {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ScalingDecision::ScaleUp { from, to } => write!(f, "Scale UP: {} → {} threads", from, to),
            ScalingDecision::ScaleDown { from, to } => write!(f, "Scale DOWN: {} → {} threads", from, to),
            ScalingDecision::NoAction => write!(f, "No scaling action needed"),
        }
    }
}

/// Resource limits for the runtime
#[derive(Clone, Debug)]
pub struct ResourceLimits {
    pub max_memory_mb: Option<usize>,
    pub max_cpu_percent: Option<f64>,
    pub max_queue_size: Option<usize>,
    pub max_task_duration: Option<Duration>,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_memory_mb: None,
            max_cpu_percent: None,
            max_queue_size: Some(10000),
            max_task_duration: Some(Duration::from_secs(300)),
        }
    }
}

impl ResourceLimits {
    pub fn is_queue_size_exceeded(&self, queue_size: usize) -> bool {
        self.max_queue_size.map_or(false, |max| queue_size > max)
    }

    pub fn is_task_duration_exceeded(&self, duration: Duration) -> bool {
        self.max_task_duration.map_or(false, |max| duration > max)
    }
}
