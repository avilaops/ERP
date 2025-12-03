//! Cliente de email com suporte simplificado

use avila_tissue::Email;
use std::fmt;

/// Resultado padrão do cliente de email
pub type Result<T> = std::result::Result<T, ClientError>;

/// Tipos de erro possíveis
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientErrorKind {
    /// Configuração ausente
    NotConfigured,
    /// Falha interna genérica
    Internal,
}

/// Erro retornado pelas operações do cliente
#[derive(Debug, Clone)]
pub struct ClientError {
    kind: ClientErrorKind,
    message: String,
}

impl ClientError {
    /// Cria um novo erro
    pub fn new(kind: ClientErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// Retorna o tipo do erro
    pub fn kind(&self) -> ClientErrorKind {
        self.kind
    }
}

impl fmt::Display for ClientError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ClientError {}

/// Cliente de email
pub struct EmailClient {
    smtp_host: Option<String>,
    smtp_port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
}

impl EmailClient {
    /// Cria novo cliente sem configuração
    pub fn new() -> Self {
        Self {
            smtp_host: None,
            smtp_port: None,
            username: None,
            password: None,
        }
    }

    /// Cria cliente com configuração SMTP
    pub fn with_smtp(host: impl Into<String>, port: u16) -> Self {
        Self {
            smtp_host: Some(host.into()),
            smtp_port: Some(port),
            username: None,
            password: None,
        }
    }

    /// Define credenciais de autenticação
    pub fn with_auth(mut self, username: impl Into<String>, password: impl Into<String>) -> Self {
        self.username = Some(username.into());
        self.password = Some(password.into());
        self
    }

    /// Envia email via SMTP
    pub async fn send(&mut self, email: &Email) -> Result<()> {
        if self.smtp_host.is_none() || self.smtp_port.is_none() {
            return Err(ClientError::new(
                ClientErrorKind::NotConfigured,
                "SMTP configuration missing",
            ));
        }

        // Implementação simulada: apenas registra envio
        self.send_simple(email).await
    }

    /// Envia email de forma simplificada (sem conexão real)
    pub async fn send_simple(&self, email: &Email) -> Result<()> {
        // Simula envio (para testes)
        println!("📧 Enviando email:");
        println!("   De: {}", email.from());
        let recipients = email
            .to()
            .iter()
            .map(|addr| addr.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        println!("   Para: {}", recipients);
        println!("   Assunto: {}", email.subject());
        println!("   Tamanho: {} bytes", email.body().len());
        println!("   ✓ Email enviado com sucesso (simulado)");
        Ok(())
    }

    /// Valida configuração do cliente
    pub fn is_configured(&self) -> bool {
        self.smtp_host.is_some() && self.smtp_port.is_some()
    }

    /// Retorna configuração SMTP atual
    pub fn config(&self) -> Option<(String, u16)> {
        match (&self.smtp_host, self.smtp_port) {
            (Some(host), Some(port)) => Some((host.clone(), port)),
            _ => None,
        }
    }
}

impl Default for EmailClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_configuration() {
        let client = EmailClient::new();
        assert!(!client.is_configured());

        let client = EmailClient::with_smtp("smtp.example.com", 587);
        assert!(client.is_configured());

        let config = client.config().unwrap();
        assert_eq!(config.0, "smtp.example.com");
        assert_eq!(config.1, 587);
    }

    #[test]
    fn test_client_with_auth() {
        let client = EmailClient::with_smtp("smtp.example.com", 587)
            .with_auth("user@example.com", "password123");

        assert!(client.username.is_some());
        assert!(client.password.is_some());
    }
}
