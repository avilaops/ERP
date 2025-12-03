//! Frames QUIC (unidades de dados dentro de packets)

/// Tipo de frame
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameType {
    /// PADDING frame
    Padding,
    /// PING frame
    Ping,
    /// ACK frame
    Ack,
    /// CRYPTO frame (handshake data)
    Crypto,
    /// STREAM frame (application data)
    Stream,
    /// MAX_DATA frame (flow control)
    MaxData,
    /// CONNECTION_CLOSE frame
    ConnectionClose,
}

/// Frame genérico
pub enum Frame {
    /// Padding (no-op)
    Padding,

    /// Ping (keep-alive)
    Ping,

    /// ACK (acknowledgment)
    Ack(AckFrame),

    /// CRYPTO (handshake data)
    Crypto(CryptoFrame),

    /// STREAM (application data)
    Stream(StreamFrame),

    /// MAX_DATA (flow control)
    MaxData { max_data: u64 },

    /// CONNECTION_CLOSE
    ConnectionClose {
        error_code: u64,
        reason: alloc::vec::Vec<u8>,
    },
}

/// ACK frame
pub struct AckFrame {
    /// Maior packet number ACK'd
    pub largest_acknowledged: u64,

    /// Delay desde recepção do packet ACK'd
    pub ack_delay: u64,

    /// Ranges de packets ACK'd
    pub ack_ranges: alloc::vec::Vec<(u64, u64)>,
}

/// CRYPTO frame
pub struct CryptoFrame {
    /// Offset no stream CRYPTO
    pub offset: u64,

    /// Dados do handshake
    pub data: alloc::vec::Vec<u8>,
}

/// STREAM frame
pub struct StreamFrame {
    /// ID do stream
    pub stream_id: u64,

    /// Offset no stream
    pub offset: u64,

    /// Dados da aplicação
    pub data: alloc::vec::Vec<u8>,

    /// FIN bit (último frame do stream)
    pub fin: bool,
}

impl Frame {
    /// Parse frame a partir de bytes
    pub fn parse(bytes: &[u8]) -> Option<(Self, usize)> {
        // TODO: Implementar parsing
        None
    }

    /// Serializa frame para bytes
    pub fn encode(&self) -> alloc::vec::Vec<u8> {
        // TODO: Implementar encoding
        alloc::vec![0u8; 64]
    }
}
