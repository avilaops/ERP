//! Collection operations

use std::sync::Arc;
use crate::{
    auth::AuthProvider,
    compression::{compress, CompressionLevel},
    http::HttpClient,
    telemetry::TelemetryCollector,
    Config, Document, InsertResult, Query, Result,
};
use serde_json::json;

/// Collection handle for document operations
#[allow(dead_code)]
#[derive(Clone)]
pub struct Collection {
    pub(crate) name: String,
    pub(crate) database: String,
    pub(crate) config: Arc<Config>,
    pub(crate) http_client: Arc<HttpClient>,
    pub(crate) auth_provider: Arc<AuthProvider>,
    pub(crate) telemetry: Arc<TelemetryCollector>,
}

impl Collection {
    pub(crate) fn new(
        name: String,
        database: String,
        config: Arc<Config>,
        http_client: Arc<HttpClient>,
        auth_provider: Arc<AuthProvider>,
        telemetry: Arc<TelemetryCollector>,
    ) -> Result<Self> {
        Ok(Self {
            name,
            database,
            config,
            http_client,
            auth_provider,
            telemetry,
        })
    }

    /// Get collection name
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Insert a document
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use aviladb::{Collection, Document};
    /// # async fn example(collection: Collection) -> aviladb::Result<()> {
    /// let doc = Document::new()
    ///     .set("userId", "user123")
    ///     .set("name", "João Silva");
    ///
    /// let result = collection.insert(doc).await?;
    /// println!("Inserted: {}", result.id);
    /// # Ok(())
    /// # }
    /// ```
    pub async fn insert(&self, doc: Document) -> Result<InsertResult> {
        let start = std::time::Instant::now();

        // Validate document size
        doc.validate()?;

        // Serialize document
        let doc_json = serde_json::to_vec(&doc)?;
        let original_size = doc_json.len();

        // Compress if enabled
        let (payload, compression_ratio) = if self.config.enable_compression {
            let level = match self.config.compression_level {
                0..=3 => CompressionLevel::Fast,
                4..=7 => CompressionLevel::Balanced,
                _ => CompressionLevel::Best,
            };
            let compressed = compress(&doc_json, level)?;
            let ratio = original_size as f64 / compressed.len() as f64;
            (compressed, ratio)
        } else {
            (doc_json, 1.0)
        };

        // Get authentication token
        let token = self.auth_provider.get_token().await?;

        // Build HTTP request
        let url = format!(
            "{}/v1/databases/{}/collections/{}/documents",
            self.config.endpoint, self.database, self.name
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

        if self.config.enable_compression {
            headers.insert(
                reqwest::header::CONTENT_ENCODING,
                reqwest::header::HeaderValue::from_static("br"),
            );
        }

        // Build JSON payload
        let json_payload = if self.config.enable_compression {
            use base64::Engine;
            json!({
                "data": base64::engine::general_purpose::STANDARD.encode(&payload),
                "compressed": true
            })
        } else {
            json!({
                "data": String::from_utf8_lossy(&payload).to_string(),
                "compressed": false
            })
        };

        // Send HTTP POST request
        let response_data: serde_json::Value = self
            .http_client
            .post_with_headers(&url, &json_payload, headers)
            .await?;
        let doc_id = response_data["id"]
            .as_str()
            .unwrap_or_else(|| "unknown")
            .to_string();

        let latency_ms = start.elapsed().as_millis();

        // Record telemetry
        self.telemetry.record(crate::telemetry::TelemetryEvent {
            operation: crate::telemetry::OperationType::Insert,
            database: self.database.clone(),
            collection: self.name.clone(),
            duration_ms: latency_ms as u64,
            success: true,
            error_message: None,
            document_count: 1,
            bytes_transferred: original_size,
            compression_ratio,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }).await;

        Ok(InsertResult {
            id: doc_id,
            size_bytes: original_size,
            compression_ratio,
            latency_ms,
        })
    }

    /// Insert multiple documents in a batch
    pub async fn insert_batch(&self, docs: Vec<Document>) -> Result<Vec<InsertResult>> {
        let start = std::time::Instant::now();

        // Validate all documents first
        for doc in &docs {
            doc.validate()?;
        }

        // Prepare batch payload
        let mut batch_documents = Vec::new();
        let mut size_info = Vec::new();

        for doc in &docs {
            let doc_json = serde_json::to_vec(doc)?;
            let original_size = doc_json.len();

            // Compress if enabled
            let (payload, compression_ratio) = if self.config.enable_compression {
                let level = CompressionLevel::Balanced;
                let compressed = compress(&doc_json, level)?;
                let ratio = original_size as f64 / compressed.len() as f64;
                (compressed, ratio)
            } else {
                (doc_json.clone(), 1.0)
            };

            batch_documents.push(payload);
            size_info.push((original_size, compression_ratio));
        }

        // Get authentication token
        let token = self.auth_provider.get_token().await?;

        // Build batch request
        let url = format!(
            "{}/v1/databases/{}/collections/{}/documents/batch",
            self.config.endpoint, self.database, self.name
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

        // Create batch payload
        let batch_payload = json!({
            "documents": batch_documents.iter().map(|d| {
                use base64::Engine;
                if self.config.enable_compression {
                    base64::engine::general_purpose::STANDARD.encode(d)
                } else {
                    String::from_utf8_lossy(d).to_string()
                }
            }).collect::<Vec<_>>(),
            "compressed": self.config.enable_compression
        });

        // Send HTTP POST request
        let response_data: serde_json::Value = self
            .http_client
            .post_with_headers(&url, &batch_payload, headers)
            .await?;
        let ids = response_data["ids"]
            .as_array()
            .ok_or_else(|| crate::error::AvilaError::Network("Invalid batch response".to_string()))?;

        let total_latency = start.elapsed().as_millis();
        let avg_latency = total_latency / ids.len().max(1) as u128;

        // Build results
        let results: Vec<InsertResult> = ids
            .iter()
            .zip(size_info.iter())
            .map(|(id, (size, ratio))| InsertResult {
                id: id.as_str().unwrap_or("unknown").to_string(),
                size_bytes: *size,
                compression_ratio: *ratio,
                latency_ms: avg_latency,
            })
            .collect();

        // Record telemetry
        let total_bytes: usize = size_info.iter().map(|(s, _)| s).sum();
        let avg_ratio = size_info.iter().map(|(_, r)| r).sum::<f64>() / results.len().max(1) as f64;

        self.telemetry.record(crate::telemetry::TelemetryEvent {
            operation: crate::telemetry::OperationType::InsertBatch,
            database: self.database.clone(),
            collection: self.name.clone(),
            duration_ms: total_latency as u64,
            success: true,
            error_message: None,
            document_count: docs.len(),
            bytes_transferred: total_bytes,
            compression_ratio: avg_ratio,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }).await;

        Ok(results)
    }

    /// Get a document by ID
    pub async fn get(&self, id: &str) -> Result<Option<Document>> {
        let start = std::time::Instant::now();

        // Get authentication token
        let token = self.auth_provider.get_token().await?;

        // Build HTTP request
        let url = format!(
            "{}/v1/databases/{}/collections/{}/documents/{}",
            self.config.endpoint, self.database, self.name, id
        );

        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token))?,
        );

