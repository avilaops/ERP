//! IMAP (Internet Message Access Protocol) - Acesso avançado a emails

use avila_error::{Error, ErrorKind, Result};
use avila_molecule::{NetworkAddress, tcp::TcpClient};

/// Cliente IMAP
pub struct ImapClient {
    client: TcpClient,
    tag_counter: u32,
}

impl ImapClient {
    /// Connects to IMAP server
    pub async fn connect(server: NetworkAddress) -> Result<Self> {
        let client = TcpClient::connect(server).await?;
        Ok(Self {
            client,
            tag_counter: 0,
        })
    }

    /// Authentication
    pub async fn login(&mut self, username: &str, password: &str) -> Result<()> {
        let tag = self.next_tag();
        let cmd = format!("{} LOGIN {} {}\r\n", tag, username, password);
        self.client.send(cmd.as_bytes()).await?;
        self.expect_ok(&tag).await?;
        Ok(())
    }

    /// Selects mailbox
    pub async fn select(&mut self, mailbox: &str) -> Result<()> {
        let tag = self.next_tag();
        let cmd = format!("{} SELECT {}\r\n", tag, mailbox);
        self.client.send(cmd.as_bytes()).await?;
        self.expect_ok(&tag).await?;
        Ok(())
    }

    /// Lists mailboxes
    pub async fn list(&mut self) -> Result<Vec<String>> {
        let tag = self.next_tag();
        self.client.send(format!("{} LIST \"\" \"*\"\r\n", tag).as_bytes()).await?;

        let mut buffer = vec![0u8; 8192];
        let n = self.client.receive(&mut buffer).await?;
        let response = String::from_utf8_lossy(&buffer[..n]);

        let mut mailboxes = Vec::new();
        for line in response.lines() {
            if line.starts_with("* LIST") {
                if let Some(mailbox) = line.split('"').nth(3) {
                    mailboxes.push(mailbox.to_string());
                }
            }
        }
        Ok(mailboxes)
    }

    /// Searches messages
    pub async fn search(&mut self, criteria: &str) -> Result<Vec<u32>> {
        let tag = self.next_tag();
        let cmd = format!("{} SEARCH {}\r\n", tag, criteria);
        self.client.send(cmd.as_bytes()).await?;

        let mut buffer = vec![0u8; 8192];
        let n = self.client.receive(&mut buffer).await?;
        let response = String::from_utf8_lossy(&buffer[..n]);

        let mut ids = Vec::new();
        for line in response.lines() {
            if line.starts_with("* SEARCH") {
                for part in line.split_whitespace().skip(2) {
                    if let Ok(id) = part.parse::<u32>() {
                        ids.push(id);
                    }
                }
            }
        }
        Ok(ids)
    }

    /// Fetches message
    pub async fn fetch(&mut self, message_id: u32, items: &str) -> Result<String> {
        let tag = self.next_tag();
        let cmd = format!("{} FETCH {} {}\r\n", tag, message_id, items);
        self.client.send(cmd.as_bytes()).await?;

        let mut buffer = vec![0u8; 65536];
        let n = self.client.receive(&mut buffer).await?;
        let response = String::from_utf8_lossy(&buffer[..n]).to_string();

        Ok(response)
    }

    /// Closes mailbox
    pub async fn close(&mut self) -> Result<()> {
        let tag = self.next_tag();
        self.client.send(format!("{} CLOSE\r\n", tag).as_bytes()).await?;
        self.expect_ok(&tag).await?;
        Ok(())
    }

    /// Logout
    pub async fn logout(&mut self) -> Result<()> {
        let tag = self.next_tag();
        self.client.send(format!("{} LOGOUT\r\n", tag).as_bytes()).await?;
        Ok(())
    }

    /// Generates next command tag
    fn next_tag(&mut self) -> String {
        self.tag_counter += 1;
        format!("A{:04}", self.tag_counter)
    }

    /// Expects OK response
    async fn expect_ok(&mut self, tag: &str) -> Result<String> {
        let mut buffer = vec![0u8; 4096];
        let n = self.client.receive(&mut buffer).await?;
        let response = String::from_utf8_lossy(&buffer[..n]).to_string();

        if !response.contains(&format!("{} OK", tag)) {
            return Err(Error::new(
                ErrorKind::Network,
                format!("Resposta IMAP inválida: {}", response),
            ));
        }

        Ok(response)
    }
}
