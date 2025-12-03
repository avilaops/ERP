//! SMTP Authentication mechanisms

use crate::encoding::base64_encode;
use avila_error::Result;

/// SMTP Authentication mechanism
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthMechanism {
    /// PLAIN authentication
    Plain,
    /// LOGIN authentication
    Login,
    /// CRAM-MD5 authentication
    CramMd5,
    /// XOAUTH2 (for Gmail/Outlook)
    XOAuth2,
}

impl AuthMechanism {
    /// Returns the SASL name
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Plain => "PLAIN",
            Self::Login => "LOGIN",
            Self::CramMd5 => "CRAM-MD5",
            Self::XOAuth2 => "XOAUTH2",
        }
    }
}

/// Generates PLAIN authentication string
pub fn auth_plain(username: &str, password: &str) -> String {
    let auth_str = format!("\0{}\0{}", username, password);
    base64_encode(auth_str.as_bytes())
}

/// Generates LOGIN authentication (step 1: username)
pub fn auth_login_username(username: &str) -> String {
    base64_encode(username.as_bytes())
}

/// Generates LOGIN authentication (step 2: password)
pub fn auth_login_password(password: &str) -> String {
    base64_encode(password.as_bytes())
}

/// Generates CRAM-MD5 response
pub fn auth_cram_md5(username: &str, _password: &str, challenge: &str) -> Result<String> {
    // Decode challenge
    let _challenge_bytes = crate::encoding::base64_decode(challenge)?;

    // TODO: Implement HMAC-MD5 when avila-crypto supports it
    // For now, return a placeholder
    let response = format!("{} {}", username, "placeholder_digest");
    Ok(base64_encode(response.as_bytes()))
}

/// Generates XOAUTH2 string for Gmail/Outlook
pub fn auth_xoauth2(username: &str, access_token: &str) -> String {
    let auth_str = format!(
        "user={}\x01auth=Bearer {}\x01\x01",
        username, access_token
    );
    base64_encode(auth_str.as_bytes())
}

/// Supported authentication capabilities from EHLO response
#[derive(Debug, Default)]
pub struct AuthCapabilities {
    /// Supports PLAIN
    pub plain: bool,
    /// Supports LOGIN
    pub login: bool,
    /// Supports CRAM-MD5
    pub cram_md5: bool,
    /// Supports XOAUTH2
    pub xoauth2: bool,
    /// Supports STARTTLS
    pub starttls: bool,
    /// Supports 8BITMIME
    pub eight_bit_mime: bool,
    /// Supports PIPELINING
    pub pipelining: bool,
    /// Maximum message size
    pub size: Option<usize>,
}

impl AuthCapabilities {
    /// Parses EHLO response
    pub fn from_ehlo_response(response: &str) -> Self {
        let mut caps = Self::default();

        for line in response.lines() {
            let line = line.trim();

            if line.contains("AUTH") {
                if line.contains("PLAIN") {
                    caps.plain = true;
                }
                if line.contains("LOGIN") {
                    caps.login = true;
                }
                if line.contains("CRAM-MD5") {
                    caps.cram_md5 = true;
                }
                if line.contains("XOAUTH2") {
                    caps.xoauth2 = true;
                }
            }

            if line.contains("STARTTLS") {
                caps.starttls = true;
            }

            if line.contains("8BITMIME") {
                caps.eight_bit_mime = true;
            }

            if line.contains("PIPELINING") {
                caps.pipelining = true;
            }

            if line.starts_with("250-SIZE") || line.starts_with("250 SIZE") {
                if let Some(size_str) = line.split_whitespace().nth(1) {
                    caps.size = size_str.parse().ok();
                }
            }
        }

        caps
    }

    /// Gets the best authentication mechanism available
    pub fn best_auth_mechanism(&self) -> Option<AuthMechanism> {
        if self.cram_md5 {
            Some(AuthMechanism::CramMd5)
        } else if self.plain {
            Some(AuthMechanism::Plain)
        } else if self.login {
            Some(AuthMechanism::Login)
        } else if self.xoauth2 {
            Some(AuthMechanism::XOAuth2)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_plain() {
        let auth = auth_plain("user", "pass");
        assert!(!auth.is_empty());
    }

    #[test]
    fn test_auth_login() {
        let username = auth_login_username("user");
        let password = auth_login_password("pass");
        assert!(!username.is_empty());
        assert!(!password.is_empty());
    }

    #[test]
    fn test_auth_xoauth2() {
        let auth = auth_xoauth2("user@gmail.com", "ya29.token123");
        // O resultado é base64 de "user=user@gmail.com\x01auth=Bearer ya29.token123\x01\x01"
        assert!(!auth.is_empty());
        assert!(auth.len() > 20); // Verifica que tem conteúdo base64 razoável
    }

    #[test]
    fn test_auth_capabilities() {
        let response = "250-STARTTLS\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n";
        let caps = AuthCapabilities::from_ehlo_response(response);

        assert!(caps.starttls);
        assert!(caps.plain);
        assert!(caps.login);
        assert!(caps.eight_bit_mime);
        assert_eq!(caps.best_auth_mechanism(), Some(AuthMechanism::Plain));
    }
}
