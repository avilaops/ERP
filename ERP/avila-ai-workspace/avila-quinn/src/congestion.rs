//! Controle de congestionamento (Cubic/BBR)

/// Algoritmo de controle de congestionamento
pub trait CongestionController {
    /// Processa ACK recebido
    fn on_ack(&mut self, bytes_acked: u64, now: u64);

    /// Processa perda detectada
    fn on_loss(&mut self, bytes_lost: u64, now: u64);

    /// Retorna tamanho atual da janela de congestionamento
    fn cwnd(&self) -> u64;

    /// Verifica se pode enviar dados
    fn can_send(&self) -> bool;
}

/// Cubic congestion control (padrão QUIC)
pub struct Cubic {
    /// Janela de congestionamento (bytes)
    pub cwnd: u64,

    /// Slow start threshold
    pub ssthresh: u64,

    /// W_max (janela no momento da última perda)
    pub w_max: u64,

    /// K (ponto de inflexão da função cúbica)
    pub k: f64,

    /// Timestamp da última perda
    pub last_loss_time: u64,

    /// RTT smoothed
    pub srtt: u64,
}

impl Cubic {
    /// Cria novo controller Cubic
    pub fn new() -> Self {
        Self {
            cwnd: 14480, // ~10 packets de 1448 bytes
            ssthresh: u64::MAX,
            w_max: 0,
            k: 0.0,
            last_loss_time: 0,
            srtt: 0,
        }
    }

    /// Calcula janela usando função cúbica
    /// W(t) = C(t - K)³ + W_max
    fn cubic_window(&self, now: u64) -> u64 {
        const C: f64 = 0.4; // constante Cubic

        let t = (now - self.last_loss_time) as f64 / 1_000_000.0; // segundos
        let w = C * (t - self.k).powi(3) + self.w_max as f64;

        w.max(0.0) as u64
    }
}

impl CongestionController for Cubic {
    fn on_ack(&mut self, bytes_acked: u64, now: u64) {
        // Slow start
        if self.cwnd < self.ssthresh {
            self.cwnd += bytes_acked;
        } else {
            // Congestion avoidance (Cubic)
            let target_cwnd = self.cubic_window(now);
            if target_cwnd > self.cwnd {
                let increment = (bytes_acked * 1448) / self.cwnd;
                self.cwnd += increment;
            }
        }
    }

    fn on_loss(&mut self, bytes_lost: u64, now: u64) {
        // Multiplicative decrease
        self.w_max = self.cwnd;
        self.ssthresh = (self.cwnd as f64 * 0.7) as u64;
        self.cwnd = self.ssthresh;

        // Calcula K (tempo para recovery)
        const BETA: f64 = 0.3;
        const C: f64 = 0.4;
        self.k = ((self.w_max as f64 * BETA) / C).cbrt();

        self.last_loss_time = now;
    }

    fn cwnd(&self) -> u64 {
        self.cwnd
    }

    fn can_send(&self) -> bool {
        self.cwnd > 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cubic_slow_start() {
        let mut cubic = Cubic::new();
        let initial_cwnd = cubic.cwnd;

        // Simula ACK de 1448 bytes
        cubic.on_ack(1448, 1000);

        // Em slow start, cwnd deve crescer linearmente
        assert!(cubic.cwnd > initial_cwnd);
    }

    #[test]
    fn test_cubic_loss() {
        let mut cubic = Cubic::new();
        cubic.cwnd = 100000;

        cubic.on_loss(1448, 1000);

        // Após perda, cwnd deve diminuir
        assert!(cubic.cwnd < 100000);
        assert_eq!(cubic.w_max, 100000);
    }
}
