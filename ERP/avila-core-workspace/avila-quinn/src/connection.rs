//! Gerenciamento de conexões QUIC

use alloc::vec::Vec;
use alloc::collections::BTreeMap;
use super::stream::Stream;
use super::packet::Packet;

/// Estados da conexão QUIC
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionState {
    /// Esperando handshake inicial
    Initial,
    /// Handshake em progresso
    Handshaking,
    /// Conexão estabelecida
    Established,
    /// Fechando conexão
    Closing,
    /// Drenando (aguardando timeout)
    Draining,
    /// Conexão fechada
    Closed,
}

/// Connection ID (máximo 20 bytes)
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ConnectionId {
    pub bytes: Vec<u8>,
}

impl ConnectionId {
    /// Gera Connection ID aleatório
    pub fn random(len: u8) -> Self {
        // TODO: Usar RNG criptográfico
        let mut bytes = Vec::new();
        for _ in 0..len {
            bytes.push(0); // PLACEHOLDER
        }
        Self { bytes }
    }
}

/// Conexão QUIC
pub struct Connection {
    /// Estado da conexão
    pub state: ConnectionState,

    /// Connection IDs
    pub local_cid: ConnectionId,
    pub remote_cid: ConnectionId,

    /// Streams abertos
    pub streams: BTreeMap<u64, Stream>,

    /// Próximo stream ID a usar
    pub next_stream_id: u64,

    /// Packets enviados aguardando ACK
    pub sent_packets: BTreeMap<u64, Packet>,

    /// Próximo packet number a enviar
    pub next_packet_number: u64,

    /// Congestion window (bytes)
    pub cwnd: u32,

    /// Bytes em voo (não ACK'd)
    pub bytes_in_flight: u32,

    /// RTT suavizado
    pub smoothed_rtt: u64,

    /// RTT variance
    pub rtt_var: u64,
}

impl Connection {
    /// Cria nova conexão
    pub fn new() -> Self {
        Self {
            state: ConnectionState::Initial,
            local_cid: ConnectionId::random(8),
            remote_cid: ConnectionId::random(8),
            streams: BTreeMap::new(),
            next_stream_id: 0,
            sent_packets: BTreeMap::new(),
            next_packet_number: 0,
            cwnd: 10 * 1200, // 10 pacotes × 1200 bytes (initial cwnd)
            bytes_in_flight: 0,
            smoothed_rtt: 333_000, // 333ms initial
            rtt_var: 166_500,
        }
    }

    /// Abre novo stream
    pub fn open_stream(&mut self) -> u64 {
        let stream_id = self.next_stream_id;
        self.next_stream_id += 4; // Incrementa por 4 (bidirectional, client-initiated)

        self.streams.insert(stream_id, Stream::new(stream_id));
        stream_id
    }

    /// Envia dados em um stream
    pub fn send_on_stream(&mut self, stream_id: u64, data: &[u8]) -> Result<(), ()> {
        if let Some(stream) = self.streams.get_mut(&stream_id) {
            stream.send_buffer.extend_from_slice(data);
            Ok(())
        } else {
            Err(())
        }
    }

    /// Processa pacote recebido
    pub fn handle_packet(&mut self, packet: Packet) {
        match self.state {
            ConnectionState::Initial => {
                // Processa Initial packet
                // TODO: Iniciar handshake
                self.state = ConnectionState::Handshaking;
            }
            ConnectionState::Established => {
                // Processa frames do payload
                // TODO: Parse frames e distribuir para streams
            }
            _ => {}
        }
    }

    /// Atualiza RTT com nova sample
    pub fn update_rtt(&mut self, rtt_sample: u64) {
        // EWMA: smoothed_rtt = (1-α) × smoothed_rtt + α × rtt_sample
        // Tipicamente α = 1/8
        let alpha_inv = 8u64;
        self.smoothed_rtt = (self.smoothed_rtt * (alpha_inv - 1) + rtt_sample) / alpha_inv;

        // Variance
        let diff = if rtt_sample > self.smoothed_rtt {
            rtt_sample - self.smoothed_rtt
        } else {
            self.smoothed_rtt - rtt_sample
        };
        self.rtt_var = (self.rtt_var * 3 + diff) / 4;
    }

    /// Calcula PTO (Probe Timeout)
    pub fn pto(&self) -> u64 {
        self.smoothed_rtt + 4 * self.rtt_var + 1_000 // +1ms granularity
    }
}
