//! Message types and traits

use crate::{Id, Result};

#[cfg(not(feature = "std"))]
use alloc::{string::String, vec::Vec, format};

#[cfg(feature = "std")]
use std::{string::String, vec::Vec};

/// Trait for messages that can be passed between cells
pub trait MessageTrait: core::fmt::Debug {
    /// Get message unique identifier
    fn id(&self) -> Id;

    /// Get message type
    fn message_type(&self) -> &str;

    /// Get sender ID
    fn sender(&self) -> Option<Id>;

    /// Get recipient ID
    fn recipient(&self) -> Option<Id>;

    /// Serialize message to bytes
    fn to_bytes(&self) -> Result<Vec<u8>>;
}

/// Basic message structure
#[derive(Debug, Clone)]
pub struct Message {
    /// Unique identifier
    pub id: Id,
    /// Message type
    pub message_type: String,
    /// Sender ID
    pub sender: Option<Id>,
    /// Recipient ID
    pub recipient: Option<Id>,
    /// Message payload
    pub payload: Vec<u8>,
}

impl Message {
    /// Create new message
    pub fn new(message_type: impl Into<String>) -> Self {
        Self {
            id: Id::new(),
            message_type: message_type.into(),
            sender: None,
            recipient: None,
            payload: Vec::new(),
        }
    }

    /// Set sender
    pub fn with_sender(mut self, sender: Id) -> Self {
        self.sender = Some(sender);
        self
    }

    /// Set recipient
    pub fn with_recipient(mut self, recipient: Id) -> Self {
        self.recipient = Some(recipient);
        self
    }

    /// Set payload
    pub fn with_payload(mut self, payload: Vec<u8>) -> Self {
        self.payload = payload;
        self
    }
}

impl MessageTrait for Message {
    fn id(&self) -> Id {
        self.id
    }

    fn message_type(&self) -> &str {
        &self.message_type
    }

    fn sender(&self) -> Option<Id> {
        self.sender
    }

    fn recipient(&self) -> Option<Id> {
        self.recipient
    }

    fn to_bytes(&self) -> Result<Vec<u8>> {
        Ok(self.payload.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_creation() {
        let msg = Message::new("test-message");
        assert_eq!(msg.message_type(), "test-message");
    }

    #[test]
    fn test_message_builder() {
        let sender_id = Id::new();
        let recipient_id = Id::new();
        let msg = Message::new("test")
            .with_sender(sender_id)
            .with_recipient(recipient_id)
            .with_payload(vec![1, 2, 3]);

        assert_eq!(msg.sender(), Some(sender_id));
        assert_eq!(msg.recipient(), Some(recipient_id));
        assert_eq!(msg.payload, vec![1, 2, 3]);
    }
}
