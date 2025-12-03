//! Network layer com QUIC

use alloc::vec::Vec;
use avila_quinn::connection::Connection;

/// Servidor AvilaDB
pub struct Server {
    /// Porta de escuta
    pub port: u16,
    /// Conexões ativas
    pub connections: Vec<Connection>,
}

impl Server {
    /// Cria novo servidor
    pub fn new(port: u16) -> Self {
        Self {
            port,
            connections: Vec::new(),
        }
    }

    /// Inicia servidor
    pub fn start(&mut self) -> Result<(), ()> {
        // TODO: Bind UDP socket
        // TODO: Accept connections
        // TODO: Handle requests
        Ok(())
    }

    /// Processa request de cliente
    pub fn handle_request(&mut self, _request: Request) -> Response {
        // TODO: Parse request
        // TODO: Execute query
        // TODO: Return result
        Response::Success
    }
}

/// Cliente AvilaDB
pub struct Client {
    /// Conexão com servidor
    pub connection: Connection,
}

impl Client {
    /// Conecta ao servidor
    pub fn connect(_host: &str, _port: u16) -> Result<Self, ()> {
        // TODO: Establish QUIC connection
        // TODO: TLS handshake
        Ok(Self {
            connection: Connection::new(),
        })
    }

    /// Envia query
    pub fn query(&mut self, _sql: &str) -> Result<Response, ()> {
        // TODO: Serialize query
        // TODO: Send over QUIC
        // TODO: Receive response
        Ok(Response::Success)
    }
}

/// Request do cliente
#[derive(Debug)]
pub enum Request {
    /// Query SQL
    Query(Vec<u8>),
    /// Prepared statement
    PreparedStatement { id: u64, params: Vec<Vec<u8>> },
    /// Begin transaction
    BeginTx,
    /// Commit transaction
    Commit,
    /// Rollback transaction
    Rollback,
}

/// Response do servidor
#[derive(Debug)]
pub enum Response {
    /// Sucesso
    Success,
    /// Resultado de query
    QueryResult { rows: Vec<Vec<u8>> },
    /// Erro
    Error { code: u32, message: Vec<u8> },
}
