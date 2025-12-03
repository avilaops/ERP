//! Formato e parsing de packets QUIC

/// Tipo de packet QUIC
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PacketType {
    /// Initial packet (handshake)
    Initial,
    /// 0-RTT packet
    ZeroRtt,
    /// Handshake packet
    Handshake,
    /// Retry packet
    Retry,
    /// Short header packet (dados)
    Short,
}

/// Header de packet QUIC (long format)
pub struct LongHeader {
    /// Tipo do packet
    pub packet_type: PacketType,

    /// Versão QUIC
    pub version: u32,

    /// Destination Connection ID
    pub dcid: alloc::vec::Vec<u8>,

    /// Source Connection ID
    pub scid: alloc::vec::Vec<u8>,

    /// Packet number
    pub packet_number: u64,
}

/// Header de packet QUIC (short format)
pub struct ShortHeader {
    /// Destination Connection ID
    pub dcid: alloc::vec::Vec<u8>,

    /// Packet number
    pub packet_number: u64,
}

/// Packet QUIC completo
pub struct Packet {
    /// Header
    pub header: PacketHeader,

    /// Payload (frames)
    pub payload: alloc::vec::Vec<u8>,
}

/// Tipo de header
pub enum PacketHeader {
    /// Long header
    Long(LongHeader),
    /// Short header
    Short(ShortHeader),
}

impl Packet {
    /// Parse packet a partir de bytes
    pub fn parse(bytes: &[u8]) -> Option<Self> {
        // TODO: Implementar parsing completo
        None
    }

    /// Serializa packet para bytes
    pub fn encode(&self) -> alloc::vec::Vec<u8> {
        // TODO: Implementar encoding
        alloc::vec![0u8; 1200]
    }
}
