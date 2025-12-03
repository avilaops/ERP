//! Estruturas de pacotes QUIC

use alloc::vec::Vec;

/// Tipos de pacotes QUIC
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PacketType {
    /// Initial packet (handshake início)
    Initial,
    /// 0-RTT packet (dados early)
    ZeroRtt,
    /// Handshake packet (criptografia estabelecida)
    Handshake,
    /// Retry packet (servidor solicita retry)
    Retry,
    /// Short header (dados da aplicação)
    Short,
}

/// Header de pacote QUIC
#[derive(Debug, Clone)]
pub struct PacketHeader {
    /// Tipo do pacote
    pub packet_type: PacketType,
    /// Connection ID de destino
    pub dcid: Vec<u8>,
    /// Connection ID de origem (apenas long header)
    pub scid: Option<Vec<u8>>,
    /// Número do pacote
    pub packet_number: u64,
    /// Token (apenas Initial e Retry)
    pub token: Option<Vec<u8>>,
}

/// Pacote QUIC completo
#[derive(Debug, Clone)]
pub struct Packet {
    /// Header
    pub header: PacketHeader,
    /// Payload (frames)
    pub payload: Vec<u8>,
}

impl Packet {
    /// Serializa pacote para bytes
    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = Vec::new();

        // Encode header
        match self.header.packet_type {
            PacketType::Initial => {
                bytes.push(0xC0); // Long header, Initial
            }
            PacketType::Short => {
                bytes.push(0x40); // Short header
            }
            _ => {
                // TODO: Outros tipos
            }
        }

        // DCID length + DCID
        bytes.push(self.header.dcid.len() as u8);
        bytes.extend_from_slice(&self.header.dcid);

        // SCID (se long header)
        if let Some(ref scid) = self.header.scid {
            bytes.push(scid.len() as u8);
            bytes.extend_from_slice(scid);
        }

        // Packet number (varint encoded)
        Self::encode_varint(self.header.packet_number, &mut bytes);

        // Payload
        bytes.extend_from_slice(&self.payload);

        bytes
    }

    /// Decodifica pacote de bytes
    pub fn decode(bytes: &[u8]) -> Option<Self> {
        if bytes.is_empty() {
            return None;
        }

        let first_byte = bytes[0];
        let is_long_header = (first_byte & 0x80) != 0;

        // TODO: Implementar parsing completo
        None
    }

    /// Encode varint (variable-length integer)
    fn encode_varint(value: u64, buf: &mut Vec<u8>) {
        if value < 64 {
            buf.push(value as u8);
        } else if value < 16384 {
            buf.push(0x40 | ((value >> 8) as u8));
            buf.push(value as u8);
        } else if value < 1073741824 {
            buf.push(0x80 | ((value >> 24) as u8));
            buf.push((value >> 16) as u8);
            buf.push((value >> 8) as u8);
            buf.push(value as u8);
        } else {
            buf.push(0xC0 | ((value >> 56) as u8));
            for i in (0..7).rev() {
                buf.push((value >> (i * 8)) as u8);
            }
        }
    }

    /// Decode varint
    fn decode_varint(bytes: &[u8]) -> Option<(u64, usize)> {
        if bytes.is_empty() {
            return None;
        }

        let first = bytes[0];
        let tag = first >> 6;

        match tag {
            0 => Some((first as u64 & 0x3f, 1)),
            1 => {
                if bytes.len() < 2 {
                    return None;
                }
                let value = ((first as u64 & 0x3f) << 8) | bytes[1] as u64;
                Some((value, 2))
            }
            2 => {
                if bytes.len() < 4 {
                    return None;
                }
                let value = ((first as u64 & 0x3f) << 24)
                    | ((bytes[1] as u64) << 16)
                    | ((bytes[2] as u64) << 8)
                    | bytes[3] as u64;
                Some((value, 4))
            }
            3 => {
                if bytes.len() < 8 {
                    return None;
                }
                let mut value = (first as u64 & 0x3f) << 56;
                for i in 0..7 {
                    value |= (bytes[i + 1] as u64) << ((6 - i) * 8);
                }
                Some((value, 8))
            }
            _ => None,
        }
    }
}

/// Frames QUIC
#[derive(Debug, Clone)]
pub enum Frame {
    /// Padding (0x00)
    Padding,
    /// Ping (0x01)
    Ping,
    /// ACK (0x02-0x03)
    Ack {
        largest: u64,
        delay: u64,
        ranges: Vec<(u64, u64)>,
    },
    /// STREAM (0x08-0x0f)
    Stream {
        id: u64,
        offset: u64,
        data: Vec<u8>,
        fin: bool,
    },
    /// CRYPTO (0x06)
    Crypto { offset: u64, data: Vec<u8> },
    /// CONNECTION_CLOSE (0x1c-0x1d)
    ConnectionClose { error_code: u64, reason: Vec<u8> },
}
