//! Custom thread pool configuration
//!
//! This module provides advanced configuration options for thread pools

use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

/// Thread pool configuration
#[derive(Debug, Clone)]
pub struct ThreadPoolConfig {
    /// Number of worker threads
    pub num_threads: usize,
    /// Thread stack size in bytes
    pub stack_size: Option<usize>,
    /// Thread name prefix
    pub thread_name: Option<String>,
    /// Idle timeout for threads
    pub idle_timeout: Option<Duration>,
    /// Maximum chunk size
    pub max_chunk_size: Option<usize>,
    /// Minimum chunk size
    pub min_chunk_size: Option<usize>,
}

impl Default for ThreadPoolConfig {
    fn default() -> Self {
        Self {
            num_threads: thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(1),
            stack_size: None,
            thread_name: Some("avila-worker".to_string()),
            idle_timeout: None,
            max_chunk_size: None,
            min_chunk_size: Some(1024),
        }
    }
}

impl ThreadPoolConfig {
    /// Create a new configuration with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the number of threads
    pub fn num_threads(mut self, n: usize) -> Self {
        self.num_threads = n;
        self
    }

    /// Set the stack size for threads
    pub fn stack_size(mut self, size: usize) -> Self {
        self.stack_size = Some(size);
        self
    }

    /// Set the thread name prefix
    pub fn thread_name(mut self, name: impl Into<String>) -> Self {
        self.thread_name = Some(name.into());
        self
    }

    /// Set the idle timeout
    pub fn idle_timeout(mut self, timeout: Duration) -> Self {
        self.idle_timeout = Some(timeout);
        self
    }

    /// Set the maximum chunk size
    pub fn max_chunk_size(mut self, size: usize) -> Self {
        self.max_chunk_size = Some(size);
        self
    }

    /// Set the minimum chunk size
    pub fn min_chunk_size(mut self, size: usize) -> Self {
        self.min_chunk_size = Some(size);
        self
    }

    /// Get effective min chunk size
    pub fn effective_min_chunk_size(&self) -> usize {
        self.min_chunk_size.unwrap_or(1024)
    }
}

/// Global thread pool configuration
static CONFIG: OnceLock<Arc<Mutex<ThreadPoolConfig>>> = OnceLock::new();

fn get_config_lock() -> &'static Arc<Mutex<ThreadPoolConfig>> {
    CONFIG.get_or_init(|| {
        Arc::new(Mutex::new(ThreadPoolConfig::default()))
    })
}

/// Set the global thread pool configuration
pub fn set_global_config(config: ThreadPoolConfig) {
    *get_config_lock().lock().unwrap() = config;
}

/// Get the global thread pool configuration
pub fn get_global_config() -> ThreadPoolConfig {
    get_config_lock().lock().unwrap().clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_builder() {
        let config = ThreadPoolConfig::new()
            .num_threads(4)
            .stack_size(2 * 1024 * 1024)
            .thread_name("test-worker")
            .min_chunk_size(2048);

        assert_eq!(config.num_threads, 4);
        assert_eq!(config.stack_size, Some(2 * 1024 * 1024));
        assert_eq!(config.thread_name, Some("test-worker".to_string()));
        assert_eq!(config.min_chunk_size, Some(2048));
    }

    #[test]
    fn test_default_config() {
        let config = ThreadPoolConfig::default();
        assert!(config.num_threads > 0);
        assert_eq!(config.min_chunk_size, Some(1024));
    }
}