        if self.config.enable_compression {
            headers.insert(
                reqwest::header::ACCEPT_ENCODING,
                reqwest::header::HeaderValue::from_static("br"),
            );
        }

        // Send HTTP GET request
        let response: Result<Vec<u8>> = self.http_client.get_with_headers(&url, headers).await;

        match response {
            Ok(data) => {
                // Check if response is compressed
                let doc_json = if self.config.enable_compression {
                    crate::compression::decompress(&data)?
                } else {
                    data
                };

                // Deserialize document
                let doc: Document = serde_json::from_slice(&doc_json)?;

                let latency_ms = start.elapsed().as_millis() as u64;

                // Record telemetry
                self.telemetry.record(crate::telemetry::TelemetryEvent {
                    operation: crate::telemetry::OperationType::Get,
                    database: self.database.clone(),
                    collection: self.name.clone(),
                    duration_ms: latency_ms,
                    success: true,
                    error_message: None,
                    document_count: 1,
                    bytes_transferred: doc_json.len(),
                    compression_ratio: if self.config.enable_compression { 2.0 } else { 1.0 },
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                }).await;

                Ok(Some(doc))
            }
            Err(crate::error::AvilaError::Network(msg)) if msg.contains("404") => {
                // Document not found
                Ok(None)
            }
            Err(e) => Err(e),
        }
    }

    /// Create a new query
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use aviladb::Collection;
    /// # async fn example(collection: Collection) -> aviladb::Result<()> {
    /// let results = collection
    ///     .query("SELECT * FROM users WHERE level > @min")
    ///     .param("min", 40)
    ///     .execute()
    ///     .await?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn query(&self, sql: &str) -> Query {
        Query::new(sql.to_string(), self.clone())
    }

    /// Update documents matching criteria
    pub async fn update(&self) -> UpdateBuilder {
        UpdateBuilder::new(self.clone())
    }

    /// Delete documents matching criteria
    pub async fn delete(&self) -> DeleteBuilder {
        DeleteBuilder::new(self.clone())
    }

    /// Create a vector index for semantic search
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use aviladb::Collection;
    /// # async fn example(collection: Collection) -> aviladb::Result<()> {
    /// collection.create_vector_index("embedding", 1536, "cosine").await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn create_vector_index(
        &self,
        _field: &str,
        _dimension: usize,
        _metric: &str,
    ) -> Result<()> {
        // TODO: Send CREATE VECTOR INDEX request
        Ok(())
    }

    /// Perform vector search
    pub async fn vector_search(
        &self,
        field: &str,
        query_vector: Vec<f32>,
    ) -> VectorSearchBuilder {
        VectorSearchBuilder::new(self.clone(), field.to_string(), query_vector)
    }
}

