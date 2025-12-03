//! Estrutura de mensagem de email

use crate::{EmailAddress, mime::{MimePart, MultipartBuilder}};
use avila_time::DateTime;
use std::collections::HashMap;

/// Complete email message
#[derive(Debug, Clone)]
pub struct Email {
    /// Unique message ID
    pub id: String,
    /// Sender
    pub from: EmailAddress,
    /// Recipients
    pub to: Vec<EmailAddress>,
    /// Carbon copy
    pub cc: Vec<EmailAddress>,
    /// Blind carbon copy
    pub bcc: Vec<EmailAddress>,
    /// Subject
    pub subject: String,
    /// Message body (plain text)
    pub body: String,
    /// HTML body (optional)
    pub html_body: Option<String>,
    /// Custom headers
    pub headers: HashMap<String, String>,
    /// Send date
    pub date: DateTime,
    /// Attachments
    pub attachments: Vec<Attachment>,
}

/// Email attachment
#[derive(Debug, Clone)]
pub struct Attachment {
    /// Filename
    pub filename: String,
    /// MIME type
    pub content_type: String,
    /// Content (base64 encoded)
    pub content: Vec<u8>,
}

impl Email {
    /// Creates new message
    pub fn new(from: EmailAddress, to: Vec<EmailAddress>, subject: String, body: String) -> Self {
        Self {
            id: Self::generate_message_id(),
            from,
            to,
            cc: Vec::new(),
            bcc: Vec::new(),
            subject,
            body,
            html_body: None,
            headers: HashMap::new(),
            date: DateTime::now(),
            attachments: Vec::new(),
        }
    }

    /// Generates unique Message-ID
    fn generate_message_id() -> String {
        use avila_time::DateTime;
        let timestamp = DateTime::now().timestamp();
        let random: u32 = (timestamp % 1_000_000) as u32;
        format!("<{}.{}@avila.inc>", timestamp, random)
    }

    /// Adds CC recipient
    pub fn add_cc(&mut self, address: EmailAddress) {
        self.cc.push(address);
    }

    /// Adds BCC recipient
    pub fn add_bcc(&mut self, address: EmailAddress) {
        self.bcc.push(address);
    }

    /// Adds attachment
    pub fn add_attachment(&mut self, attachment: Attachment) {
        self.attachments.push(attachment);
    }

    /// Sets HTML body
    pub fn set_html_body(&mut self, html: String) {
        self.html_body = Some(html);
    }

    /// Adds custom header
    pub fn add_header(&mut self, key: String, value: String) {
        self.headers.insert(key, value);
    }

    /// Converts to RFC 5322 format (email wire format)
    pub fn to_rfc5322(&self) -> String {
        if self.html_body.is_some() || !self.attachments.is_empty() {
            // Use simple format as fallback for now
            self.to_simple_format()
        } else {
            self.to_simple_format()
        }
    }

    /// Converts to MIME multipart format
    pub fn to_mime(&self) -> String {
        let mut headers = String::new();

        // Basic headers
        headers.push_str(&format!("Message-ID: {}\r\n", self.id));
        headers.push_str(&format!("From: {}\r\n", self.from.to_rfc5322()));
        headers.push_str(&format!("To: {}\r\n",
            self.to.iter().map(|e| e.to_rfc5322()).collect::<Vec<_>>().join(", ")));

        if !self.cc.is_empty() {
            headers.push_str(&format!("Cc: {}\r\n",
                self.cc.iter().map(|e| e.to_rfc5322()).collect::<Vec<_>>().join(", ")));
        }

        headers.push_str(&format!("Subject: {}\r\n", self.subject));
        headers.push_str(&format!("Date: {}\r\n", self.date.to_rfc2822()));
        headers.push_str("MIME-Version: 1.0\r\n");

        // Custom headers
        for (key, value) in &self.headers {
            headers.push_str(&format!("{}: {}\r\n", key, value));
        }

        // Build multipart body
        if !self.attachments.is_empty() || self.html_body.is_some() {
            let mut builder = if self.html_body.is_some() {
                // multipart/alternative for text + HTML
                let mut alt = MultipartBuilder::alternative()
                    .add_part(MimePart::text(&self.body));

                if let Some(ref html) = self.html_body {
                    alt = alt.add_part(MimePart::html(html));
                }

                if self.attachments.is_empty() {
                    headers.push_str(&format!("Content-Type: {}\r\n", alt.content_type()));
                    headers.push_str("\r\n");
                    headers.push_str(&alt.build());
                    return headers;
                }

                // Wrap in multipart/mixed for attachments
                let mixed = MultipartBuilder::mixed();
                mixed
            } else {
                MultipartBuilder::mixed()
                    .add_part(MimePart::text(&self.body))
            };

            // Add attachments
            for attachment in &self.attachments {
                builder = builder.add_part(MimePart::attachment(
                    &attachment.filename,
                    &attachment.content_type,
                    attachment.content.clone(),
                ));
            }

            headers.push_str(&format!("Content-Type: {}\r\n", builder.content_type()));
            headers.push_str("\r\n");
            headers.push_str(&builder.build());
        } else {
            // Simple text email
            headers.push_str("Content-Type: text/plain; charset=utf-8\r\n");
            headers.push_str("Content-Transfer-Encoding: 8bit\r\n");
            headers.push_str("\r\n");
            headers.push_str(&self.body);
        }

        headers
    }

    fn to_simple_format(&self) -> String {
        let mut message = String::new();

        message.push_str(&format!("Message-ID: {}\r\n", self.id));
        message.push_str(&format!("From: {}\r\n", self.from));
        message.push_str(&format!("To: {}\r\n",
            self.to.iter().map(|e| e.to_string()).collect::<Vec<_>>().join(", ")));

        if !self.cc.is_empty() {
            message.push_str(&format!("Cc: {}\r\n",
                self.cc.iter().map(|e| e.to_string()).collect::<Vec<_>>().join(", ")));
        }

        message.push_str(&format!("Subject: {}\r\n", self.subject));
        message.push_str(&format!("Date: {}\r\n", self.date.to_rfc2822()));

        // Custom headers
        for (key, value) in &self.headers {
            message.push_str(&format!("{}: {}\r\n", key, value));
        }

        // Body
        message.push_str("\r\n");
        message.push_str(&self.body);

        message
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_creation() {
        let from = EmailAddress::new("sender@example.com").unwrap();
        let to = vec![EmailAddress::new("recipient@example.com").unwrap()];

        let email = Email::new(from, to, "Test".to_string(), "Hello!".to_string());

        assert_eq!(email.subject, "Test");
        assert_eq!(email.body, "Hello!");
    }

    #[test]
    fn test_rfc5322_format() {
        let from = EmailAddress::new("sender@example.com").unwrap();
        let to = vec![EmailAddress::new("recipient@example.com").unwrap()];

        let email = Email::new(from, to, "Test".to_string(), "Hello!".to_string());
        let rfc = email.to_rfc5322();

        assert!(rfc.contains("From: sender@example.com"));
        assert!(rfc.contains("To: recipient@example.com"));
        assert!(rfc.contains("Subject: Test"));
        assert!(rfc.contains("Hello!"));
    }
}
