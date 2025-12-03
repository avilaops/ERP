//! Arrow IPC Message Format
//!
//! Internal message structures for Arrow IPC protocol.

use crate::{ArrowError, Result};

/// Message header in Arrow IPC format
#[derive(Debug, Clone)]
pub struct MessageHeader {
    /// Metadata version
    pub version: i16,
    /// Message type (Schema, RecordBatch, DictionaryBatch)
    pub message_type: i8,
    /// Body length in bytes
    pub body_length: i64,
}

impl MessageHeader {
    /// Create a new message header
    pub fn new(message_type: i8, body_length: i64) -> Self {
        Self {
            version: super::IPC_VERSION as i16,
            message_type,
            body_length,
        }
    }

    /// Size of the header in bytes
    pub const HEADER_SIZE: usize = 11; // version(2) + type(1) + length(8)

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(Self::HEADER_SIZE);
        bytes.extend_from_slice(&self.version.to_le_bytes());
        bytes.push(self.message_type as u8);
        bytes.extend_from_slice(&self.body_length.to_le_bytes());
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        if bytes.len() < Self::HEADER_SIZE {
            return Err(ArrowError::Io(
                "Insufficient bytes for message header".to_string()
            ));
        }

        let version = i16::from_le_bytes([bytes[0], bytes[1]]);
        let message_type = bytes[2] as i8;
        let body_length = i64::from_le_bytes([
            bytes[3], bytes[4], bytes[5], bytes[6],
            bytes[7], bytes[8], bytes[9], bytes[10],
        ]);

        Ok(Self {
            version,
            message_type,
            body_length,
        })
    }
}

/// IPC continuation marker (0xFFFFFFFF = -1)
pub const CONTINUATION_MARKER: i32 = -1;

/// Check if bytes start with continuation marker
pub fn has_continuation_marker(bytes: &[u8]) -> bool {
    bytes.len() >= 4 && i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) == CONTINUATION_MARKER
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_header_roundtrip() {
        let header = MessageHeader::new(1, 1024);
        let bytes = header.to_bytes();
        
        assert_eq!(bytes.len(), MessageHeader::HEADER_SIZE);
        
        let decoded = MessageHeader::from_bytes(&bytes).unwrap();
        assert_eq!(decoded.version, header.version);
        assert_eq!(decoded.message_type, header.message_type);
        assert_eq!(decoded.body_length, header.body_length);
    }

    #[test]
    fn test_continuation_marker() {
        let bytes = (-1i32).to_le_bytes();
        assert!(has_continuation_marker(&bytes));
        
        let bytes = (0i32).to_le_bytes();
        assert!(!has_continuation_marker(&bytes));
    }

    #[test]
    fn test_invalid_header() {
        let bytes = vec![0u8; 5]; // Too short
        let result = MessageHeader::from_bytes(&bytes);
        assert!(result.is_err());
    }
}