/// Builder for update operations
#[allow(dead_code)]
pub struct UpdateBuilder {
    collection: Collection,
    updates: Vec<(String, serde_json::Value)>,
    conditions: Vec<String>,
}

impl UpdateBuilder {
    fn new(collection: Collection) -> Self {
        Self {
            collection,
            updates: Vec::new(),
            conditions: Vec::new(),
        }
    }

    pub fn set<V: serde::Serialize>(mut self, field: &str, value: V) -> Self {
        let value_json = serde_json::to_value(value).expect("Failed to serialize");
        self.updates.push((field.to_string(), value_json));
        self
    }

    pub fn where_eq<V: serde::Serialize + std::fmt::Debug>(mut self, field: &str, value: V) -> Self {
        self.conditions.push(format!("{} = {:?}", field, value));
        self
    }

    pub async fn execute(self) -> Result<usize> {
        let start = std::time::Instant::now();

        // Validate we have updates to perform
        if self.updates.is_empty() {
            return Err(crate::error::AvilaError::Query(
                "No fields to update".to_string()
            ));
        }

        // Validate we have conditions (prevent accidental full-table updates)
        if self.conditions.is_empty() {
            return Err(crate::error::AvilaError::Query(
                "Update without WHERE clause requires explicit confirmation".to_string()
            ));
        }

        // Get authentication token
        let token = self.collection.auth_provider.get_token().await?;

        // Build update request
        let url = format!(
            "{}/v1/databases/{}/collections/{}/update",
            self.collection.config.endpoint,
            self.collection.database,
            self.collection.name
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

        // Convert updates to JSON object
        let mut update_fields = serde_json::Map::new();
        for (field, value) in self.updates {
            update_fields.insert(field, value);
        }

        // Build payload
        let payload = json!({
            "updates": update_fields,
            "where": self.conditions.join(" AND ")
        });

        // Send HTTP PATCH request
        let response_data: serde_json::Value = self
            .collection
            .http_client
            .patch_with_headers(&url, &payload, headers)
            .await?;
        let updated_count = response_data["updatedCount"].as_u64().unwrap_or(0) as usize;

        let latency_ms = start.elapsed().as_millis() as u64;

        // Record telemetry
        self.collection.telemetry.record(crate::telemetry::TelemetryEvent {
            operation: crate::telemetry::OperationType::Update,
            database: self.collection.database.clone(),
            collection: self.collection.name.clone(),
            duration_ms: latency_ms,
            success: true,
            error_message: None,
            document_count: updated_count,
            bytes_transferred: 0,
            compression_ratio: 1.0,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }).await;

        Ok(updated_count)
    }
}

/// Builder for delete operations
#[allow(dead_code)]
pub struct DeleteBuilder {
    collection: Collection,
    conditions: Vec<String>,
}

impl DeleteBuilder {
    fn new(collection: Collection) -> Self {
        Self {
            collection,
            conditions: Vec::new(),
        }
    }

