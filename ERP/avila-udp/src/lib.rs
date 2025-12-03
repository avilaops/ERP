//! # avila-udp - UDP Networking
//!
//! UDP sockets with multicast and broadcast support.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

#[cfg(feature = "std")]
extern crate std;

use avila_error::{Error, ErrorKind, Result};

#[cfg(feature = "std")]
use std::net::{UdpSocket, SocketAddr, IpAddr, Ipv4Addr};

/// UDP socket
#[cfg(feature = "std")]
pub struct Udp {
    socket: UdpSocket,
}

#[cfg(feature = "std")]
impl Udp {
    /// Binds to address
    pub fn bind(addr: SocketAddr) -> Result<Self> {
        let socket = UdpSocket::bind(addr)
            .map_err(|_| Error::new(ErrorKind::ConnectionFailed, "Bind failed"))?;
        Ok(Self { socket })
    }

    /// Sends datagram to address
    pub fn send_to(&self, buf: &[u8], addr: SocketAddr) -> Result<usize> {
        self.socket.send_to(buf, addr)
            .map_err(|_| Error::new(ErrorKind::IoError, "Send failed"))
    }

    /// Receives datagram
    pub fn recv_from(&self, buf: &mut [u8]) -> Result<(usize, SocketAddr)> {
        self.socket.recv_from(buf)
            .map_err(|_| Error::new(ErrorKind::IoError, "Recv failed"))
    }

    /// Connects to remote address (filters packets)
    pub fn connect(&self, addr: SocketAddr) -> Result<()> {
        self.socket.connect(addr)
            .map_err(|_| Error::new(ErrorKind::ConnectionFailed, "Connect failed"))
    }

    /// Sends to connected peer
    pub fn send(&self, buf: &[u8]) -> Result<usize> {
        self.socket.send(buf)
            .map_err(|_| Error::new(ErrorKind::IoError, "Send failed"))
    }

    /// Receives from connected peer
    pub fn recv(&self, buf: &mut [u8]) -> Result<usize> {
        self.socket.recv(buf)
            .map_err(|_| Error::new(ErrorKind::IoError, "Recv failed"))
    }

    /// Sets broadcast mode
    pub fn set_broadcast(&self, broadcast: bool) -> Result<()> {
        self.socket.set_broadcast(broadcast)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "Set broadcast failed"))
    }

    /// Joins multicast group
    pub fn join_multicast_v4(&self, multiaddr: &Ipv4Addr, interface: &Ipv4Addr) -> Result<()> {
        self.socket.join_multicast_v4(multiaddr, interface)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "Join multicast failed"))
    }

    /// Leaves multicast group
    pub fn leave_multicast_v4(&self, multiaddr: &Ipv4Addr, interface: &Ipv4Addr) -> Result<()> {
        self.socket.leave_multicast_v4(multiaddr, interface)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "Leave multicast failed"))
    }

    /// Gets local address
    pub fn local_addr(&self) -> Result<SocketAddr> {
        self.socket.local_addr()
            .map_err(|_| Error::new(ErrorKind::InvalidState, "No local addr"))
    }
}

/// Prelude
pub mod prelude {
    #[cfg(feature = "std")]
    pub use crate::Udp;
}

#[cfg(all(test, feature = "std"))]
mod tests {
    use super::*;

    #[test]
    fn test_udp_bind() {
        let addr: SocketAddr = "127.0.0.1:0".parse().unwrap();
        let socket = Udp::bind(addr);
        assert!(socket.is_ok());
    }

    #[test]
    fn test_udp_send_recv() {
        let server = Udp::bind("127.0.0.1:0".parse().unwrap()).unwrap();
        let server_addr = server.local_addr().unwrap();

        let client = Udp::bind("127.0.0.1:0".parse().unwrap()).unwrap();

        client.send_to(b"hello", server_addr).unwrap();

        let mut buf = [0u8; 64];
        let (n, _addr) = server.recv_from(&mut buf).unwrap();
        assert_eq!(&buf[..n], b"hello");
    }
}
