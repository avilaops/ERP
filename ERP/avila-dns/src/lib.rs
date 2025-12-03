//! # avila-dns
extern crate alloc;
use alloc::string::String;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RecordType { A = 1, AAAA = 28, MX = 15, TXT = 16 }

pub struct Resolver {
    pub server: [u8; 4],
}

impl Resolver {
    pub fn new(server: [u8; 4]) -> Self { Self { server } }
    pub fn default() -> Self { Self::new([8, 8, 8, 8]) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_resolver() { let r = Resolver::default(); assert_eq!(r.server, [8,8,8,8]); }
}
