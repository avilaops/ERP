//! # avila-tcp
extern crate alloc;

pub struct TcpSocket {
    pub port: u16,
}

impl TcpSocket {
    pub fn new(port: u16) -> Self { Self { port } }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_socket() { let s = TcpSocket::new(8080); assert_eq!(s.port, 8080); }
}
