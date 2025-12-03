//! DKIM (DomainKeys Identified Mail) signing support

use crate::encoding::base64_encode;
use avila_crypto::sha256;
use avila_error::Result;

/// DKIM signature configuration
#[derive(Debug, Clone)]
pub struct DkimConfig {
    pub domain: String,
    pub selector: String,
    pub private_key: Vec<u8>,
    pub headers: Vec<String>,
}

impl DkimConfig {
    pub fn new(domain: String, selector: String, private_key: Vec<u8>) -> Self {
        Self {
            domain,
            selector,
            private_key,
            headers: vec![
                "from".to_string(),
                "to".to_string(),
                "subject".to_string(),
                "date".to_string(),
            ],
        }
    }

    pub fn with_headers(mut self, headers: Vec<String>) -> Self {
        self.headers = headers;
        self
    }
}

/// DKIM signature generator
pub struct DkimSigner {
    config: DkimConfig,
}

impl DkimSigner {
    pub fn new(config: DkimConfig) -> Self {
        Self { config }
    }

    /// Signs email message
    pub fn sign(&self, headers: &str, body: &str) -> Result<String> {
        // Canonicalize body
        let body_canon = self.canonicalize_body(body);

        // Hash body
        let body_hash = sha256::hash(body_canon.as_bytes());
        let body_hash_b64 = base64_encode(&body_hash);

        // Extract headers to sign
        let _headers_to_sign = self.extract_headers(headers);

        // Build DKIM signature header (without signature value)
        let timestamp = 1234567890u64; // Placeholder timestamp
        let dkim_header = format!(
            "v=1; a=rsa-sha256; c=relaxed/simple; d={}; s={}; t={}; bh={}; h={}",
            self.config.domain,
            self.config.selector,
            timestamp,
            body_hash_b64,
            self.config.headers.join(":")
        );

        // TODO: Sign with RSA private key when avila-crypto supports RSA
        // For now, return unsigned header
        Ok(format!("DKIM-Signature: {}; b=PLACEHOLDER", dkim_header))
    }

    /// Canonicalizes body (simple algorithm)
    fn canonicalize_body(&self, body: &str) -> String {
        let mut result = body.trim_end().to_string();
        if !result.ends_with("\r\n") {
            result.push_str("\r\n");
        }
        result
    }

    /// Extracts headers to sign
    fn extract_headers(&self, headers: &str) -> Vec<(String, String)> {
        let mut result = Vec::new();

        for line in headers.lines() {
            if let Some(colon_pos) = line.find(':') {
                let name = line[..colon_pos].trim().to_lowercase();
                let value = line[colon_pos + 1..].trim().to_string();

                if self.config.headers.contains(&name) {
                    result.push((name, value));
                }
            }
        }

        result
    }
}

/// SPF (Sender Policy Framework) validator
pub struct SpfValidator;

impl SpfValidator {
    /// Validates SPF record (placeholder)
    pub fn validate(_domain: &str, _ip: &str) -> Result<SpfResult> {
        // TODO: Implement DNS lookup and SPF validation
        Ok(SpfResult::Neutral)
    }

    /// Parses SPF record
    pub fn parse_record(record: &str) -> Result<SpfRecord> {
        let mechanisms: Vec<String> = record
            .split_whitespace()
            .filter(|s| !s.starts_with("v="))
            .map(|s| s.to_string())
            .collect();

        Ok(SpfRecord { mechanisms })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum SpfResult {
    Pass,
    Fail,
    SoftFail,
    Neutral,
    None,
}

#[derive(Debug, Clone)]
pub struct SpfRecord {
    pub mechanisms: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dkim_config() {
        let config = DkimConfig::new(
            "example.com".to_string(),
            "default".to_string(),
            vec![1, 2, 3],
        );

        assert_eq!(config.domain, "example.com");
        assert_eq!(config.selector, "default");
    }

    #[test]
    fn test_body_canonicalization() {
        let config = DkimConfig::new("test.com".to_string(), "sel".to_string(), vec![]);
        let signer = DkimSigner::new(config);

        let body = "Test body\n\n\n";
        let canon = signer.canonicalize_body(body);
        assert!(canon.ends_with("\r\n"));
    }

    #[test]
    fn test_spf_parse() {
        let record = "v=spf1 mx a ip4:1.2.3.4 ~all";
        let spf = SpfValidator::parse_record(record).unwrap();
        assert!(spf.mechanisms.len() > 0);
    }
}
