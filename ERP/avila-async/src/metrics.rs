//! Metrics collection and monitoring for Industry 4.0 compliance
//!
//! Provides real-time metrics for:
//! - Task execution times
//! - Queue depths
//! - Thread utilization
//! - Error rates
//! - Throughput statistics

use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::collections::HashMap;

/// Global metrics collector
#[derive(Clone)]
pub struct Metrics {
    inner: Arc<MetricsInner>,
}

struct MetricsInner {
    // Task metrics
    tasks_spawned: AtomicU64,
    tasks_completed: AtomicU64,
    tasks_failed: AtomicU64,

    // Queue metrics
    queue_length: AtomicUsize,
    max_queue_length: AtomicUsize,

    // Thread metrics
    active_threads: AtomicUsize,
    idle_threads: AtomicUsize,

    // Performance metrics
    total_execution_time_ns: AtomicU64,
    task_execution_times: Mutex<Vec<Duration>>,

    // Throughput metrics
    tasks_per_second: AtomicU64,
    last_throughput_update: Mutex<Instant>,

    // Custom metrics
    custom_counters: Mutex<HashMap<String, AtomicU64>>,
    custom_gauges: Mutex<HashMap<String, AtomicU64>>,
}

impl Metrics {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(MetricsInner {
                tasks_spawned: AtomicU64::new(0),
                tasks_completed: AtomicU64::new(0),
                tasks_failed: AtomicU64::new(0),
                queue_length: AtomicUsize::new(0),
                max_queue_length: AtomicUsize::new(0),
                active_threads: AtomicUsize::new(0),
                idle_threads: AtomicUsize::new(0),
                total_execution_time_ns: AtomicU64::new(0),
                task_execution_times: Mutex::new(Vec::with_capacity(1000)),
                tasks_per_second: AtomicU64::new(0),
                last_throughput_update: Mutex::new(Instant::now()),
                custom_counters: Mutex::new(HashMap::new()),
                custom_gauges: Mutex::new(HashMap::new()),
            }),
        }
    }

    // Task metrics
    pub fn task_spawned(&self) {
        self.inner.tasks_spawned.fetch_add(1, Ordering::Relaxed);
    }

    pub fn task_completed(&self, execution_time: Duration) {
        self.inner.tasks_completed.fetch_add(1, Ordering::Relaxed);
        self.inner.total_execution_time_ns.fetch_add(
            execution_time.as_nanos() as u64,
            Ordering::Relaxed,
        );

        let mut times = self.inner.task_execution_times.lock().unwrap();
        if times.len() < 1000 {
            times.push(execution_time);
        }

        self.update_throughput();
    }

    pub fn task_failed(&self) {
        self.inner.tasks_failed.fetch_add(1, Ordering::Relaxed);
    }

    // Queue metrics
    pub fn queue_length_changed(&self, new_length: usize) {
        self.inner.queue_length.store(new_length, Ordering::Relaxed);

        let current_max = self.inner.max_queue_length.load(Ordering::Relaxed);
        if new_length > current_max {
            self.inner.max_queue_length.store(new_length, Ordering::Relaxed);
        }
    }

    // Thread metrics
    pub fn thread_active(&self) {
        self.inner.active_threads.fetch_add(1, Ordering::Relaxed);
        self.inner.idle_threads.fetch_sub(1, Ordering::Relaxed);
    }

    pub fn thread_idle(&self) {
        self.inner.active_threads.fetch_sub(1, Ordering::Relaxed);
        self.inner.idle_threads.fetch_add(1, Ordering::Relaxed);
    }

    pub fn set_thread_count(&self, count: usize) {
        self.inner.idle_threads.store(count, Ordering::Relaxed);
    }

    // Custom metrics
    pub fn increment_counter(&self, name: &str, value: u64) {
        let mut counters = self.inner.custom_counters.lock().unwrap();
        counters
            .entry(name.to_string())
            .or_insert_with(|| AtomicU64::new(0))
            .fetch_add(value, Ordering::Relaxed);
    }

    pub fn set_gauge(&self, name: &str, value: u64) {
        let mut gauges = self.inner.custom_gauges.lock().unwrap();
        gauges
            .entry(name.to_string())
            .or_insert_with(|| AtomicU64::new(0))
            .store(value, Ordering::Relaxed);
    }

    // Snapshot
    pub fn snapshot(&self) -> MetricsSnapshot {
        let times = self.inner.task_execution_times.lock().unwrap();
        let avg_execution_time = if !times.is_empty() {
            Duration::from_nanos(
                times.iter().map(|d| d.as_nanos() as u64).sum::<u64>() / times.len() as u64
            )
        } else {
            Duration::ZERO
        };

        let mut p50 = Duration::ZERO;
        let mut p95 = Duration::ZERO;
        let mut p99 = Duration::ZERO;

        if !times.is_empty() {
            let mut sorted = times.clone();
            sorted.sort();
            p50 = sorted[sorted.len() / 2];
            p95 = sorted[(sorted.len() * 95) / 100];
            p99 = sorted[(sorted.len() * 99) / 100];
        }

        MetricsSnapshot {
            tasks_spawned: self.inner.tasks_spawned.load(Ordering::Relaxed),
            tasks_completed: self.inner.tasks_completed.load(Ordering::Relaxed),
            tasks_failed: self.inner.tasks_failed.load(Ordering::Relaxed),
            queue_length: self.inner.queue_length.load(Ordering::Relaxed),
            max_queue_length: self.inner.max_queue_length.load(Ordering::Relaxed),
            active_threads: self.inner.active_threads.load(Ordering::Relaxed),
            idle_threads: self.inner.idle_threads.load(Ordering::Relaxed),
            avg_execution_time,
            p50_execution_time: p50,
            p95_execution_time: p95,
            p99_execution_time: p99,
            tasks_per_second: self.inner.tasks_per_second.load(Ordering::Relaxed),
        }
    }

    fn update_throughput(&self) {
        let mut last_update = self.inner.last_throughput_update.lock().unwrap();
        let now = Instant::now();
        let elapsed = now.duration_since(*last_update);

        if elapsed >= Duration::from_secs(1) {
            let completed = self.inner.tasks_completed.load(Ordering::Relaxed);
            let tps = (completed as f64 / elapsed.as_secs_f64()) as u64;
            self.inner.tasks_per_second.store(tps, Ordering::Relaxed);
            *last_update = now;
        }
    }

    /// Export metrics in Prometheus format
    pub fn to_prometheus(&self) -> String {
        let snapshot = self.snapshot();
        format!(
            "# HELP avila_async_tasks_spawned_total Total number of spawned tasks\n\
             # TYPE avila_async_tasks_spawned_total counter\n\
             avila_async_tasks_spawned_total {}\n\
             # HELP avila_async_tasks_completed_total Total number of completed tasks\n\
             # TYPE avila_async_tasks_completed_total counter\n\
             avila_async_tasks_completed_total {}\n\
             # HELP avila_async_tasks_failed_total Total number of failed tasks\n\
             # TYPE avila_async_tasks_failed_total counter\n\
             avila_async_tasks_failed_total {}\n\
             # HELP avila_async_queue_length Current queue length\n\
             # TYPE avila_async_queue_length gauge\n\
             avila_async_queue_length {}\n\
             # HELP avila_async_active_threads Number of active threads\n\
             # TYPE avila_async_active_threads gauge\n\
             avila_async_active_threads {}\n\
             # HELP avila_async_tasks_per_second Tasks completed per second\n\
             # TYPE avila_async_tasks_per_second gauge\n\
             avila_async_tasks_per_second {}\n",
            snapshot.tasks_spawned,
            snapshot.tasks_completed,
            snapshot.tasks_failed,
            snapshot.queue_length,
            snapshot.active_threads,
            snapshot.tasks_per_second,
        )
    }
}

impl Default for Metrics {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct MetricsSnapshot {
    pub tasks_spawned: u64,
    pub tasks_completed: u64,
    pub tasks_failed: u64,
    pub queue_length: usize,
    pub max_queue_length: usize,
    pub active_threads: usize,
    pub idle_threads: usize,
    pub avg_execution_time: Duration,
    pub p50_execution_time: Duration,
    pub p95_execution_time: Duration,
    pub p99_execution_time: Duration,
    pub tasks_per_second: u64,
}

impl std::fmt::Display for MetricsSnapshot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Tasks: spawned={} completed={} failed={} | \
             Queue: current={} max={} | \
             Threads: active={} idle={} | \
             Performance: avg={:?} p50={:?} p95={:?} p99={:?} tps={}",
            self.tasks_spawned,
            self.tasks_completed,
            self.tasks_failed,
            self.queue_length,
            self.max_queue_length,
            self.active_threads,
            self.idle_threads,
            self.avg_execution_time,
            self.p50_execution_time,
            self.p95_execution_time,
            self.p99_execution_time,
            self.tasks_per_second
        )
    }
}
