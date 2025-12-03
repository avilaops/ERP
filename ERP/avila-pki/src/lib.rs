//! # avila-pki - Public Key Infrastructure
extern crate alloc;
use alloc::vec::Vec;

pub struct Certificate {
    pub subject: Vec<u8>,
    pub public_key: Vec<u8>,
}

impl Certificate {
    pub fn new(subject: Vec<u8>, public_key: Vec<u8>) -> Self {
        Self { subject, public_key }
    }
}

pub struct CertificateAuthority {
    pub certificates: Vec<Certificate>,
}

impl CertificateAuthority {
    pub fn new() -> Self {
        Self { certificates: Vec::new() }
    }
    
    pub fn issue(&mut self, cert: Certificate) {
        self.certificates.push(cert);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_ca() {
        let mut ca = CertificateAuthority::new();
        ca.issue(Certificate::new(vec![1], vec![2]));
        assert_eq!(ca.certificates.len(), 1);
    }
}
