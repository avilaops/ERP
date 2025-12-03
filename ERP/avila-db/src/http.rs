//! HTTP client implementation for AvilaDB cloud connectivity

use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;
use serde::{Deserialize, Serialize};

use crate::error::{AvilaError, Result};

/// HTTP client configuration
#[derive(Debug, Clone)]
pub struct HttpConfig {
    /// Base endpoint URL
    pub endpoint: String,
    /// Request timeout
    pub timeout: Duration,
    /// Maximum concurrent connections
    pub max_connections: usize,
    /// Retry attempts
    pub max_retries: u32,
    /// Retry backoff base (exponential)
    pub retry_backoff_ms: u64,
    /// Connection keep-alive duration
    pub keep_alive: Duration,
    /// Enable compression
    pub compression: bool,
}

impl Default for HttpConfig {
    fn default() -> Self {
        Self {
            endpoint: "http://localhost:8000".to_string(),
            timeout: Duration::from_secs(30),
            max_connections: 100,
            max_retries: 3,
            retry_backoff_ms: 100,
            keep_alive: Duration::from_secs(90),
            compression: true,
        }
    }
}

/// HTTP client for AvilaDB operations
pub struct HttpClient {
    config: Arc<HttpConfig>,
    client: reqwest::Client,
    semaphore: Arc<Semaphore>,
    stats: Arc<ClientStats>,
}

/// Client statistics
#[derive(Debug, Default)]
pub struct ClientStats {
    pub requests: std::sync::atomic::AtomicU64,
    pub successes: std::sync::atomic::AtomicU64,
    pub failures: std::sync::atomic::AtomicU64,
    pub retries: std::sync::atomic::AtomicU64,
    pub total_latency_ms: std::sync::atomic::AtomicU64,
}

impl HttpClient {
    /// Create new HTTP client with configuration
    pub fn new(config: HttpConfig) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(config.timeout)
            .pool_max_idle_per_host(config.max_connections)
            .tcp_keepalive(Some(config.keep_alive))
            .gzip(config.compression)
            .brotli(config.compression)
            .build()
            .map_err(|e| AvilaError::Network(e.to_string()))?;

