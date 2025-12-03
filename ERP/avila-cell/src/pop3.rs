//! POP3 (Post Office Protocol v3) - Recebimento de emails

use avila_error::{Error, ErrorKind, Result};
use avila_molecule::{NetworkAddress, tcp::TcpClient};

/// Cliente POP3
pub struct Pop3Client {
    client: TcpClient,
}

impl Pop3Client {
    /// Connects to POP3 server
    pub async fn connect(server: NetworkAddress) -> Result<Self> {
        let client = TcpClient::connect(server).await?;
        Ok(Self { client })
    }

    /// Authentication
    pub async fn login(&mut self, username: &str, password: &str) -> Result<()> {
        // USER
        let cmd = format!("USER {}\r\n", username);
        self.client.send(cmd.as_bytes()).await?;
        self.expect_ok().await?;

        // PASS
        let cmd = format!("PASS {}\r\n", password);
        self.client.send(cmd.as_bytes()).await?;
        self.expect_ok().await?;

        Ok(())
    }

    /// Lists messages
    pub async fn list(&mut self) -> Result<Vec<(u32, usize)>> {
        self.client.send(b"LIST\r\n").await?;
        let response = self.expect_ok().await?;

        let mut messages = Vec::new();
        for line in response.lines().skip(1) {
            if line == "." {
                break;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                if let (Ok(id), Ok(size)) = (parts[0].parse(), parts[1].parse()) {
                    messages.push((id, size));
                }
            }
        }
        Ok(messages)
    }

    /// Retrieves message
    pub async fn retrieve(&mut self, message_id: u32) -> Result<String> {
        let cmd = format!("RETR {}\r\n", message_id);
        self.client.send(cmd.as_bytes()).await?;
        self.expect_ok().await?;

        let mut message = String::new();
        let mut buffer = vec![0u8; 4096];

        loop {
            let n = self.client.receive(&mut buffer).await?;
            let chunk = String::from_utf8_lossy(&buffer[..n]);
            message.push_str(&chunk);

            if message.ends_with("\r\n.\r\n") {
                message.truncate(message.len() - 5);
                break;
            }
        }

        Ok(message)
    }

    /// Deletes message
    pub async fn delete(&mut self, message_id: u32) -> Result<()> {
        let cmd = format!("DELE {}\r\n", message_id);
        self.client.send(cmd.as_bytes()).await?;
        self.expect_ok().await?;
        Ok(())
    }

    /// Closes connection
    pub async fn quit(&mut self) -> Result<()> {
        self.client.send(b"QUIT\r\n").await?;
        Ok(())
    }

    /// Expects +OK response
    async fn expect_ok(&mut self) -> Result<String> {
        let mut buffer = vec![0u8; 1024];
        let n = self.client.receive(&mut buffer).await?;
        let response = String::from_utf8_lossy(&buffer[..n]).to_string();

        if !response.starts_with("+OK") {
            return Err(Error::new(
                ErrorKind::Network,
                format!("Resposta POP3 inválida: {}", response),
            ));
        }

        Ok(response)
    }
}
