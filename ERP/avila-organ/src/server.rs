//! Servidor de email completo

use avila_tissue::{
    generate_id,
    now,
    Email,
    EmailAddress,
    EmailMetadata,
    Result,
};
use avila_tissue::storage::EmailStorage;
use tokio::net::TcpListener;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use std::sync::Arc;

pub struct EmailServer {
    smtp_port: u16,
    imap_port: u16,
    storage: Arc<EmailStorage>,
}

impl EmailServer {
    pub fn new(smtp_port: u16, imap_port: u16, storage: EmailStorage) -> Self {
        Self {
            smtp_port,
            imap_port,
            storage: Arc::new(storage),
        }
    }

    pub async fn start(self: Arc<Self>) -> Result<()> {
        println!("📧 Starting SMTP server on port {}", self.smtp_port);
        println!("📧 Starting IMAP server on port {}", self.imap_port);

        // Clone Arc para cada task
        let smtp_server = Arc::clone(&self);
        let imap_server = Arc::clone(&self);

        // Spawn SMTP server
        let smtp_task = tokio::spawn(async move {
            smtp_server.run_smtp_server().await
        });

        // Spawn IMAP server
        let imap_task = tokio::spawn(async move {
            imap_server.run_imap_server().await
        });

        // Aguardar ambos os servidores
        let _ = tokio::try_join!(smtp_task, imap_task);

        Ok(())
    }

    async fn run_smtp_server(&self) -> Result<()> {
        let addr = format!("0.0.0.0:{}", self.smtp_port);
        let listener = TcpListener::bind(&addr).await?;
        println!("✅ SMTP listening on {}", addr);

        loop {
            match listener.accept().await {
                Ok((socket, addr)) => {
                    println!("📨 New SMTP connection from {}", addr);
                    let storage = Arc::clone(&self.storage);

                    tokio::spawn(async move {
                        if let Err(e) = Self::handle_smtp_connection(socket, storage).await {
                            eprintln!("❌ SMTP error: {}", e);
                        }
                    });
                }
                Err(e) => eprintln!("❌ SMTP accept error: {}", e),
            }
        }
    }

    async fn handle_smtp_connection(
        socket: tokio::net::TcpStream,
        storage: Arc<EmailStorage>
    ) -> Result<()> {
        let (reader, mut writer) = socket.into_split();
        let mut reader = BufReader::new(reader);
        let mut line = String::new();

        // Send greeting
        writer.write_all(b"220 avila-mail SMTP Ready\r\n").await?;

        let mut mail_from = String::new();
        let mut rcpt_to: Vec<String> = Vec::new();
        let mut data_mode = false;
        let mut email_data = String::new();

        loop {
            line.clear();
            let n = reader.read_line(&mut line).await?;
            if n == 0 { break; }

            let cmd = line.trim();
            println!("SMTP << {}", cmd);

            if data_mode {
                if cmd == "." {
                    // End of DATA
                    data_mode = false;

                    // Save email
                    let id = generate_id();
                    let received_at = now();

                    // Parse addresses
                    let from = EmailAddress::new(&mail_from)
                        .unwrap_or_else(|_| {
                            EmailAddress::new("unknown@localhost").unwrap()
                        });

                    let to = rcpt_to.iter()
                        .filter_map(|addr| EmailAddress::new(addr).ok())
                        .collect::<Vec<_>>();

                    let to = if to.is_empty() {
                        vec![EmailAddress::new("unknown@localhost").unwrap()]
                    } else {
                        to
                    };

                    // Create email
                    let email = Email::new(
                        from,
                        to,
                        "Email via SMTP".to_string(),
                        email_data.clone(),
                    );

                    storage.store(&email, &EmailMetadata {
                        id: id.clone(),
                        mailbox: "INBOX".to_string(),
                        flags: Vec::new(),
                        received_at,
                        size: email_data.len(),
                        thread_id: None,
                    })?;

                    println!("✅ Email stored with ID: {}", id);
                    writer.write_all(b"250 OK Message accepted\r\n").await?;

                    // Reset state
                    mail_from.clear();
                    rcpt_to.clear();
                    email_data.clear();
                } else {
                    email_data.push_str(cmd);
                    email_data.push('\n');
                }
                continue;
            }

            if cmd.starts_with("HELO") || cmd.starts_with("EHLO") {
                writer.write_all(b"250 avila-mail Hello\r\n").await?;
            } else if cmd.starts_with("MAIL FROM:") {
                mail_from = cmd[10..].trim().trim_matches('<').trim_matches('>').to_string();
                writer.write_all(b"250 OK\r\n").await?;
            } else if cmd.starts_with("RCPT TO:") {
                let addr = cmd[8..].trim().trim_matches('<').trim_matches('>').to_string();
                rcpt_to.push(addr);
                writer.write_all(b"250 OK\r\n").await?;
            } else if cmd == "DATA" {
                writer.write_all(b"354 Start mail input; end with <CRLF>.<CRLF>\r\n").await?;
                data_mode = true;
            } else if cmd == "QUIT" {
                writer.write_all(b"221 Bye\r\n").await?;
                break;
            } else {
                writer.write_all(b"500 Unknown command\r\n").await?;
            }
        }

        Ok(())
    }

