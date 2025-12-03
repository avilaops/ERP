//! Telemetry and observability

use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

/// Telemetry configuration
#[derive(Debug, Clone)]
pub struct TelemetryConfig {
    /// Enable metrics collection
    pub enabled: bool,
    /// Sample rate (0.0 to 1.0)
    pub sample_rate: f64,
    /// Batch size for flushing
    pub batch_size: usize,
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            sample_rate: 1.0,
            batch_size: 100,
        }
    }
}

/// Operation type for telemetry
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum OperationType {
    Insert,
    InsertBatch,
    Get,
    Query,
    Update,
    Delete,
    VectorSearch,
}

/// Telemetry event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEvent {
    pub operation: OperationType,
    pub database: String,
    pub collection: String,
    pub duration_ms: u64,
    pub success: bool,
    pub error_message: Option<String>,
    pub document_count: usize,
    pub bytes_transferred: usize,
    pub compression_ratio: f64,
    pub timestamp: u64,
}

/// Telemetry collector
pub struct TelemetryCollector {
    config: TelemetryConfig,
    events: Arc<RwLock<Vec<TelemetryEvent>>>,
    stats: Arc<RwLock<OperationStats>>,
}

/// Aggregated operation statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OperationStats {
    pub total_operations: u64,
    pub successful_operations: u64,
    pub failed_operations: u64,
    pub total_duration_ms: u64,
    pub total_documents: u64,
    pub total_bytes: u64,
    pub operations_by_type: std::collections::HashMap<String, u64>,
}

impl OperationStats {
    pub fn success_rate(&self) -> f64 {
        if self.total_operations == 0 {
            return 0.0;
        }
        self.successful_operations as f64 / self.total_operations as f64
    }

    pub fn avg_duration_ms(&self) -> f64 {
        if self.total_operations == 0 {
            return 0.0;
        }
        self.total_duration_ms as f64 / self.total_operations as f64
    }

    pub fn throughput_docs_per_sec(&self, elapsed_secs: f64) -> f64 {
        if elapsed_secs == 0.0 {
            return 0.0;
        }
        self.total_documents as f64 / elapsed_secs
    }
}

impl TelemetryCollector {
    /// Create new telemetry collector
    pub fn new(config: TelemetryConfig) -> Self {
        Self {
            config,
            events: Arc::new(RwLock::new(Vec::new())),
            stats: Arc::new(RwLock::new(OperationStats::default())),
        }
    }

    /// Record an operation
    pub async fn record(&self, event: TelemetryEvent) {
        if !self.config.enabled {
            return;
        }

        // Sample based on rate
        if self.config.sample_rate < 1.0 {
            if rand::random::<f64>() > self.config.sample_rate {
                return;
            }
        }

        // Update stats
        {
            let mut stats = self.stats.write().await;
            stats.total_operations += 1;

            if event.success {
                stats.successful_operations += 1;
            } else {
                stats.failed_operations += 1;
            }

            stats.total_duration_ms += event.duration_ms;
            stats.total_documents += event.document_count as u64;
            stats.total_bytes += event.bytes_transferred as u64;

            let op_name = format!("{:?}", event.operation);
            *stats.operations_by_type.entry(op_name).or_insert(0) += 1;
        }

        // Store event
        let mut events = self.events.write().await;
        events.push(event);

        // Flush if batch size reached
        if events.len() >= self.config.batch_size {
            self.flush_events(&mut events).await;
        }
    }

    /// Flush stored events
    async fn flush_events(&self, events: &mut Vec<TelemetryEvent>) {
        // TODO: Send to telemetry backend (OpenTelemetry, Prometheus, etc.)
        // For now, just clear the buffer
        events.clear();
    }

    /// Get current statistics
    pub async fn stats(&self) -> OperationStats {
        self.stats.read().await.clone()
    }

    /// Reset statistics
    pub async fn reset(&self) {
        let mut stats = self.stats.write().await;
        *stats = OperationStats::default();

        let mut events = self.events.write().await;
        events.clear();
    }
}

/// Telemetry span for tracking operation duration
pub struct TelemetrySpan {
    collector: Arc<TelemetryCollector>,
    operation: OperationType,
    database: String,
    collection: String,
    start: Instant,
    document_count: usize,
    bytes_transferred: usize,
    compression_ratio: f64,
}

impl TelemetrySpan {
    /// Create new telemetry span
    pub fn new(
        collector: Arc<TelemetryCollector>,
        operation: OperationType,
        database: String,
        collection: String,
    ) -> Self {
        Self {
            collector,
            operation,
            database,
            collection,
            start: Instant::now(),
            document_count: 0,
            bytes_transferred: 0,
            compression_ratio: 1.0,
        }
    }

    /// Set document count
    pub fn with_document_count(mut self, count: usize) -> Self {
        self.document_count = count;
        self
    }

    /// Set bytes transferred
    pub fn with_bytes(mut self, bytes: usize) -> Self {
        self.bytes_transferred = bytes;
        self
    }

    /// Set compression ratio
    pub fn with_compression_ratio(mut self, ratio: f64) -> Self {
        self.compression_ratio = ratio;
        self
    }

    /// Finish span successfully
    pub async fn finish(self) {
        self.finish_with_result(Ok(())).await;
    }

    /// Finish span with result
    pub async fn finish_with_result(self, result: Result<(), String>) {
        let duration_ms = self.start.elapsed().as_millis() as u64;

        let event = TelemetryEvent {
            operation: self.operation,
            database: self.database,
            collection: self.collection,
            duration_ms,
            success: result.is_ok(),
            error_message: result.err(),
            document_count: self.document_count,
            bytes_transferred: self.bytes_transferred,
            compression_ratio: self.compression_ratio,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        };

        self.collector.record(event).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_telemetry_collector() {
        let config = TelemetryConfig::default();
        let collector = TelemetryCollector::new(config);

        let event = TelemetryEvent {
            operation: OperationType::Insert,
            database: "test".to_string(),
            collection: "users".to_string(),
            duration_ms: 10,
            success: true,
            error_message: None,
            document_count: 1,
            bytes_transferred: 1024,
            compression_ratio: 2.0,
            timestamp: 0,
        };

        collector.record(event).await;

        let stats = collector.stats().await;
        assert_eq!(stats.total_operations, 1);
        assert_eq!(stats.successful_operations, 1);
    }

    #[tokio::test]
    async fn test_operation_stats() {
        let mut stats = OperationStats::default();
        stats.total_operations = 100;
        stats.successful_operations = 95;
        stats.failed_operations = 5;
        stats.total_duration_ms = 1000;
        stats.total_documents = 100;

        assert_eq!(stats.success_rate(), 0.95);
        assert_eq!(stats.avg_duration_ms(), 10.0);
        assert_eq!(stats.throughput_docs_per_sec(1.0), 100.0);
    }

    #[tokio::test]
    async fn test_telemetry_span() {
        let config = TelemetryConfig::default();
        let collector = Arc::new(TelemetryCollector::new(config));

        let span = TelemetrySpan::new(
            collector.clone(),
            OperationType::Query,
            "testdb".to_string(),
            "users".to_string(),
        )
        .with_document_count(10)
        .with_bytes(10240);

        span.finish().await;

        let stats = collector.stats().await;
        assert_eq!(stats.total_operations, 1);
        assert_eq!(stats.total_documents, 10);
    }
}
