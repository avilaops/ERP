//! Database operations

use std::sync::Arc;
use crate::{
    auth::AuthProvider,
    http::HttpClient,
    telemetry::TelemetryCollector,
    Collection, Config, Result,
};

/// Database handle for collections
#[derive(Clone)]
pub struct Database {
    name: String,
    config: Arc<Config>,
    http_client: Arc<HttpClient>,
    auth_provider: Arc<AuthProvider>,
    telemetry: Arc<TelemetryCollector>,
}

impl Database {
    pub(crate) fn new(
        name: String,
        config: Arc<Config>,
        http_client: Arc<HttpClient>,
        auth_provider: Arc<AuthProvider>,
        telemetry: Arc<TelemetryCollector>,
    ) -> Result<Self> {
        Ok(Self {
            name,
            config,
            http_client,
            auth_provider,
            telemetry,
        })
    }

    /// Get database name
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get a collection handle
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use aviladb::{AvilaClient, Database};
    /// # async fn example(db: Database) -> aviladb::Result<()> {
    /// let players = db.collection("players").await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn collection(&self, name: &str) -> Result<Collection> {
        Collection::new(
            name.to_string(),
            self.name.clone(),
            self.config.clone(),
            self.http_client.clone(),
            self.auth_provider.clone(),
            self.telemetry.clone(),
        )
    }

    /// Create a new collection
    pub async fn create_collection(&self, name: &str, partition_key: &str) -> Result<Collection> {
        // Send CREATE COLLECTION HTTP request
        let token = self.auth_provider.get_token().await?;
        let url = format!("/v1/databases/{}/collections", self.name);
        
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
            "partitionKey": partition_key
        });

        let _response: serde_json::Value = self.http_client
            .post_with_headers(&url, &payload, headers)
            .await?;

        self.collection(name).await
    }

    /// List all collections
    pub async fn list_collections(&self) -> Result<Vec<String>> {
        // TODO: Send LIST COLLECTIONS request
        Ok(vec![])
    }

    /// Delete a collection
    pub async fn delete_collection(&self, name: &str) -> Result<()> {
        // Send DELETE COLLECTION HTTP request
        let token = self.auth_provider.get_token().await?;
        let url = format!("/v1/databases/{}/collections/{}", self.name, name);
        
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{HttpClient, HttpConfig, AuthProvider, TelemetryCollector, TelemetryConfig};

    #[tokio::test]
    async fn test_database_collection() {
        let config = Arc::new(Config::default());
        let http_client = Arc::new(HttpClient::new(HttpConfig::default()).unwrap());
        let auth_provider = Arc::new(AuthProvider::new("http://localhost:8000".to_string()));
        let telemetry = Arc::new(TelemetryCollector::new(TelemetryConfig::default()));

        let db = Database::new(
            "testdb".to_string(),
            config,
            http_client,
            auth_provider,
            telemetry,
        ).unwrap();

        let collection = db.collection("users").await;
        assert!(collection.is_ok());
    }
}
