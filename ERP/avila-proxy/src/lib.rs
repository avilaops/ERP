//! # avila-proxy
#![warn(missing_docs)]
extern crate alloc;

pub struct Proxy {
    pub port: u16,
}

impl Proxy {
    pub fn new(port: u16) -> Self { Self { port } }
}

pub mod prelude { pub use crate::Proxy; }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_new() { let p = Proxy::new(8080); assert_eq!(p.port, 8080); }
}
