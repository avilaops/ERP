//! AvilaDB client implementation

use std::sync::Arc;
use std::time::Duration;

use crate::{
    auth::AuthProvider,
    cache::{CacheConfig, QueryCache},
    http::{HttpClient, HttpConfig},
    telemetry::{TelemetryCollector, TelemetryConfig},
    Config, Database, Result,
};

/// AvilaDB client for connecting to the database
#[derive(Clone)]
pub struct AvilaClient {
    config: Arc<Config>,
    http_client: Arc<HttpClient>,
    auth_provider: Arc<AuthProvider>,
    query_cache: Arc<QueryCache>,
    telemetry: Arc<TelemetryCollector>,
}

impl AvilaClient {
    /// Connect to AvilaDB with default configuration
    ///
    /// # Example
    ///
    /// ```no_run
    /// use aviladb::AvilaClient;
    ///
    /// #[tokio::main]
    /// async fn main() -> Result<(), Box<dyn std::error::Error>> {
    ///     let client = AvilaClient::connect("http://localhost:8000").await?;
    ///     Ok(())
    /// }
    /// ```
    pub async fn connect(endpoint: &str) -> Result<Self> {
        let config = Config {
            endpoint: endpoint.to_string(),
            ..Default::default()
        };
        Self::with_config(config).await
    }

    /// Connect with custom configuration
    pub async fn with_config(config: Config) -> Result<Self> {
        config.validate()?;

        let http_config = HttpConfig {
            endpoint: config.endpoint.clone(),
            timeout: Duration::from_secs(config.request_timeout),
            max_connections: config.max_connections,
            max_retries: 3,
            retry_backoff_ms: 100,
            keep_alive: Duration::from_secs(90),
            compression: config.enable_compression,
        };

        let http_client = HttpClient::new(http_config)?;
        let auth_provider = AuthProvider::new(config.endpoint.clone());

        let cache_config = CacheConfig {
            max_entries: config.max_cache_entries,
            ttl: Duration::from_secs(config.cache_ttl),
            track_stats: true,
        };
        let query_cache = QueryCache::new(cache_config);

        let telemetry_config = TelemetryConfig::default();
        let telemetry = TelemetryCollector::new(telemetry_config);

        Ok(Self {
            config: Arc::new(config),
            http_client: Arc::new(http_client),
            auth_provider: Arc::new(auth_provider),
            query_cache: Arc::new(query_cache),
            telemetry: Arc::new(telemetry),
        })
    }

    /// Get a database handle
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use aviladb::AvilaClient;
    /// # async fn example(client: AvilaClient) -> aviladb::Result<()> {
    /// let db = client.database("mydb").await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn database(&self, name: &str) -> Result<Database> {
        Database::new(
            name.to_string(),
            self.config.clone(),
            self.http_client.clone(),
            self.auth_provider.clone(),
            self.telemetry.clone(),
        )
    }

    /// Create a new database
    pub async fn create_database(&self, name: &str) -> Result<Database> {
        // Send CREATE DATABASE HTTP request
        let token = self.auth_provider.get_token().await?;
        let url = format!("/v1/databases");

        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token))?,
        );
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("application/json"),
        );

        let payload = serde_json::json!({
            "name": name,
            "region": "sa-east-1" // Brazil by default
        });

        let _response: serde_json::Value = self.http_client
            .post_with_headers(&url, &payload, headers)
            .await?;

        self.database(name).await
    }

    /// List all databases
    pub async fn list_databases(&self) -> Result<Vec<String>> {
        // Send LIST DATABASES HTTP request
        let token = self.auth_provider.get_token().await?;
        let url = format!("/v1/databases");

        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token))?,
        );

        let response: serde_json::Value = self.http_client
            .get_with_headers(&url, headers)
            .await?;

        let databases = response["databases"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        Ok(databases)
    }

    /// Delete a database
    pub async fn delete_database(&self, name: &str) -> Result<()> {
        // Send DELETE DATABASE HTTP request
        let token = self.auth_provider.get_token().await?;
        let url = format!("/v1/databases/{}", name);

        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token))?,
        );

        self.http_client
            .delete_with_headers(&url, headers)
            .await?;

        Ok(())
    }

    /// Get client configuration
    pub fn config(&self) -> &Config {
        &self.config
    }

    /// Get HTTP client
    pub fn http_client(&self) -> &HttpClient {
        &self.http_client
    }

    /// Get authentication provider
    pub fn auth_provider(&self) -> &AuthProvider {
        &self.auth_provider
    }

    /// Get query cache
    pub fn query_cache(&self) -> &QueryCache {
        &self.query_cache
    }

    /// Get telemetry collector
    pub fn telemetry(&self) -> &TelemetryCollector {
        &self.telemetry
    }

    /// Get client statistics
    pub async fn stats(&self) -> ClientStats {
        let http_stats = self.http_client.stats();
        let cache_stats = self.query_cache.stats().await;

        ClientStats {
            http_requests: http_stats.requests,
            http_successes: http_stats.successes,
            http_failures: http_stats.failures,
            avg_latency_ms: http_stats.avg_latency_ms,
            cache_hits: cache_stats.hits,
            cache_misses: cache_stats.misses,
            cache_hit_rate: cache_stats.hit_rate(),
        }
    }
}

/// Client statistics snapshot
#[derive(Debug, Clone)]
pub struct ClientStats {
    pub http_requests: u64,
    pub http_successes: u64,
    pub http_failures: u64,
    pub avg_latency_ms: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub cache_hit_rate: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_client_connect() {
        let client = AvilaClient::connect("http://localhost:8000").await;
        assert!(client.is_ok());
    }

    #[tokio::test]
    async fn test_client_database() {
        let client = AvilaClient::connect("http://localhost:8000").await.unwrap();
        let db = client.database("testdb").await;
        assert!(db.is_ok());
    }
}
