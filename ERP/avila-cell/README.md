# Avila Cell - Advanced Email Protocol Library

> First digital life form - Advanced email protocol cells with MIME multipart, authentication, and HTML support

## Features

### Core Protocols
- **SMTP Client**: Send emails with authentication (PLAIN, LOGIN, XOAUTH2)
- **POP3 Client**: Retrieve emails from POP3 servers
- **IMAP Client**: Full IMAP protocol support

### Advanced Email Features
- **MIME Multipart**:
  - `multipart/mixed` - For attachments
  - `multipart/alternative` - For HTML + plain text
  - `multipart/related` - For inline images
- **Content Encoding**:
  - Base64 encoding/decoding
  - Quoted-Printable encoding
  - URL encoding
- **Authentication Mechanisms**:
  - PLAIN authentication
  - LOGIN authentication
  - XOAUTH2 (Gmail, Outlook)
  - CRAM-MD5 (placeholder, awaiting avila-crypto support)
- **HTML Emails**: Full HTML email support with inline styles
- **Attachments**: Binary file attachments with automatic Base64 encoding
- **RFC 5322 Compliance**: Proper email formatting

### Pure Avila Ecosystem
Zero external dependencies - built entirely on the Avila ecosystem:
- `avila-atom` - Data structures
- `avila-molecule` - Network protocols
- `avila-error` - Error handling
- `avila-time` - Temporal operations
- `avila-async` - Asynchronous runtime
- `avila-crypto` - Cryptographic functions
- `avila-regex` - Pattern matching
- `avila-serde` - Serialization

## Usage

### Simple Email

```rust
use avila_cell::{Email, EmailAddress, smtp::SmtpClient};

let from = EmailAddress::new("sender@example.com", None);
let to = EmailAddress::new("recipient@example.com", Some("John Doe".to_string()));

let email = Email::new(from, vec![to], "Hello", "This is a test email");

let mut client = SmtpClient::new("smtp.example.com", 587)?;
client.connect()?;
client.send_email(&email)?;
```

### HTML Email with Attachment

```rust
use avila_cell::{Email, EmailAddress, mime::{MimePart, MultipartBuilder}};

let from = EmailAddress::new("sender@example.com", None);
let to = EmailAddress::new("recipient@example.com", None);

let mut email = Email::new(from, vec![to], "Invoice", "");

// Add HTML body
email.html_body = Some("<h1>Invoice</h1><p>Please find attached.</p>".to_string());

// Add attachment
email.attachments.push(MimePart::attachment(
    "invoice.pdf",
    "application/pdf",
    vec![/* PDF bytes */]
));

let mut client = SmtpClient::new("smtp.gmail.com", 587)?;
client.connect()?;
client.auth_plain("user@gmail.com", "password")?;
client.send_email(&email)?;
```

### SMTP with Authentication

```rust
use avila_cell::smtp::{SmtpClient, SmtpSecurity};

let mut client = SmtpClient::with_security(
    "smtp.gmail.com",
    587,
    SmtpSecurity::StartTls
)?;

client.connect()?;

// PLAIN authentication
client.auth_plain("user@gmail.com", "password")?;

// Or LOGIN authentication
client.auth_login("user@gmail.com", "password")?;

// Or XOAUTH2 for Gmail
client.auth_xoauth2("user@gmail.com", "ya29.access_token")?;

client.send_email(&email)?;
```

### MIME Multipart Builder

```rust
use avila_cell::mime::{MimePart, MultipartBuilder};

// Create multipart/alternative (HTML + plain text)
let multipart = MultipartBuilder::alternative()
    .add_part(MimePart::text("Plain text version"))
    .add_part(MimePart::html("<p>HTML version</p>"));

let content_type = multipart.content_type();
let body = multipart.build();

// Create multipart/mixed (with attachments)
let multipart = MultipartBuilder::mixed()
    .add_part(MimePart::text("Email body"))
    .add_part(MimePart::attachment(
        "document.pdf",
        "application/pdf",
        pdf_bytes
    ));
```

### Encoding Utilities

```rust
use avila_cell::encoding::{base64_encode, base64_decode, quoted_printable_encode};

// Base64
let encoded = base64_encode(b"Hello World");
let decoded = base64_decode(&encoded)?;

// Quoted-Printable
let encoded = quoted_printable_encode("Héllo Wörld");

// Generate boundary for multipart
let boundary = generate_boundary();
```

## Roadmap to v4.0

### v0.3.0 (Current)
✅ MIME multipart support
✅ Base64 encoding/decoding
✅ SMTP authentication (PLAIN, LOGIN, XOAUTH2)
✅ HTML email support
✅ File attachments

### v0.4.0 (Next)
- [ ] Complete POP3 client implementation
- [ ] Complete IMAP client implementation
- [ ] SMTP connection pooling
- [ ] Email queue system
- [ ] Retry mechanisms

### v1.0.0
- [ ] S/MIME support (encryption/signing)
- [ ] DKIM signing
- [ ] SPF validation
- [ ] Email templates system
- [ ] Batch email sending

### v2.0.0
- [ ] PGP support
- [ ] Advanced IMAP features (IDLE, SEARCH)
- [ ] Calendar invites (iCalendar)
- [ ] Contact cards (vCard)

### v3.0.0
- [ ] AI-powered email classification
- [ ] Spam filtering
- [ ] Email threading
- [ ] Rich text editor integration

### v4.0.0
- [ ] Distributed email system
- [ ] Blockchain-based email verification
- [ ] Quantum-resistant encryption
- [ ] Neural email processing

## Architecture

The library is organized into modules:

- `lib.rs` - Core types (Email, EmailAddress)
- `smtp.rs` - SMTP client implementation
- `pop3.rs` - POP3 client implementation
- `imap.rs` - IMAP client implementation
- `message.rs` - Email message formatting
- `mime.rs` - MIME multipart support
- `encoding.rs` - Content encoding utilities
- `auth.rs` - Authentication mechanisms

## Testing

Run the test suite:

```bash
cargo test
```

Run examples:

```bash
cargo run --example basic_usage
cargo run --example gmail_client
```

## License

MIT OR Apache-2.0

## Contributing

Part of the Avila ecosystem - First digital life form
