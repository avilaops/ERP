//! Email queue system for batch sending and retry logic

use crate::{message::Email, smtp::SmtpClient};
use avila_error::Result;
use std::collections::VecDeque;

/// Email queue status
#[derive(Debug, Clone, PartialEq)]
pub enum QueueStatus {
    Pending,
    Sending,
    Sent,
    Failed,
    Retry,
}

/// Queued email with metadata
#[derive(Debug, Clone)]
pub struct QueuedEmail {
    pub email: Email,
    pub status: QueueStatus,
    pub attempts: u32,
    pub max_attempts: u32,
    pub scheduled_time: Option<u64>,
    pub last_error: Option<String>,
}

impl QueuedEmail {
    pub fn new(email: Email) -> Self {
        Self {
            email,
            status: QueueStatus::Pending,
            attempts: 0,
            max_attempts: 3,
            scheduled_time: None,
            last_error: None,
        }
    }

    pub fn with_retry(mut self, max_attempts: u32) -> Self {
        self.max_attempts = max_attempts;
        self
    }

    pub fn schedule_at(mut self, timestamp: u64) -> Self {
        self.scheduled_time = Some(timestamp);
        self
    }
}

/// Email queue manager
pub struct EmailQueue {
    queue: VecDeque<QueuedEmail>,
    sent: Vec<QueuedEmail>,
    failed: Vec<QueuedEmail>,
}

impl EmailQueue {
    pub fn new() -> Self {
        Self {
            queue: VecDeque::new(),
            sent: Vec::new(),
            failed: Vec::new(),
        }
    }

    /// Adds email to queue
    pub fn enqueue(&mut self, email: QueuedEmail) {
        self.queue.push_back(email);
    }

    /// Gets next pending email
    pub fn next(&mut self) -> Option<QueuedEmail> {
        for i in 0..self.queue.len() {
            if let Some(email) = self.queue.get(i) {
                if email.status == QueueStatus::Pending {
                    return self.queue.remove(i);
                }
            }
        }
        None
    }

    /// Marks email as sent
    pub fn mark_sent(&mut self, mut email: QueuedEmail) {
        email.status = QueueStatus::Sent;
        self.sent.push(email);
    }

    /// Marks email as failed and retry if attempts remaining
    pub fn mark_failed(&mut self, mut email: QueuedEmail, error: String) {
        email.attempts += 1;
        email.last_error = Some(error);

        if email.attempts < email.max_attempts {
            email.status = QueueStatus::Retry;
            self.queue.push_back(email);
        } else {
            email.status = QueueStatus::Failed;
            self.failed.push(email);
        }
    }

    /// Gets queue statistics
    pub fn stats(&self) -> QueueStats {
        QueueStats {
            pending: self.queue.len(),
            sent: self.sent.len(),
            failed: self.failed.len(),
        }
    }

    /// Processes queue with SMTP client
    pub async fn process(&mut self, client: &mut SmtpClient) -> Result<()> {
        while let Some(mut email) = self.next() {
            email.status = QueueStatus::Sending;

            match client.send_email(&email.email).await {
                Ok(_) => self.mark_sent(email),
                Err(e) => self.mark_failed(email, e.to_string()),
            }
        }
        Ok(())
    }
}

impl Default for EmailQueue {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct QueueStats {
    pub pending: usize,
    pub sent: usize,
    pub failed: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::EmailAddress;

    #[test]
    fn test_queue_operations() {
        let mut queue = EmailQueue::new();

        let email = Email::new(
            EmailAddress::new("from@test.com").unwrap(),
            vec![EmailAddress::new("to@test.com").unwrap()],
            "Test".to_string(),
            "Body".to_string(),
        );

        queue.enqueue(QueuedEmail::new(email));

        let stats = queue.stats();
        assert_eq!(stats.pending, 1);
        assert_eq!(stats.sent, 0);
    }

    #[test]
    fn test_retry_logic() {
        let mut queue = EmailQueue::new();

        let email = Email::new(
            EmailAddress::new("from@test.com").unwrap(),
            vec![EmailAddress::new("to@test.com").unwrap()],
            "Test".to_string(),
            "Body".to_string(),
        );

        let queued = QueuedEmail::new(email).with_retry(3);
        queue.enqueue(queued);

        if let Some(email) = queue.next() {
            queue.mark_failed(email, "Test error".to_string());
        }

        let stats = queue.stats();
        assert_eq!(stats.pending, 1); // Moved back to queue for retry
        assert_eq!(stats.failed, 0);
    }
}
