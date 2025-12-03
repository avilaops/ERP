//! # avila-quic - QUIC Protocol
#![cfg_attr(not(feature = "std"), no_std)]
extern crate alloc;

pub struct QuicConnection {
    pub id: u64,
}

impl QuicConnection {
    pub fn new(id: u64) -> Self {
        Self { id }
    }
}

pub mod prelude {
    pub use crate::QuicConnection;
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_connection() {
        let conn = QuicConnection::new(1);
        assert_eq!(conn.id, 1);
    }
}
