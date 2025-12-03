//! Exemplo: Rede de fungos comunicando entre átomos
//!
//! Este exemplo demonstra como criar uma rede micélica distribuída
//! onde múltiplos nós (átomos) se conectam e compartilham dados via esporos.

use avila_distributed_system::{Mycelium, Result};

#[tokio::main]
async fn main() -> Result<()> {
    println!("🍄 Iniciando rede de fungos...\n");

    // Criar três nós do micélio (três "átomos" conectados)
    println!("📍 Criando nó A em localhost:7001");
    let mut mycelium_a = Mycelium::new("Fungo_A", "127.0.0.1:7001").await?;
    mycelium_a.start().await?;

    println!("📍 Criando nó B em localhost:7002");
    let mut mycelium_b = Mycelium::new("Fungo_B", "127.0.0.1:7002").await?;
    mycelium_b.start().await?;

    println!("📍 Criando nó C em localhost:7003");
    let mut mycelium_c = Mycelium::new("Fungo_C", "127.0.0.1:7003").await?;
    mycelium_c.start().await?;

    println!("\n🔗 Conectando nós (formando micélio)...");

    // B conecta a A
    mycelium_b.connect_to_peer("127.0.0.1:7001").await?;

    // C conecta a B (formando cadeia A <-> B <-> C)
    mycelium_c.connect_to_peer("127.0.0.1:7002").await?;

    println!("\n📊 Status da rede:");
    println!("  Nó A: {} peers conectados", mycelium_a.peer_count().await);
    println!("  Nó B: {} peers conectados", mycelium_b.peer_count().await);
    println!("  Nó C: {} peers conectados", mycelium_c.peer_count().await);

    println!("\n🍄 Liberando esporo do Nó A...");
    let data = b"Hello from Fungo A!".to_vec();
    mycelium_a.release_spore("greeting", data).await?;

    println!("\n🌊 Esporo propagado pela rede micélica!");
    println!("   Nó A -> Nó B -> Nó C");

    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

    println!("\n✅ Demonstração completa!");
    println!("🍄 Fungos podem se espalhar entre átomos formando redes resilientes!");

    Ok(())
}
