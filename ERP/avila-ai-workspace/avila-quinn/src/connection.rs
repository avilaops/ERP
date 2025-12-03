//! Gerenciamento de conexões QUIC

use alloc::collections::BTreeMap;

/// Estado da conexão QUIC
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionState {
    /// Handshake inicial
    Initial,
    /// Handshake em progresso
    Handshake,
    /// Conexão estabelecida
    Established,
    /// Fechando conexão
    Closing,
    /// Drenando (aguardando timeout)
    Draining,
    /// Conexão fechada
    Closed,
}

/// Conexão QUIC
pub struct Connection {
    /// Estado atual
    pub state: ConnectionState,

    /// Connection ID local
    pub local_cid: [u8; 8],

    /// Connection ID remoto
    pub remote_cid: [u8; 8],

    /// Streams ativos
    pub streams: BTreeMap<u64, Stream>,

    /// Próximo packet number a enviar
    pub next_packet_number: u64,

    /// Maior packet number recebido
    pub largest_received_pn: u64,

    /// Flow control: bytes que podemos receber
    pub max_data_local: u64,

    /// Flow control: bytes que podemos enviar
    pub max_data_remote: u64,
}

impl Connection {
    /// Cria nova conexão
    pub fn new(local_cid: [u8; 8], remote_cid: [u8; 8]) -> Self {
        Self {
            state: ConnectionState::Initial,
            local_cid,
            remote_cid,
            streams: BTreeMap::new(),
            next_packet_number: 0,
            largest_received_pn: 0,
            max_data_local: 10 * 1024 * 1024, // 10 MB
            max_data_remote: 0,
        }
    }

    /// Abre novo stream
    pub fn open_stream(&mut self, stream_id: u64) -> &mut Stream {
        self.streams.entry(stream_id).or_insert_with(|| Stream {
            id: stream_id,
            send_offset: 0,
            recv_offset: 0,
            max_stream_data: 1024 * 1024, // 1 MB
            fin_sent: false,
            fin_received: false,
        })
    }

    /// Processa packet recebido
    pub fn process_packet(&mut self, packet: &[u8]) {
        // TODO: Implementar parsing e processamento de packet
        self.largest_received_pn += 1;
    }

    /// Gera próximo packet para enviar
    pub fn next_packet(&mut self) -> alloc::vec::Vec<u8> {
        // TODO: Implementar geração de packet
        self.next_packet_number += 1;
        alloc::vec![0u8; 1200]
    }
}

/// Stream QUIC (fluxo bidirecional ou unidirecional)
pub struct Stream {
    /// ID do stream
    pub id: u64,

    /// Offset de envio (próximo byte a enviar)
    pub send_offset: u64,

    /// Offset de recepção (próximo byte esperado)
    pub recv_offset: u64,

    /// Máximo de dados que podemos receber
    pub max_stream_data: u64,

    /// FIN enviado (stream fechado para escrita)
    pub fin_sent: bool,

    /// FIN recebido (stream fechado para leitura)
    pub fin_received: bool,
}

impl Stream {
    /// Verifica se stream é bidirecional
    pub fn is_bidirectional(&self) -> bool {
        (self.id & 0x02) == 0
    }

    /// Verifica se stream foi iniciado pelo cliente
    pub fn is_client_initiated(&self) -> bool {
        (self.id & 0x01) == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connection_creation() {
        let conn = Connection::new([1; 8], [2; 8]);
        assert_eq!(conn.state, ConnectionState::Initial);
    }

    #[test]
    fn test_stream_types() {
        let stream_bidi_client = Stream {
            id: 0, // 0b00: bidi, client-initiated
            send_offset: 0,
            recv_offset: 0,
            max_stream_data: 0,
            fin_sent: false,
            fin_received: false,
        };

        assert!(stream_bidi_client.is_bidirectional());
        assert!(stream_bidi_client.is_client_initiated());
    }
}
