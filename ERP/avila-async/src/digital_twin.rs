//! Digital Twin - Virtual representation of runtime state
//!
//! Provides real-time digital twin capabilities for runtime monitoring and simulation

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::collections::HashMap;

/// Digital Twin of the runtime
#[derive(Clone)]
pub struct DigitalTwin {
    state: Arc<Mutex<TwinState>>,
    history: Arc<Mutex<Vec<TwinSnapshot>>>,
}

#[derive(Clone, Debug)]
struct TwinState {
    runtime_id: String,
    started_at: Instant,
    last_update: Instant,

    // Task state
    total_tasks_spawned: u64,
    total_tasks_completed: u64,
    active_tasks: usize,
    queue_depth: usize,

    // Thread state
    thread_count: usize,
    active_threads: usize,
    idle_threads: usize,

    // Performance state
    current_throughput: f64,
    avg_latency: Duration,
    cpu_utilization: f64,
    #[allow(dead_code)]
    memory_usage_mb: usize,

    // Health state
    health_status: String,
    is_ready: bool,
    is_alive: bool,

    // Custom state
    custom_attributes: HashMap<String, String>,
}

#[derive(Clone, Debug)]
pub struct TwinSnapshot {
    pub timestamp: Instant,
    pub uptime: Duration,
    pub tasks_spawned: u64,
    pub tasks_completed: u64,
    pub active_tasks: usize,
    pub queue_depth: usize,
    pub thread_count: usize,
    pub throughput: f64,
    pub avg_latency: Duration,
    pub health_status: String,
}

impl DigitalTwin {
    pub fn new(runtime_id: impl Into<String>) -> Self {
        let now = Instant::now();
        Self {
            state: Arc::new(Mutex::new(TwinState {
                runtime_id: runtime_id.into(),
                started_at: now,
                last_update: now,
                total_tasks_spawned: 0,
                total_tasks_completed: 0,
                active_tasks: 0,
                queue_depth: 0,
                thread_count: 0,
                active_threads: 0,
                idle_threads: 0,
                current_throughput: 0.0,
                avg_latency: Duration::ZERO,
                cpu_utilization: 0.0,
                memory_usage_mb: 0,
                health_status: "Unknown".to_string(),
                is_ready: false,
                is_alive: false,
                custom_attributes: HashMap::new(),
            })),
            history: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Update the digital twin state
    pub fn update(&self, update: TwinUpdate) {
        let mut state = self.state.lock().unwrap();
        state.last_update = Instant::now();

        if let Some(tasks_spawned) = update.tasks_spawned {
            state.total_tasks_spawned = tasks_spawned;
        }
        if let Some(tasks_completed) = update.tasks_completed {
            state.total_tasks_completed = tasks_completed;
        }
        if let Some(active_tasks) = update.active_tasks {
            state.active_tasks = active_tasks;
        }
        if let Some(queue_depth) = update.queue_depth {
            state.queue_depth = queue_depth;
        }
        if let Some(thread_count) = update.thread_count {
            state.thread_count = thread_count;
        }
        if let Some(throughput) = update.throughput {
            state.current_throughput = throughput;
        }
        if let Some(latency) = update.avg_latency {
            state.avg_latency = latency;
        }
        if let Some(health) = update.health_status {
            state.health_status = health;
        }
        if let Some(ready) = update.is_ready {
            state.is_ready = ready;
        }
        if let Some(alive) = update.is_alive {
            state.is_alive = alive;
        }

        // Record snapshot
        drop(state);
        self.record_snapshot();
    }

    /// Set custom attribute
    pub fn set_attribute(&self, key: String, value: String) {
        let mut state = self.state.lock().unwrap();
        state.custom_attributes.insert(key, value);
    }

    /// Get current snapshot
    pub fn snapshot(&self) -> TwinSnapshot {
        let state = self.state.lock().unwrap();
        TwinSnapshot {
            timestamp: Instant::now(),
            uptime: state.started_at.elapsed(),
            tasks_spawned: state.total_tasks_spawned,
            tasks_completed: state.total_tasks_completed,
            active_tasks: state.active_tasks,
            queue_depth: state.queue_depth,
            thread_count: state.thread_count,
            throughput: state.current_throughput,
            avg_latency: state.avg_latency,
            health_status: state.health_status.clone(),
        }
    }

    /// Get historical snapshots
    pub fn history(&self) -> Vec<TwinSnapshot> {
        let history = self.history.lock().unwrap();
        history.clone()
    }

    /// Export digital twin as JSON
    pub fn to_json(&self) -> String {
        let state = self.state.lock().unwrap();
        format!(
            r#"{{
  "runtime_id": "{}",
  "uptime_seconds": {},
  "tasks": {{
    "spawned": {},
    "completed": {},
    "active": {},
    "queue_depth": {}
  }},
  "threads": {{
    "total": {},
    "active": {},
    "idle": {}
  }},
  "performance": {{
    "throughput": {:.2},
    "avg_latency_ms": {},
    "cpu_utilization": {:.2}
  }},
  "health": {{
    "status": "{}",
    "ready": {},
    "alive": {}
  }}
}}"#,
            state.runtime_id,
            state.started_at.elapsed().as_secs(),
            state.total_tasks_spawned,
            state.total_tasks_completed,
            state.active_tasks,
            state.queue_depth,
            state.thread_count,
            state.active_threads,
            state.idle_threads,
            state.current_throughput,
            state.avg_latency.as_millis(),
            state.cpu_utilization,
            state.health_status,
            state.is_ready,
            state.is_alive
        )
    }

