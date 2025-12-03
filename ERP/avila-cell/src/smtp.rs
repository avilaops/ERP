//! SMTP (Simple Mail Transfer Protocol) - Envio de emails avançado

use crate::{message::Email, auth::{AuthCapabilities, auth_plain, auth_login_username, auth_login_password, auth_xoauth2}};
use avila_error::{Error, ErrorKind, Result};
use avila_molecule::{NetworkAddress, tcp::TcpClient};
use std::time::Duration;

/// SMTP client with advanced features
pub struct SmtpClient {
    client: TcpClient,
    capabilities: Option<AuthCapabilities>,
    authenticated: bool,
    timeout: Duration,
}

/// SMTP connection security
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SmtpSecurity {
    /// No encryption (port 25)
    None,
    /// STARTTLS (port 587)
    StartTls,
    /// TLS/SSL from start (port 465)
    Tls,
}

impl SmtpClient {
    /// Connects to SMTP server
    pub async fn connect(server: NetworkAddress) -> Result<Self> {
        Self::connect_with_security(server, SmtpSecurity::None).await
    }

    /// Connects with specific security mode
    pub async fn connect_with_security(server: NetworkAddress, _security: SmtpSecurity) -> Result<Self> {
        // For now, only support plain TCP (TLS support requires avila-molecule updates)
        let client = TcpClient::connect(server).await?;

        let mut smtp = Self {
            client,
            capabilities: None,
            authenticated: false,
            timeout: Duration::from_secs(30),
        };

        // Read banner
        let response = smtp.read_response().await?;
        if !response.starts_with("220") {
            return Err(Error::new(
                ErrorKind::Network,
                format!("Invalid SMTP banner: {}", response),
            ));
        }

        Ok(smtp)
    }

    /// Sends EHLO and discovers capabilities
    pub async fn ehlo(&mut self, domain: &str) -> Result<()> {
        let cmd = format!("EHLO {}\r\n", domain);
        self.send(&cmd).await?;

        let response = self.read_response().await?;
        if !response.starts_with("250") {
            return Err(Error::new(
                ErrorKind::Network,
                format!("EHLO failed: {}", response),
            ));
        }

        self.capabilities = Some(AuthCapabilities::from_ehlo_response(&response));
        Ok(())
    }

    /// Authenticates using PLAIN mechanism
    pub async fn auth_plain(&mut self, username: &str, password: &str) -> Result<()> {
        let auth_str = auth_plain(username, password);
        let cmd = format!("AUTH PLAIN {}\r\n", auth_str);

        self.send(&cmd).await?;
        let response = self.read_response().await?;

        if response.starts_with("235") {
            self.authenticated = true;
            Ok(())
        } else {
            Err(Error::new(
                ErrorKind::InvalidInput,
                format!("Authentication failed: {}", response),
            ))
        }
    }

    /// Authenticates using LOGIN mechanism
    pub async fn auth_login(&mut self, username: &str, password: &str) -> Result<()> {
        self.send("AUTH LOGIN\r\n").await?;
        let response = self.read_response().await?;

        if !response.starts_with("334") {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                format!("AUTH LOGIN failed: {}", response),
            ));
        }

        // Send username
        let username_b64 = auth_login_username(username);
        self.send(&format!("{}\r\n", username_b64)).await?;
        let response = self.read_response().await?;

        if !response.starts_with("334") {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                format!("Username rejected: {}", response),
            ));
        }

        // Send password
        let password_b64 = auth_login_password(password);
        self.send(&format!("{}\r\n", password_b64)).await?;
        let response = self.read_response().await?;

        if response.starts_with("235") {
            self.authenticated = true;
            Ok(())
        } else {
            Err(Error::new(
                ErrorKind::InvalidInput,
                format!("Password rejected: {}", response),
            ))
        }
    }

    /// Authenticates using XOAUTH2 (for Gmail/Outlook)
    pub async fn auth_xoauth2(&mut self, username: &str, access_token: &str) -> Result<()> {
        let auth_str = auth_xoauth2(username, access_token);
        let cmd = format!("AUTH XOAUTH2 {}\r\n", auth_str);

        self.send(&cmd).await?;
        let response = self.read_response().await?;

        if response.starts_with("235") {
            self.authenticated = true;
            Ok(())
        } else {
            Err(Error::new(
                ErrorKind::InvalidInput,
                format!("XOAUTH2 failed: {}", response),
            ))
        }
    }

    /// Sends email with multipart support
    pub async fn send_email(&mut self, email: &Email) -> Result<()> {
        // MAIL FROM
        let cmd = format!("MAIL FROM:<{}>\r\n", email.from);
        self.send(&cmd).await?;
        self.expect_response("250").await?;

        // RCPT TO (for all recipients)
        for recipient in &email.to {
            let cmd = format!("RCPT TO:<{}>\r\n", recipient);
            self.send(&cmd).await?;
            self.expect_response("250").await?;
        }

        // CC recipients
        for recipient in &email.cc {
            let cmd = format!("RCPT TO:<{}>\r\n", recipient);
            self.send(&cmd).await?;
            self.expect_response("250").await?;
        }

        // BCC recipients
        for recipient in &email.bcc {
            let cmd = format!("RCPT TO:<{}>\r\n", recipient);
            self.send(&cmd).await?;
            self.expect_response("250").await?;
        }

        // DATA
        self.send("DATA\r\n").await?;
        self.expect_response("354").await?;

        // Message body (multipart)
        let message = email.to_mime();
        self.send(&message).await?;
        self.send("\r\n.\r\n").await?;
        self.expect_response("250").await?;

        Ok(())
    }

    /// Verifies email address
    pub async fn verify(&mut self, email: &str) -> Result<bool> {
        let cmd = format!("VRFY {}\r\n", email);
        self.send(&cmd).await?;
        let response = self.read_response().await?;

        Ok(response.starts_with("250") || response.starts_with("251"))
    }

    /// Resets session
    pub async fn reset(&mut self) -> Result<()> {
        self.send("RSET\r\n").await?;
        self.expect_response("250").await?;
        Ok(())
    }

    /// Closes connection
    pub async fn quit(&mut self) -> Result<()> {
        self.send("QUIT\r\n").await?;
        let _ = self.read_response().await;
        Ok(())
    }

    /// Gets capabilities
    pub fn capabilities(&self) -> Option<&AuthCapabilities> {
        self.capabilities.as_ref()
    }

    /// Checks if authenticated
    pub fn is_authenticated(&self) -> bool {
        self.authenticated
    }

    /// Sets timeout for operations
    pub fn set_timeout(&mut self, timeout: Duration) {
        self.timeout = timeout;
    }

    /// Gets current timeout
    pub fn timeout(&self) -> Duration {
        self.timeout
    }

    async fn send(&mut self, data: &str) -> Result<()> {
        self.client.send(data.as_bytes()).await
    }

    async fn read_response(&mut self) -> Result<String> {
        let mut buffer = vec![0u8; 4096];
        let n = self.client.receive(&mut buffer).await?;

        Ok(String::from_utf8_lossy(&buffer[..n]).to_string())
    }

    async fn expect_response(&mut self, expected_code: &str) -> Result<String> {
        let response = self.read_response().await?;

        if !response.starts_with(expected_code) {
            return Err(Error::new(
                ErrorKind::Network,
                format!("Unexpected response: expected {}, received {}", expected_code, response),
            ));
        }

        Ok(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smtp_security() {
        assert_eq!(SmtpSecurity::None, SmtpSecurity::None);
        assert_ne!(SmtpSecurity::Tls, SmtpSecurity::StartTls);
    }
}
