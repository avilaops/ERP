//! Gerenciamento de streams QUIC

use alloc::vec::Vec;
use alloc::collections::VecDeque;

/// Estado do stream
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamState {
    /// Aberto para enviar e receber
    Open,
    /// Apenas enviando (peer fechou recebimento)
    SendOnly,
    /// Apenas recebendo (local fechou envio)
    RecvOnly,
    /// Fechado
    Closed,
}

/// Stream QUIC
pub struct Stream {
    /// ID do stream
    pub id: u64,

    /// Estado
    pub state: StreamState,

    /// Buffer de envio
    pub send_buffer: Vec<u8>,

    /// Offset do próximo byte a enviar
    pub send_offset: u64,

    /// Buffer de recebimento (ordenado)
    pub recv_buffer: Vec<u8>,

    /// Offset do próximo byte esperado
    pub recv_offset: u64,

    /// Dados fora de ordem (offset → data)
    pub out_of_order: VecDeque<(u64, Vec<u8>)>,

    /// Flow control: bytes que podemos enviar
    pub send_window: u64,

    /// Flow control: bytes que peer pode enviar
    pub recv_window: u64,

    /// FIN recebido?
    pub fin_received: bool,

    /// FIN enviado?
    pub fin_sent: bool,
}

impl Stream {
    /// Cria novo stream
    pub fn new(id: u64) -> Self {
        Self {
            id,
            state: StreamState::Open,
            send_buffer: Vec::new(),
            send_offset: 0,
            recv_buffer: Vec::new(),
            recv_offset: 0,
            out_of_order: VecDeque::new(),
            send_window: 1_048_576, // 1 MB inicial
            recv_window: 1_048_576,
            fin_received: false,
            fin_sent: false,
        }
    }

    /// Escreve dados no send buffer
    pub fn write(&mut self, data: &[u8]) {
        self.send_buffer.extend_from_slice(data);
    }

    /// Lê dados do recv buffer
    pub fn read(&mut self, buf: &mut [u8]) -> usize {
        let to_read = buf.len().min(self.recv_buffer.len());
        buf[..to_read].copy_from_slice(&self.recv_buffer[..to_read]);
        self.recv_buffer.drain(..to_read);
        to_read
    }

    /// Processa dados recebidos em offset
    pub fn handle_data(&mut self, offset: u64, data: Vec<u8>, fin: bool) {
        if offset == self.recv_offset {
            // Dados em ordem: adiciona ao buffer
            self.recv_buffer.extend_from_slice(&data);
            self.recv_offset += data.len() as u64;

            // Processa dados fora de ordem que agora estão em ordem
            self.process_out_of_order();
        } else if offset > self.recv_offset {
            // Dados fora de ordem: armazena para depois
            self.out_of_order.push_back((offset, data));
        }
        // Se offset < recv_offset: dados duplicados, ignora

        if fin {
            self.fin_received = true;
            if self.recv_buffer.is_empty() {
                self.state = StreamState::RecvOnly;
            }
        }
    }

    /// Processa dados fora de ordem que agora estão em sequência
    fn process_out_of_order(&mut self) {
        loop {
            let mut found = false;
            let mut idx = 0;

            for (i, (offset, _)) in self.out_of_order.iter().enumerate() {
                if *offset == self.recv_offset {
                    found = true;
                    idx = i;
                    break;
                }
            }

            if !found {
                break;
            }

            if let Some((_, data)) = self.out_of_order.remove(idx) {
                self.recv_buffer.extend_from_slice(&data);
                self.recv_offset += data.len() as u64;
            }
        }
    }

    /// Fecha stream para envio
    pub fn close_send(&mut self) {
        self.fin_sent = true;
        match self.state {
            StreamState::Open => self.state = StreamState::RecvOnly,
            StreamState::SendOnly => self.state = StreamState::Closed,
            _ => {}
        }
    }
}
