//! Query operations

use std::collections::HashMap;
use serde_json::Value;

use crate::{Collection, error::Result};

/// Query result with documents and metadata
#[derive(Debug, Clone)]
pub struct QueryResult {
    pub documents: Vec<crate::Document>,
    pub total_count: usize,
    pub latency_ms: u128,
    pub compression_ratio: f64,
}

/// SQL-like query builder
#[allow(dead_code)]
pub struct Query {
    sql: String,
    collection: Collection,
    params: HashMap<String, Value>,
}

impl Query {
    pub(crate) fn new(sql: String, collection: Collection) -> Self {
        Self {
            sql,
            collection,
            params: HashMap::new(),
        }
    }

    /// Add a query parameter
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use aviladb::Collection;
    /// # async fn example(collection: Collection) -> aviladb::Result<()> {
    /// let results = collection
    ///     .query("SELECT * FROM users WHERE level > @min AND level < @max")
    ///     .param("min", 10)
    ///     .param("max", 50)
    ///     .execute()
    ///     .await?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn param<V: serde::Serialize>(mut self, name: &str, value: V) -> Self {
        let value_json = serde_json::to_value(value).expect("Failed to serialize parameter");
        self.params.insert(name.to_string(), value_json);
        self
    }

    /// Execute the query
    pub async fn execute(self) -> Result<QueryResult> {
        let start = std::time::Instant::now();

        // Validate SQL query
        if self.sql.trim().is_empty() {
            return Err(crate::error::AvilaError::Query(
                "SQL query cannot be empty".to_string()
            ));
        }

        // Get authentication token
        let token = self.collection.auth_provider.get_token().await?;

        // Build query request
        let url = format!(
            "{}/v1/databases/{}/query",
            self.collection.config.endpoint, self.collection.database
        );

        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token))?,
        );
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("application/json"),
        );

        if self.collection.config.enable_compression {
            headers.insert(
                reqwest::header::ACCEPT_ENCODING,
                reqwest::header::HeaderValue::from_static("br"),
            );
        }

        // Build query payload
        let payload = serde_json::json!({
            "query": self.sql,
            "parameters": self.params,
            "collection": self.collection.name
        });

        // Send HTTP POST request
        let query_response: serde_json::Value = self
            .collection
            .http_client
            .post_with_headers(&url, &payload, headers)
            .await?;

        let documents: Vec<crate::Document> = query_response["documents"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| serde_json::from_value(v.clone()).ok())
                    .collect()
            })
            .unwrap_or_default();

        let total_count = query_response["totalCount"].as_u64().unwrap_or(0) as usize;
        let compression_ratio = query_response["compressionRatio"].as_f64().unwrap_or(1.0);

        let latency_ms = start.elapsed().as_millis();

        // Record telemetry
        self.collection.telemetry.record(crate::telemetry::TelemetryEvent {
            operation: crate::telemetry::OperationType::Query,
            database: self.collection.database.clone(),
            collection: self.collection.name.clone(),
            duration_ms: latency_ms as u64,
            success: true,
            error_message: None,
            document_count: documents.len(),
            bytes_transferred: 0,
            compression_ratio,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }).await;

        Ok(QueryResult {
            documents,
            total_count,
            latency_ms,
            compression_ratio,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use crate::{Config, HttpClient, HttpConfig, AuthProvider, TelemetryCollector, TelemetryConfig};

    #[tokio::test]
    async fn test_query_builder() {
        let config = Arc::new(Config::default());
        let http_client = Arc::new(HttpClient::new(HttpConfig::default()).unwrap());
        let auth_provider = Arc::new(AuthProvider::new("http://localhost:8000".to_string()));
        let telemetry = Arc::new(TelemetryCollector::new(TelemetryConfig::default()));

        let collection = Collection::new(
            "users".to_string(),
            "testdb".to_string(),
            config,
            http_client,
            auth_provider,
            telemetry,
        ).unwrap();

        // Test query building (without execution)
        let query = collection
            .query("SELECT * FROM users WHERE level > @min")
            .param("min", 40);

        // Verify query structure
        assert_eq!(query.sql, "SELECT * FROM users WHERE level > @min");
        assert!(query.params.contains_key("min"));
    }
}