    async fn run_imap_server(&self) -> Result<()> {
        let addr = format!("0.0.0.0:{}", self.imap_port);
        let listener = TcpListener::bind(&addr).await?;
        println!("✅ IMAP listening on {}", addr);

        loop {
            match listener.accept().await {
                Ok((socket, addr)) => {
                    println!("📬 New IMAP connection from {}", addr);
                    let storage = Arc::clone(&self.storage);

                    tokio::spawn(async move {
                        if let Err(e) = Self::handle_imap_connection(socket, storage).await {
                            eprintln!("❌ IMAP error: {}", e);
                        }
                    });
                }
                Err(e) => eprintln!("❌ IMAP accept error: {}", e),
            }
        }
    }

    async fn handle_imap_connection(
        socket: tokio::net::TcpStream,
        storage: Arc<EmailStorage>
    ) -> Result<()> {
        let (reader, mut writer) = socket.into_split();
        let mut reader = BufReader::new(reader);
        let mut line = String::new();

        // Send greeting
        writer.write_all(b"* OK avila-mail IMAP Ready\r\n").await?;

        let mut _authenticated = false;
        let mut _selected_mailbox: Option<String> = None;

        loop {
            line.clear();
            let n = reader.read_line(&mut line).await?;
            if n == 0 { break; }

            let cmd = line.trim();
            println!("IMAP << {}", cmd);

            let parts: Vec<&str> = cmd.split_whitespace().collect();
            if parts.is_empty() { continue; }

            let tag = parts[0];
            let command = parts.get(1).map(|s| s.to_uppercase());

            match command.as_deref() {
                Some("CAPABILITY") => {
                    writer.write_all(b"* CAPABILITY IMAP4rev1\r\n").await?;
                    writer.write_all(format!("{} OK CAPABILITY completed\r\n", tag).as_bytes()).await?;
                }
                Some("LOGIN") => {
                    _authenticated = true;
                    writer.write_all(format!("{} OK LOGIN completed\r\n", tag).as_bytes()).await?;
                }
                Some("SELECT") => {
                    _selected_mailbox = Some("INBOX".to_string());
                    let count = storage.list_ids()?.len();
                    writer.write_all(format!("* {} EXISTS\r\n", count).as_bytes()).await?;
                    writer.write_all(b"* 0 RECENT\r\n").await?;
                    writer.write_all(b"* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)\r\n").await?;
                    writer.write_all(format!("{} OK SELECT completed\r\n", tag).as_bytes()).await?;
                }
                Some("LIST") => {
                    writer.write_all(b"* LIST () \".\" INBOX\r\n").await?;
                    writer.write_all(format!("{} OK LIST completed\r\n", tag).as_bytes()).await?;
                }
                Some("FETCH") => {
                    // Simplified FETCH
                    writer.write_all(format!("{} OK FETCH completed\r\n", tag).as_bytes()).await?;
                }
                Some("LOGOUT") => {
                    writer.write_all(b"* BYE Logging out\r\n").await?;
                    writer.write_all(format!("{} OK LOGOUT completed\r\n", tag).as_bytes()).await?;
                    break;
                }
                _ => {
                    writer.write_all(format!("{} BAD Unknown command\r\n", tag).as_bytes()).await?;
                }
            }
        }

        Ok(())
    }
}
