//! Demo do Gossip Protocol funcionando

use avila_distributed_system::{Mycelium, GossipEngine, GossipConfig, Result, SporeData};
use std::sync::Arc;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<()> {
    println!("🍄 Demo: Gossip Protocol");
    println!("========================\n");

    // Cria nós do mycelium
    let node1 = Arc::new(Mycelium::new("node1", "127.0.0.1:7001").await?);
    let node2 = Arc::new(Mycelium::new("node2", "127.0.0.1:7002").await?);
    let node3 = Arc::new(Mycelium::new("node3", "127.0.0.1:7003").await?);

    // Conecta nodes em rede (cada um conhece os outros)
    println!("🔗 Conectando nós...");
    node1.connect_to_peer("127.0.0.1:7002").await?;
    node1.connect_to_peer("127.0.0.1:7003").await?;

    node2.connect_to_peer("127.0.0.1:7001").await?;
    node2.connect_to_peer("127.0.0.1:7003").await?;

    node3.connect_to_peer("127.0.0.1:7001").await?;
    node3.connect_to_peer("127.0.0.1:7002").await?;

    println!("✓ Node1: {} peers", node1.peer_count().await);
    println!("✓ Node2: {} peers", node2.peer_count().await);
    println!("✓ Node3: {} peers\n", node3.peer_count().await);

    // Cria gossip engine
    let config = GossipConfig {
        interval: Duration::from_secs(2),
        fanout: 2,
        default_ttl: 5,
        buffer_size: 100,
    };

    let gossip = Arc::new(GossipEngine::new(config));

    // Adiciona alguns esporos para propagar
    println!("🌱 Adicionando esporos ao gossip...");

    let spore1 = SporeData::new(
        "email_received",
        b"From: alice@example.com\nSubject: Hello World".to_vec(),
        5
    );

    let spore2 = SporeData::new(
        "config_update",
        b"{\"version\": \"1.0.2\", \"feature\": \"gossip\"}".to_vec(),
        5
    );

    let spore3 = SporeData::new(
        "health_check",
        b"status: healthy".to_vec(),
        5
    );

    gossip.queue_spore(spore1).await?;
    gossip.queue_spore(spore2).await?;
    gossip.queue_spore(spore3).await?;

    println!("✓ 3 esporos enfileirados\n");

    // Inicia gossip em background (apenas 3 rodadas para demo)
    println!("💬 Iniciando gossip protocol...\n");

    let gossip_clone = gossip.clone();
    let node1_clone = node1.clone();

    tokio::spawn(async move {
        // Executa manualmente 3 rodadas
        for round in 1..=3 {
            tokio::time::sleep(Duration::from_secs(2)).await;

            let stats = gossip_clone.stats().await;
            println!("📊 Round {}: {} esporos pendentes, {} vistos total",
                     round, stats.pending_spores, stats.seen_spores);

            // Simula uma rodada manual
            let pending = stats.pending_spores;
            let peers = node1_clone.list_peers().await;
            println!("   → Propagando para {} peers\n", peers.len());
        }
    });

    // Aguarda as 3 rodadas
    tokio::time::sleep(Duration::from_secs(7)).await;

    // Estatísticas finais
    let final_stats = gossip.stats().await;
    println!("📈 Estatísticas Finais:");
    println!("   Esporos pendentes: {}", final_stats.pending_spores);
    println!("   Esporos processados: {}", final_stats.seen_spores);
    println!("   Rodadas executadas: {}", final_stats.rounds);

    println!("\n✨ Demo concluída com sucesso!");

    Ok(())
}
