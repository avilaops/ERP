//! Controle de congestionamento

/// Algoritmo de congestionamento
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CongestionAlgorithm {
    /// Reno (clássico)
    Reno,
    /// Cubic (padrão Linux)
    Cubic,
    /// BBR (Google)
    Bbr,
}

/// Estado do controle de congestionamento
pub struct CongestionController {
    /// Algoritmo usado
    pub algorithm: CongestionAlgorithm,

    /// Congestion window (bytes)
    pub cwnd: u32,

    /// Slow start threshold
    pub ssthresh: u32,

    /// Bytes em voo
    pub bytes_in_flight: u32,

    /// Estado específico do Cubic
    pub cubic_state: Option<CubicState>,
}

/// Estado do algoritmo Cubic
pub struct CubicState {
    /// W_max: cwnd no momento da última perda
    pub w_max: u32,

    /// K: ponto de inflexão
    pub k: f64,

    /// Origem do tempo (última perda)
    pub epoch_start: u64,

    /// Constante C
    pub c: f64,
}

impl CongestionController {
    /// Cria novo controller
    pub fn new(algorithm: CongestionAlgorithm) -> Self {
        Self {
            algorithm,
            cwnd: 10 * 1200, // Initial window: 10 packets
            ssthresh: u32::MAX,
            bytes_in_flight: 0,
            cubic_state: if algorithm == CongestionAlgorithm::Cubic {
                Some(CubicState {
                    w_max: 0,
                    k: 0.0,
                    epoch_start: 0,
                    c: 0.4,
                })
            } else {
                None
            },
        }
    }

    /// Processa ACK de bytes
    pub fn on_ack(&mut self, acked_bytes: u32, now: u64) {
        self.bytes_in_flight = self.bytes_in_flight.saturating_sub(acked_bytes);

        match self.algorithm {
            CongestionAlgorithm::Reno => self.reno_on_ack(acked_bytes),
            CongestionAlgorithm::Cubic => self.cubic_on_ack(acked_bytes, now),
            CongestionAlgorithm::Bbr => self.bbr_on_ack(acked_bytes),
        }
    }

    /// Processa perda de pacote
    pub fn on_loss(&mut self, lost_bytes: u32, now: u64) {
        match self.algorithm {
            CongestionAlgorithm::Reno => self.reno_on_loss(),
            CongestionAlgorithm::Cubic => self.cubic_on_loss(now),
            CongestionAlgorithm::Bbr => self.bbr_on_loss(),
        }
    }

    /// Reno: ACK processing
    fn reno_on_ack(&mut self, acked_bytes: u32) {
        if self.cwnd < self.ssthresh {
            // Slow start: exponencial
            self.cwnd += acked_bytes;
        } else {
            // Congestion avoidance: linear
            // cwnd += MSS × (acked / cwnd)
            let mss = 1200u32;
            let increment = (mss * acked_bytes) / self.cwnd;
            self.cwnd += increment.max(1);
        }
    }

    /// Reno: loss processing
    fn reno_on_loss(&mut self) {
        self.ssthresh = self.cwnd / 2;
        self.cwnd = self.ssthresh;
    }

    /// Cubic: ACK processing
    fn cubic_on_ack(&mut self, acked_bytes: u32, now: u64) {
        if let Some(state) = &mut self.cubic_state {
            if self.cwnd < self.ssthresh {
                // Slow start
                self.cwnd += acked_bytes;
                return;
            }

            // Congestion avoidance (Cubic)
            // W_cubic(t) = C × (t - K)³ + W_max

            let t = (now - state.epoch_start) as f64 / 1_000_000.0; // segundos
            let k = state.k;
            let c = state.c;
            let w_max = state.w_max as f64;

            let w_cubic = c * (t - k).powi(3) + w_max;

            // Atualiza cwnd
            let target = w_cubic as u32;
            if target > self.cwnd {
                self.cwnd = target.min(self.cwnd + acked_bytes);
            }
        }
    }

    /// Cubic: loss processing
    fn cubic_on_loss(&mut self, now: u64) {
        if let Some(state) = &mut self.cubic_state {
            state.w_max = self.cwnd;
            self.cwnd = (self.cwnd as f64 * 0.7) as u32; // β = 0.7
            self.ssthresh = self.cwnd;

            // Calcula K: K = ∛(W_max × (1-β) / C)
            let beta = 0.7;
            let k_val = ((state.w_max as f64 * (1.0 - beta)) / state.c).cbrt();
            state.k = k_val;
            state.epoch_start = now;
        }
    }

    /// BBR: ACK processing (simplificado)
    fn bbr_on_ack(&mut self, _acked_bytes: u32) {
        // TODO: Implementar BBR completo
        // Requer tracking de bandwidth e RTT
    }

    /// BBR: loss processing
    fn bbr_on_loss(&mut self) {
        // BBR não reage a perdas individuais
        // Apenas ajusta quando detecta congestion persistente
    }

    /// Verifica se pode enviar mais dados
    pub fn can_send(&self) -> bool {
        self.bytes_in_flight < self.cwnd
    }

    /// Bytes disponíveis para enviar
    pub fn available_window(&self) -> u32 {
        self.cwnd.saturating_sub(self.bytes_in_flight)
    }
}