        Ok(Self {
            semaphore: Arc::new(Semaphore::new(config.max_connections)),
            config: Arc::new(config),
            client,
            stats: Arc::new(ClientStats::default()),
        })
    }

    /// Execute GET request with retry logic
    pub async fn get<T: for<'de> Deserialize<'de>>(&self, path: &str) -> Result<T> {
        let url = format!("{}{}", self.config.endpoint, path);
        self.execute_with_retry(|| async {
            let response = self.client.get(&url).send().await
                .map_err(|e| AvilaError::Network(e.to_string()))?;

            Self::handle_response(response).await
        }).await
    }

    /// Execute GET request with custom headers
    pub async fn get_with_headers<T: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        headers: reqwest::header::HeaderMap,
    ) -> Result<T> {
        let url = format!("{}{}", self.config.endpoint, path);
        self.execute_with_retry(|| async {
            let response = self.client.get(&url)
                .headers(headers.clone())
                .send()
                .await
                .map_err(|e| AvilaError::Network(e.to_string()))?;

            Self::handle_response(response).await
        }).await
    }

    /// Execute POST request with retry logic
    pub async fn post<T: Serialize, R: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        body: &T,
    ) -> Result<R> {
        let url = format!("{}{}", self.config.endpoint, path);
        self.execute_with_retry(|| async {
            let response = self.client.post(&url)
                .json(body)
                .send()
                .await
                .map_err(|e| AvilaError::Network(e.to_string()))?;

            Self::handle_response(response).await
        }).await
    }

    /// Execute POST request with custom headers
    pub async fn post_with_headers<T: Serialize, R: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        body: &T,
        headers: reqwest::header::HeaderMap,
    ) -> Result<R> {
        let url = format!("{}{}", self.config.endpoint, path);
        self.execute_with_retry(|| async {
            let response = self.client.post(&url)
                .headers(headers.clone())
                .json(body)
                .send()
                .await
                .map_err(|e| AvilaError::Network(e.to_string()))?;

            Self::handle_response(response).await
        }).await
    }

    /// Execute PUT request with retry logic
    pub async fn put<T: Serialize, R: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        body: &T,
    ) -> Result<R> {
        let url = format!("{}{}", self.config.endpoint, path);
        self.execute_with_retry(|| async {
            let response = self.client.put(&url)
                .json(body)
                .send()
                .await
                .map_err(|e| AvilaError::Network(e.to_string()))?;

            Self::handle_response(response).await
        }).await
    }

    /// Execute PATCH request with custom headers
    pub async fn patch_with_headers<T: Serialize, R: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        body: &T,
        headers: reqwest::header::HeaderMap,
    ) -> Result<R> {
        let url = format!("{}{}", self.config.endpoint, path);
        self.execute_with_retry(|| async {
            let response = self.client.patch(&url)
                .headers(headers.clone())
                .json(body)
                .send()
                .await
                .map_err(|e| AvilaError::Network(e.to_string()))?;

            Self::handle_response(response).await
        }).await
    }

    /// Execute DELETE request with retry logic
    pub async fn delete(&self, path: &str) -> Result<()> {
        let url = format!("{}{}", self.config.endpoint, path);
        self.execute_with_retry(|| async {
            let response = self.client.delete(&url)
                .send()
                .await
                .map_err(|e| AvilaError::Network(e.to_string()))?;

            if response.status().is_success() {
                Ok(())
            } else {
                Err(AvilaError::Network(format!("DELETE failed: {}", response.status())))
            }
        }).await
    }

    /// Execute DELETE request with custom headers
    pub async fn delete_with_headers(
        &self,
        path: &str,
        headers: reqwest::header::HeaderMap,
    ) -> Result<()> {
        let url = format!("{}{}", self.config.endpoint, path);
        self.execute_with_retry(|| async {
            let response = self.client.delete(&url)
                .headers(headers.clone())
                .send()
                .await
                .map_err(|e| AvilaError::Network(e.to_string()))?;

            if response.status().is_success() {
                Ok(())
            } else {
                Err(AvilaError::Network(format!("DELETE failed: {}", response.status())))
            }
        }).await
    }

    /// Execute request with exponential backoff retry
    async fn execute_with_retry<F, Fut, T>(&self, f: F) -> Result<T>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<T>>,
    {
        let _permit = self.semaphore.acquire().await
            .map_err(|e| AvilaError::Internal(e.to_string()))?;

        let start = Instant::now();
        self.stats.requests.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        let mut attempts = 0;
        let mut last_error = None;

        loop {
            match f().await {
                Ok(result) => {
                    let latency = start.elapsed().as_millis() as u64;
                    self.stats.total_latency_ms.fetch_add(latency, std::sync::atomic::Ordering::Relaxed);
                    self.stats.successes.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    return Ok(result);
                }
                Err(e) => {
                    attempts += 1;
                    last_error = Some(e);

                    if attempts >= self.config.max_retries {
                        self.stats.failures.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        return Err(last_error.unwrap());
                    }

                    // Exponential backoff
                    let backoff = self.config.retry_backoff_ms * (2_u64.pow(attempts - 1));
                    tokio::time::sleep(Duration::from_millis(backoff)).await;
                    self.stats.retries.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                }
            }
        }
    }

    /// Handle HTTP response and deserialize
    async fn handle_response<T: for<'de> Deserialize<'de>>(
        response: reqwest::Response,
    ) -> Result<T> {
        let status = response.status();

        if status.is_success() {
            response.json::<T>().await
                .map_err(|e| AvilaError::Serialization(e.to_string()))
        } else {
            let error_msg = response.text().await
                .unwrap_or_else(|_| format!("HTTP {}", status));

            match status.as_u16() {
                400 => Err(AvilaError::Validation(error_msg)),
                404 => Err(AvilaError::NotFound(error_msg)),
                429 => Err(AvilaError::Network(format!("Rate limit exceeded: {}", error_msg))),
                500..=599 => Err(AvilaError::Internal(error_msg)),
                _ => Err(AvilaError::Network(error_msg)),
            }
        }
    }

    /// Get client statistics
    pub fn stats(&self) -> ClientStatsSnapshot {
        ClientStatsSnapshot {
            requests: self.stats.requests.load(std::sync::atomic::Ordering::Relaxed),
            successes: self.stats.successes.load(std::sync::atomic::Ordering::Relaxed),
            failures: self.stats.failures.load(std::sync::atomic::Ordering::Relaxed),
            retries: self.stats.retries.load(std::sync::atomic::Ordering::Relaxed),
            avg_latency_ms: {
                let total = self.stats.total_latency_ms.load(std::sync::atomic::Ordering::Relaxed);
                let requests = self.stats.requests.load(std::sync::atomic::Ordering::Relaxed);
                if requests > 0 { total / requests } else { 0 }
            },
        }
    }
}

/// Snapshot of client statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientStatsSnapshot {
    pub requests: u64,
    pub successes: u64,
    pub failures: u64,
    pub retries: u64,
    pub avg_latency_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_http_config_default() {
        let config = HttpConfig::default();
        assert_eq!(config.endpoint, "http://localhost:8000");
        assert_eq!(config.max_connections, 100);
        assert_eq!(config.max_retries, 3);
    }

    #[tokio::test]
    async fn test_http_client_creation() {
        let config = HttpConfig::default();
        let client = HttpClient::new(config);
        assert!(client.is_ok());
    }

    #[tokio::test]
    async fn test_client_stats() {
        let config = HttpConfig::default();
        let client = HttpClient::new(config).unwrap();
        let stats = client.stats();
        assert_eq!(stats.requests, 0);
        assert_eq!(stats.successes, 0);
    }
}