    pub fn where_eq<V: serde::Serialize + std::fmt::Debug>(mut self, field: &str, value: V) -> Self {
        self.conditions.push(format!("{} = {:?}", field, value));
        self
    }

    pub async fn execute(self) -> Result<usize> {
        let start = std::time::Instant::now();

        // Critical safety check: prevent accidental full-table deletes
        if self.conditions.is_empty() {
            return Err(crate::error::AvilaError::Query(
                "Delete without WHERE clause is dangerous and not allowed. Use explicit method if needed.".to_string()
            ));
        }

        // Get authentication token
        let token = self.collection.auth_provider.get_token().await?;

        // Build delete request
        let url = format!(
            "{}/v1/databases/{}/collections/{}/delete",
            self.collection.config.endpoint,
            self.collection.database,
            self.collection.name
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

        // Build payload
        let payload = json!({
            "where": self.conditions.join(" AND ")
        });

        // Send HTTP POST request to delete endpoint (DELETE with body)
        let response_data: serde_json::Value = self
            .collection
            .http_client
            .post_with_headers(&url, &payload, headers)
            .await?;
        let deleted_count = response_data["deletedCount"].as_u64().unwrap_or(0) as usize;

        let latency_ms = start.elapsed().as_millis() as u64;

        // Record telemetry
        self.collection.telemetry.record(crate::telemetry::TelemetryEvent {
            operation: crate::telemetry::OperationType::Delete,
            database: self.collection.database.clone(),
            collection: self.collection.name.clone(),
            duration_ms: latency_ms,
            success: true,
            error_message: None,
            document_count: deleted_count,
            bytes_transferred: 0,
            compression_ratio: 1.0,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }).await;

        Ok(deleted_count)
    }
}

/// Builder for vector search operations
#[allow(dead_code)]
pub struct VectorSearchBuilder {
    collection: Collection,
    field: String,
    query_vector: Vec<f32>,
    top_k: usize,
    similarity_threshold: Option<f32>,
}

impl VectorSearchBuilder {
    fn new(collection: Collection, field: String, query_vector: Vec<f32>) -> Self {
        Self {
            collection,
            field,
            query_vector,
            top_k: 10,
            similarity_threshold: None,
        }
    }

    /// Set the number of results to return
    pub fn top_k(mut self, k: usize) -> Self {
        self.top_k = k;
        self
    }

    /// Set minimum similarity threshold (0.0 - 1.0)
    pub fn min_similarity(mut self, threshold: f32) -> Self {
        self.similarity_threshold = Some(threshold.clamp(0.0, 1.0));
        self
    }

    pub async fn execute(self) -> Result<Vec<Document>> {
        let start = std::time::Instant::now();

        // Validate vector dimension
        if self.query_vector.is_empty() {
            return Err(crate::error::AvilaError::VectorSearch(
                "Query vector cannot be empty".to_string()
            ));
        }

        // Validate top_k
        if self.top_k == 0 {
            return Err(crate::error::AvilaError::VectorSearch(
                "top_k must be greater than 0".to_string()
            ));
        }

        // TODO: Implement HNSW-based vector search
        // 1. Normalize query vector
        // 2. Use HNSW index for approximate nearest neighbors
        // 3. Apply similarity threshold if set
        // 4. Return top-k results with scores

        let _latency_ms = start.elapsed().as_millis() as u64;

        // For now, return empty results
        Ok(vec![])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{HttpClient, HttpConfig, AuthProvider, TelemetryCollector, TelemetryConfig};

    #[tokio::test]
    async fn test_collection_insert() {
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
        );

        // Test collection creation
        assert!(collection.is_ok());

        let collection = collection.unwrap();
        assert_eq!(collection.name, "users");
        assert_eq!(collection.database, "testdb");

        // Test document creation (without HTTP call)
        let doc = Document::new()
            .set("userId", "user123")
            .set("name", "Test User");

        let user_id: Result<String> = doc.get("userId");
        assert!(user_id.is_ok());
    }
}
