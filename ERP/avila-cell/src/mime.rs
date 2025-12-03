//! MIME (Multipurpose Internet Mail Extensions) support

use crate::encoding::{base64_encode, quoted_printable_encode, generate_boundary};

/// MIME types
pub mod types {
    /// Text MIME types
    pub const TEXT_PLAIN: &str = "text/plain";
    /// HTML MIME type
    pub const TEXT_HTML: &str = "text/html";
    /// Calendar MIME type
    pub const TEXT_CALENDAR: &str = "text/calendar";
    /// Binary application type
    pub const APPLICATION_OCTET_STREAM: &str = "application/octet-stream";
    /// PDF type
    pub const APPLICATION_PDF: &str = "application/pdf";
    /// JPEG image
    pub const IMAGE_JPEG: &str = "image/jpeg";
    /// PNG image
    pub const IMAGE_PNG: &str = "image/png";
    /// ZIP archive
    pub const APPLICATION_ZIP: &str = "application/zip";
    /// JSON
    pub const APPLICATION_JSON: &str = "application/json";
}

/// Content transfer encoding
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransferEncoding {
    /// 7-bit ASCII
    SevenBit,
    /// 8-bit
    EightBit,
    /// Base64 encoding
    Base64,
    /// Quoted-Printable
    QuotedPrintable,
}

impl TransferEncoding {
    /// Returns the string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SevenBit => "7bit",
            Self::EightBit => "8bit",
            Self::Base64 => "base64",
            Self::QuotedPrintable => "quoted-printable",
        }
    }
}

/// MIME part
#[derive(Debug, Clone)]
pub struct MimePart {
    /// Content type
    pub content_type: String,
    /// Transfer encoding
    pub encoding: TransferEncoding,
    /// Content disposition (inline or attachment)
    pub disposition: Option<String>,
    /// Filename (for attachments)
    pub filename: Option<String>,
    /// Content ID (for embedded images)
    pub content_id: Option<String>,
    /// Body content
    pub content: Vec<u8>,
}

impl MimePart {
    /// Creates a text part
    pub fn text(content: impl Into<String>) -> Self {
        Self {
            content_type: format!("{}; charset=utf-8", types::TEXT_PLAIN),
            encoding: TransferEncoding::QuotedPrintable,
            disposition: None,
            filename: None,
            content_id: None,
            content: content.into().into_bytes(),
        }
    }

    /// Creates an HTML part
    pub fn html(content: impl Into<String>) -> Self {
        Self {
            content_type: format!("{}; charset=utf-8", types::TEXT_HTML),
            encoding: TransferEncoding::QuotedPrintable,
            disposition: None,
            filename: None,
            content_id: None,
            content: content.into().into_bytes(),
        }
    }

    /// Creates an attachment part
    pub fn attachment(filename: impl Into<String>, content_type: impl Into<String>, content: Vec<u8>) -> Self {
        let fname = filename.into();
        Self {
            content_type: content_type.into(),
            encoding: TransferEncoding::Base64,
            disposition: Some(format!("attachment; filename=\"{}\"", fname)),
            filename: Some(fname),
            content_id: None,
            content,
        }
    }

    /// Creates an inline image part
    pub fn inline_image(cid: impl Into<String>, content_type: impl Into<String>, content: Vec<u8>) -> Self {
        Self {
            content_type: content_type.into(),
            encoding: TransferEncoding::Base64,
            disposition: Some("inline".to_string()),
            filename: None,
            content_id: Some(cid.into()),
            content,
        }
    }

    /// Encodes the content based on transfer encoding
    pub fn encode_content(&self) -> String {
        match self.encoding {
            TransferEncoding::Base64 => {
                let encoded = base64_encode(&self.content);
                // Break into 76-character lines
                let mut result = String::new();
                for (i, chunk) in encoded.as_bytes().chunks(76).enumerate() {
                    if i > 0 {
                        result.push_str("\r\n");
                    }
                    result.push_str(&String::from_utf8_lossy(chunk));
                }
                result
            }
            TransferEncoding::QuotedPrintable => {
                quoted_printable_encode(&String::from_utf8_lossy(&self.content))
            }
            _ => String::from_utf8_lossy(&self.content).to_string(),
        }
    }

    /// Converts to MIME format
    pub fn to_mime(&self) -> String {
        let mut mime = String::new();

        mime.push_str(&format!("Content-Type: {}\r\n", self.content_type));
        mime.push_str(&format!("Content-Transfer-Encoding: {}\r\n", self.encoding.as_str()));

        if let Some(ref disp) = self.disposition {
            mime.push_str(&format!("Content-Disposition: {}\r\n", disp));
        }

        if let Some(ref cid) = self.content_id {
            mime.push_str(&format!("Content-ID: <{}>\r\n", cid));
        }

        mime.push_str("\r\n");
        mime.push_str(&self.encode_content());

        mime
    }
}

/// Multipart message builder
#[derive(Debug)]
pub struct MultipartBuilder {
    /// Multipart type (mixed, alternative, related)
    multipart_type: String,
    /// MIME parts
    parts: Vec<MimePart>,
    /// Boundary
    boundary: String,
}

impl MultipartBuilder {
    /// Creates a new multipart/mixed builder
    pub fn mixed() -> Self {
        Self {
            multipart_type: "mixed".to_string(),
            parts: Vec::new(),
            boundary: generate_boundary(),
        }
    }

    /// Creates a new multipart/alternative builder
    pub fn alternative() -> Self {
        Self {
            multipart_type: "alternative".to_string(),
            parts: Vec::new(),
            boundary: generate_boundary(),
        }
    }

    /// Creates a new multipart/related builder (for HTML with inline images)
    pub fn related() -> Self {
        Self {
            multipart_type: "related".to_string(),
            parts: Vec::new(),
            boundary: generate_boundary(),
        }
    }

    /// Adds a MIME part
    pub fn add_part(mut self, part: MimePart) -> Self {
        self.parts.push(part);
        self
    }

    /// Gets the Content-Type header
    pub fn content_type(&self) -> String {
        format!("multipart/{}; boundary=\"{}\"", self.multipart_type, self.boundary)
    }

    /// Builds the multipart body
    pub fn build(&self) -> String {
        let mut body = String::new();

        for part in &self.parts {
            body.push_str(&format!("--{}\r\n", self.boundary));
            body.push_str(&part.to_mime());
            body.push_str("\r\n");
        }

        body.push_str(&format!("--{}--\r\n", self.boundary));

        body
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_part() {
        let part = MimePart::text("Hello, World!");
        assert_eq!(part.encoding, TransferEncoding::QuotedPrintable);
        assert!(part.content_type.contains("text/plain"));
    }

    #[test]
    fn test_html_part() {
        let part = MimePart::html("<h1>Hello</h1>");
        assert_eq!(part.encoding, TransferEncoding::QuotedPrintable);
        assert!(part.content_type.contains("text/html"));
    }

    #[test]
    fn test_attachment() {
        let part = MimePart::attachment("test.pdf", types::APPLICATION_PDF, vec![1, 2, 3]);
        assert_eq!(part.encoding, TransferEncoding::Base64);
        assert!(part.disposition.is_some());
    }

    #[test]
    fn test_multipart_builder() {
        let multipart = MultipartBuilder::alternative()
            .add_part(MimePart::text("Plain text"))
            .add_part(MimePart::html("<p>HTML</p>"));

        let body = multipart.build();
        let content_type = multipart.content_type();

        assert!(content_type.contains("multipart/alternative"));
        assert!(body.contains("text/plain"));
        assert!(body.contains("text/html"));
    }
}
