//! Health check system for monitoring runtime health
//!
//! Industry 4.0 compliant health monitoring with readiness and liveness probes

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

impl std::fmt::Display for HealthStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HealthStatus::Healthy => write!(f, "healthy"),
            HealthStatus::Degraded => write!(f, "degraded"),
            HealthStatus::Unhealthy => write!(f, "unhealthy"),
        }
    }
}

pub struct HealthCheck {
    ready: Arc<AtomicBool>,
    alive: Arc<AtomicBool>,
    last_heartbeat: Arc<std::sync::Mutex<Instant>>,
    checks: Arc<std::sync::Mutex<Vec<Check>>>,
}

struct Check {
    name: String,
    status: HealthStatus,
    message: String,
    last_check: Instant,
}

impl HealthCheck {
    pub fn new() -> Self {
        Self {
            ready: Arc::new(AtomicBool::new(true)),
            alive: Arc::new(AtomicBool::new(true)),
            last_heartbeat: Arc::new(std::sync::Mutex::new(Instant::now())),
            checks: Arc::new(std::sync::Mutex::new(Vec::new())),
        }
    }

    /// Set readiness status (can accept new work)
    pub fn set_ready(&self, ready: bool) {
        self.ready.store(ready, Ordering::Release);
    }

    /// Check if runtime is ready
    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Acquire)
    }

    /// Set liveness status (runtime is functioning)
    pub fn set_alive(&self, alive: bool) {
        self.alive.store(alive, Ordering::Release);
    }

    /// Check if runtime is alive
    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Acquire)
    }

    /// Update heartbeat timestamp
    pub fn heartbeat(&self) {
        let mut last = self.last_heartbeat.lock().unwrap();
        *last = Instant::now();
    }

    /// Check if heartbeat is recent (within threshold)
    pub fn is_heartbeat_recent(&self, threshold: Duration) -> bool {
        let last = self.last_heartbeat.lock().unwrap();
        last.elapsed() < threshold
    }

    /// Add a custom health check
    pub fn add_check(&self, name: impl Into<String>, status: HealthStatus, message: impl Into<String>) {
        let mut checks = self.checks.lock().unwrap();
        checks.push(Check {
            name: name.into(),
            status,
            message: message.into(),
            last_check: Instant::now(),
        });
    }

    /// Get overall health status
    pub fn get_status(&self) -> HealthStatus {
        if !self.is_alive() {
            return HealthStatus::Unhealthy;
        }

        if !self.is_ready() {
            return HealthStatus::Degraded;
        }

        let checks = self.checks.lock().unwrap();
        let has_unhealthy = checks.iter().any(|c| c.status == HealthStatus::Unhealthy);
        let has_degraded = checks.iter().any(|c| c.status == HealthStatus::Degraded);

        if has_unhealthy {
            HealthStatus::Unhealthy
        } else if has_degraded {
            HealthStatus::Degraded
        } else {
            HealthStatus::Healthy
        }
    }

    /// Get detailed health report
    pub fn get_report(&self) -> HealthReport {
        let checks = self.checks.lock().unwrap();
        let last_heartbeat = self.last_heartbeat.lock().unwrap();

        HealthReport {
            status: self.get_status(),
            ready: self.is_ready(),
            alive: self.is_alive(),
            last_heartbeat: last_heartbeat.elapsed(),
            checks: checks
                .iter()
                .map(|c| CheckReport {
                    name: c.name.clone(),
                    status: c.status,
                    message: c.message.clone(),
                    age: c.last_check.elapsed(),
                })
                .collect(),
        }
    }

    /// Clear all checks
    pub fn clear_checks(&self) {
        let mut checks = self.checks.lock().unwrap();
        checks.clear();
    }
}

impl Default for HealthCheck {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for HealthCheck {
    fn clone(&self) -> Self {
        Self {
            ready: Arc::clone(&self.ready),
            alive: Arc::clone(&self.alive),
            last_heartbeat: Arc::clone(&self.last_heartbeat),
            checks: Arc::clone(&self.checks),
        }
    }
}

#[derive(Debug, Clone)]
pub struct HealthReport {
    pub status: HealthStatus,
    pub ready: bool,
    pub alive: bool,
    pub last_heartbeat: Duration,
    pub checks: Vec<CheckReport>,
}

#[derive(Debug, Clone)]
pub struct CheckReport {
    pub name: String,
    pub status: HealthStatus,
    pub message: String,
    pub age: Duration,
}

impl std::fmt::Display for HealthReport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "Health Status: {}", self.status)?;
        writeln!(f, "Ready: {} | Alive: {}", self.ready, self.alive)?;
        writeln!(f, "Last Heartbeat: {:?} ago", self.last_heartbeat)?;

        if !self.checks.is_empty() {
            writeln!(f, "\nChecks:")?;
            for check in &self.checks {
                writeln!(
                    f,
                    "  - {} [{}]: {} (checked {:?} ago)",
                    check.name, check.status, check.message, check.age
                )?;
            }
        }

        Ok(())
    }
}

impl HealthReport {
    /// Export health report as JSON
    pub fn to_json(&self) -> String {
        format!(
            r#"{{"status":"{}","ready":{},"alive":{},"last_heartbeat_ms":{},"checks":[{}]}}"#,
            self.status,
            self.ready,
            self.alive,
            self.last_heartbeat.as_millis(),
            self.checks
                .iter()
                .map(|c| format!(
                    r#"{{"name":"{}","status":"{}","message":"{}"}}"#,
                    c.name, c.status, c.message
                ))
                .collect::<Vec<_>>()
                .join(",")
        )
    }
}
