//! Gossip Protocol - Protocolo de disseminação de informação

use crate::{SporeData, Mycelium, Result};
use std::time::Duration;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::{HashMap, HashSet};

/// Configuração do protocolo gossip
pub struct GossipConfig {
    /// Intervalo entre rodadas de gossip (segundos)
    pub interval: Duration,
    /// Número de peers aleatórios para propagar por rodada
    pub fanout: usize,
    /// TTL padrão para esporos
    pub default_ttl: u32,
    /// Limite de esporos no buffer
    pub buffer_size: usize,
}

impl Default for GossipConfig {
    fn default() -> Self {
        Self {
            interval: Duration::from_secs(5),
            fanout: 3,
            default_ttl: 10,
            buffer_size: 1000,
        }
    }
}

/// Motor de gossip protocol
pub struct GossipEngine {
    /// Configuração
    config: GossipConfig,
    /// Buffer de esporos pendentes
    pending_spores: Arc<RwLock<Vec<SporeData>>>,
    /// IDs de esporos já processados (anti-duplicação)
    seen_spores: Arc<RwLock<HashSet<String>>>,
    /// Contador de rodadas
    round_count: Arc<RwLock<u64>>,
}

impl GossipEngine {
    /// Cria novo motor de gossip
    pub fn new(config: GossipConfig) -> Self {
        Self {
            config,
            pending_spores: Arc::new(RwLock::new(Vec::new())),
            seen_spores: Arc::new(RwLock::new(HashSet::new())),
            round_count: Arc::new(RwLock::new(0)),
        }
    }

    /// Adiciona esporo ao buffer de propagação
    pub async fn queue_spore(&self, spore: SporeData) -> Result<()> {
        let mut spores = self.pending_spores.write().await;
        let mut seen = self.seen_spores.write().await;

        // Anti-duplicação
        if seen.contains(&spore.id) {
            return Ok(());
        }

        seen.insert(spore.id.clone());
        spores.push(spore);

        // Limita buffer
        if spores.len() > self.config.buffer_size {
            spores.remove(0);
        }

        Ok(())
    }

    /// Inicia loop de gossip (bloqueante)
    pub async fn start(&self, mycelium: Arc<Mycelium>) -> Result<()> {
        println!("💬 Gossip engine iniciado (fanout: {}, interval: {:?})",
                 self.config.fanout, self.config.interval);

        loop {
            tokio::time::sleep(self.config.interval).await;

            let mut round = self.round_count.write().await;
            *round += 1;
            let round_num = *round;
            drop(round);

            self.gossip_round(&mycelium, round_num).await?;
        }
    }

    /// Executa uma rodada de gossip
    async fn gossip_round(&self, mycelium: &Mycelium, round: u64) -> Result<()> {
        let mut spores = self.pending_spores.write().await;

        if spores.is_empty() {
            return Ok(());
        }

        // Seleciona peers aleatórios
        let peers = mycelium.list_peers().await;
        if peers.is_empty() {
            return Ok(());
        }

        let fanout = self.config.fanout.min(peers.len());
        let selected_peers = self.select_random_peers(&peers, fanout);

        println!("💬 Round {}: propagando {} esporos para {} peers",
                 round, spores.len(), selected_peers.len());

        // Propaga esporos
        for spore in spores.iter_mut() {
            if !spore.decrement_ttl() {
                continue; // TTL expirado
            }

            for peer in &selected_peers {
                // Em produção, enviaria via TCP aqui
                println!("   → Esporo {} para peer {}", spore.id, peer);
            }
        }

        // Remove esporos expirados
        spores.retain(|s| s.ttl > 0);

        Ok(())
    }

    /// Seleciona N peers aleatórios
    fn select_random_peers(&self, peers: &[String], count: usize) -> Vec<String> {
        use std::collections::HashSet;

        if peers.len() <= count {
            return peers.to_vec();
        }

        let mut selected = HashSet::new();
        let mut result = Vec::new();

        // Usa timestamp como seed simples
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos() as usize;

        while result.len() < count {
            let idx = (seed + result.len()) % peers.len();
            if selected.insert(idx) {
                result.push(peers[idx].clone());
            }
        }

        result
    }

    /// Estatísticas do gossip
    pub async fn stats(&self) -> GossipStats {
        let spores = self.pending_spores.read().await;
        let seen = self.seen_spores.read().await;
        let round = self.round_count.read().await;

        GossipStats {
            pending_spores: spores.len(),
            seen_spores: seen.len(),
            rounds: *round,
        }
    }
}

/// Estatísticas do protocolo gossip
#[derive(Debug, Clone)]
pub struct GossipStats {
    /// Esporos pendentes
    pub pending_spores: usize,
    /// Total de esporos vistos
    pub seen_spores: usize,
    /// Número de rodadas executadas
    pub rounds: u64,
}
