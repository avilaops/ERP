//! Connection pooling for SMTP clients

use crate::smtp::{SmtpClient, SmtpSecurity};
use avila_error::{Error, ErrorKind, Result};
use avila_molecule::NetworkAddress;
use std::collections::VecDeque;

/// Connection pool for SMTP clients
pub struct SmtpPool {
    host: String,
    port: u16,
    security: SmtpSecurity,
    max_connections: usize,
    available: VecDeque<SmtpClient>,
    in_use: usize,
}

impl SmtpPool {
    /// Creates a new connection pool
    pub fn new(host: String, port: u16, max_connections: usize) -> Self {
        Self {
            host,
            port,
            security: SmtpSecurity::None,
            max_connections,
            available: VecDeque::new(),
            in_use: 0,
        }
    }

    /// Creates pool with security
    pub fn with_security(host: String, port: u16, security: SmtpSecurity, max_connections: usize) -> Self {
        Self {
            host,
            port,
            security,
            max_connections,
            available: VecDeque::new(),
            in_use: 0,
        }
    }

    /// Acquires a connection from the pool
    pub async fn acquire(&mut self) -> Result<SmtpClient> {
        // Try to get an available connection
        if let Some(client) = self.available.pop_front() {
            self.in_use += 1;
            return Ok(client);
        }

        // Create a new connection if under max
        if self.in_use < self.max_connections {
            let mut client = SmtpClient::connect_with_security(
                NetworkAddress::new(&self.host, self.port),
                self.security.clone()
            ).await?;
            self.in_use += 1;
            return Ok(client);
        }

        // Pool exhausted
        Err(Error::new(
            ErrorKind::Network,
            "Connection pool exhausted",
        ))
    }

    /// Returns a connection to the pool
    pub fn release(&mut self, client: SmtpClient) {
        self.available.push_back(client);
        if self.in_use > 0 {
            self.in_use -= 1;
        }
    }

    /// Gets pool statistics
    pub fn stats(&self) -> PoolStats {
        PoolStats {
            available: self.available.len(),
            in_use: self.in_use,
            total: self.available.len() + self.in_use,
            max: self.max_connections,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PoolStats {
    pub available: usize,
    pub in_use: usize,
    pub total: usize,
    pub max: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pool_creation() {
        let pool = SmtpPool::new("smtp.test.com".to_string(), 587, 10);
        let stats = pool.stats();

        assert_eq!(stats.max, 10);
        assert_eq!(stats.available, 0);
        assert_eq!(stats.in_use, 0);
    }
}