    /// Compare with another digital twin (for multi-instance scenarios)
    pub fn compare(&self, other: &DigitalTwin) -> TwinComparison {
        let self_state = self.state.lock().unwrap();
        let other_state = other.state.lock().unwrap();

        TwinComparison {
            throughput_diff: self_state.current_throughput - other_state.current_throughput,
            latency_diff: self_state.avg_latency.as_millis() as i64
                - other_state.avg_latency.as_millis() as i64,
            queue_diff: self_state.queue_depth as i64 - other_state.queue_depth as i64,
            load_diff: self_state.active_tasks as i64 - other_state.active_tasks as i64,
        }
    }

    fn record_snapshot(&self) {
        let snapshot = self.snapshot();
        let mut history = self.history.lock().unwrap();

        // Keep last 100 snapshots
        if history.len() >= 100 {
            history.remove(0);
        }
        history.push(snapshot);
    }
}

#[derive(Default, Debug)]
pub struct TwinUpdate {
    pub tasks_spawned: Option<u64>,
    pub tasks_completed: Option<u64>,
    pub active_tasks: Option<usize>,
    pub queue_depth: Option<usize>,
    pub thread_count: Option<usize>,
    pub throughput: Option<f64>,
    pub avg_latency: Option<Duration>,
    pub health_status: Option<String>,
    pub is_ready: Option<bool>,
    pub is_alive: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct TwinComparison {
    pub throughput_diff: f64,
    pub latency_diff: i64,
    pub queue_diff: i64,
    pub load_diff: i64,
}

impl std::fmt::Display for TwinSnapshot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Twin[uptime={:?}, tasks={}/{}, queue={}, tps={:.1}, latency={:?}, health={}]",
            self.uptime,
            self.tasks_completed,
            self.tasks_spawned,
            self.queue_depth,
            self.throughput,
            self.avg_latency,
            self.health_status
        )
    }
}

impl std::fmt::Display for TwinComparison {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Comparison[Δtps={:+.1}, Δlatency={:+}ms, Δqueue={:+}, Δload={:+}]",
            self.throughput_diff,
            self.latency_diff,
            self.queue_diff,
            self.load_diff
        )
    }
}
