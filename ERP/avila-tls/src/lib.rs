//! # avila-tls - TLS/SSL Protocol
extern crate alloc;
use alloc::vec::Vec;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TlsVersion { TLS12, TLS13 }

pub struct TlsConnection {
    pub version: TlsVersion,
    pub cipher_suite: u16,
}

impl TlsConnection {
    pub fn new(version: TlsVersion) -> Self {
        Self { version, cipher_suite: 0x1301 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_tls() {
        let conn = TlsConnection::new(TlsVersion::TLS13);
        assert_eq!(conn.version, TlsVersion::TLS13);
    }
}
