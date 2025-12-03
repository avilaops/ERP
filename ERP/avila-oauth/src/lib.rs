//! # avila-oauth - OAuth 2.0
extern crate alloc;
use alloc::string::String;

pub struct AccessToken {
    pub token: String,
    pub expires_in: u64,
}

impl AccessToken {
    pub fn new(token: String, expires_in: u64) -> Self {
        Self { token, expires_in }
    }
    
    pub fn is_expired(&self, now: u64) -> bool {
        now > self.expires_in
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_token() {
        let token = AccessToken::new("abc123".into(), 3600);
        assert!(!token.is_expired(1000));
    }
}
