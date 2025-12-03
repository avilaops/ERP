//! Authentication and authorization

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::error::{AvilaError, Result};

/// Authentication token
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthToken {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: u64,
    pub token_type: String,
}

impl AuthToken {
    /// Check if token is expired
    pub fn is_expired(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now >= self.expires_at
    }

    /// Time until expiration
    pub fn time_until_expiry(&self) -> Option<Duration> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        if now < self.expires_at {
            Some(Duration::from_secs(self.expires_at - now))
        } else {
            None
        }
    }
}

/// Authentication credentials
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub api_key: String,
    pub api_secret: Option<String>,
}

/// Authentication provider
pub struct AuthProvider {
    credentials: Arc<RwLock<Option<Credentials>>>,
    token: Arc<RwLock<Option<AuthToken>>>,
    endpoint: String,
}

impl AuthProvider {
    /// Create new authentication provider
    pub fn new(endpoint: String) -> Self {
        Self {
            credentials: Arc::new(RwLock::new(None)),
            token: Arc::new(RwLock::new(None)),
            endpoint,
        }
    }

    /// Set credentials
    pub async fn set_credentials(&self, credentials: Credentials) {
        let mut creds = self.credentials.write().await;
        *creds = Some(credentials);
    }

    /// Get valid access token (refresh if needed)
    pub async fn get_token(&self) -> Result<String> {
        let token = self.token.read().await;

        if let Some(ref t) = *token {
            if !t.is_expired() {
                return Ok(t.access_token.clone());
            }
        }
        drop(token);

        // Token expired or doesn't exist, authenticate
        self.authenticate().await
    }

    /// Authenticate and get new token
    async fn authenticate(&self) -> Result<String> {
        let creds = self.credentials.read().await;
        let credentials = creds.as_ref()
            .ok_or_else(|| AvilaError::Config("No credentials configured".to_string()))?;

        // Make HTTP request to auth endpoint
        let auth_url = format!("{}/v1/auth/token", self.endpoint);

        let client = reqwest::Client::new();
        let response = client
            .post(&auth_url)
            .json(&serde_json::json!({
                "apiKey": credentials.api_key,
                "apiSecret": credentials.api_secret,
                "grantType": "client_credentials"
            }))
            .send()
            .await
            .map_err(|e| AvilaError::Network(format!("Auth request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AvilaError::Config(format!("Authentication failed ({}): {}", status, error_text)));
        }

        let token: AuthToken = response
            .json()
            .await
            .map_err(|e| AvilaError::Serialization(format!("Failed to parse auth response: {}", e)))?;

        let access_token = token.access_token.clone();

        let mut token_lock = self.token.write().await;
        *token_lock = Some(token);

        Ok(access_token)
    }

    /// Refresh token if refresh_token is available
    pub async fn refresh_token(&self) -> Result<String> {
        let token = self.token.read().await;

        let refresh_token = token.as_ref()
            .and_then(|t| t.refresh_token.clone())
            .ok_or_else(|| AvilaError::Config("No refresh token available".to_string()))?;

        drop(token);

        // Make HTTP request to refresh endpoint
        let refresh_url = format!("{}/v1/auth/refresh", self.endpoint);

        let client = reqwest::Client::new();
        let response = client
            .post(&refresh_url)
            .json(&serde_json::json!({
                "refreshToken": refresh_token
            }))
            .send()
            .await
            .map_err(|e| AvilaError::Network(format!("Token refresh failed: {}", e)))?;

        if !response.status().is_success() {
            // Refresh failed, try full re-authentication
            return self.authenticate().await;
        }

        let new_token: AuthToken = response
            .json()
            .await
            .map_err(|e| AvilaError::Serialization(format!("Failed to parse refresh response: {}", e)))?;

        let access_token = new_token.access_token.clone();

        let mut token_lock = self.token.write().await;
        *token_lock = Some(new_token);

        Ok(access_token)
    }

    /// Clear authentication state
    pub async fn clear(&self) {
        let mut token = self.token.write().await;
        *token = None;

        let mut creds = self.credentials.write().await;
        *creds = None;
    }
}

/// Authorization scope
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Scope {
    /// Read-only access
    Read,
    /// Write access
    Write,
    /// Delete access
    Delete,
    /// Admin access
    Admin,
}

/// Check if user has required scope
pub fn has_scope(user_scopes: &[Scope], required: &Scope) -> bool {
    // Admin has all permissions
    if user_scopes.contains(&Scope::Admin) {
        return true;
    }

    user_scopes.contains(required)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_expiry() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let token = AuthToken {
            access_token: "test".to_string(),
            refresh_token: None,
            expires_at: now + 3600,
            token_type: "Bearer".to_string(),
        };

        assert!(!token.is_expired());
        assert!(token.time_until_expiry().is_some());
    }

    #[test]
    fn test_expired_token() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let token = AuthToken {
            access_token: "test".to_string(),
            refresh_token: None,
            expires_at: now - 1,
            token_type: "Bearer".to_string(),
        };

        assert!(token.is_expired());
        assert!(token.time_until_expiry().is_none());
    }

    #[tokio::test]
    async fn test_auth_provider() {
        let provider = AuthProvider::new("http://localhost:8000".to_string());

        let creds = Credentials {
            api_key: "test_key".to_string(),
            api_secret: Some("test_secret".to_string()),
        };

        provider.set_credentials(creds).await;

        let token = provider.get_token().await;
        assert!(token.is_ok());
    }

    #[test]
    fn test_has_scope() {
        let user_scopes = vec![Scope::Read, Scope::Write];

        assert!(has_scope(&user_scopes, &Scope::Read));
        assert!(has_scope(&user_scopes, &Scope::Write));
        assert!(!has_scope(&user_scopes, &Scope::Delete));

        let admin_scopes = vec![Scope::Admin];
        assert!(has_scope(&admin_scopes, &Scope::Read));
        assert!(has_scope(&admin_scopes, &Scope::Write));
        assert!(has_scope(&admin_scopes, &Scope::Delete));
    }

    #[tokio::test]
    async fn test_clear_auth() {
        let provider = AuthProvider::new("http://localhost:8000".to_string());

        let creds = Credentials {
            api_key: "test".to_string(),
            api_secret: None,
        };

        provider.set_credentials(creds).await;
        provider.get_token().await.unwrap();

        provider.clear().await;

        // Should fail after clear
        let result = provider.get_token().await;
        assert!(result.is_err());
    }
}
