//! Exemplo: Sistema de email distribuído via fungos
//!
//! Demonstra como usar o micélio distribuído para propagar emails entre múltiplos
//! servidores de email, criando um sistema resiliente sem ponto único de falha.

use avila_distributed_system::{Mycelium, Result};

#[tokio::main]
async fn main() -> Result<()> {
    println!("📧🍄 Email Platform Distribuído via Fungos\n");

    // Criar três servidores de email distribuídos
    let mut server1 = Mycelium::new("EmailServer_SP", "0.0.0.0:8001").await?;
    let mut server2 = Mycelium::new("EmailServer_RJ", "0.0.0.0:8002").await?;
    let mut server3 = Mycelium::new("EmailServer_MG", "0.0.0.0:8003").await?;

    server1.start().await?;
    server2.start().await?;
    server3.start().await?;

    println!("✅ Três servidores de email iniciados");

    // Conectar em malha (mesh network)
    server1.connect_to_peer("127.0.0.1:8002").await?;
    server2.connect_to_peer("127.0.0.1:8003").await?;
    server3.connect_to_peer("127.0.0.1:8001").await?;

    println!("🔗 Servidores conectados em rede micélica\n");

    // Simular recepção de email no Server1
    println!("📨 Server SP recebeu email...");

    // Criar payload simples sem dependências externas
    let email_data = "From: user@example.com\nTo: admin@avila.inc\nSubject: Test via Fungi\n\nEmail distribuído via rede micélica!";
    let payload = email_data.as_bytes().to_vec();

    // Propagar via esporo
    server1.release_spore("email_received", payload).await?;

    println!("🍄 Email propagado automaticamente para todos os servidores!");
    println!("   SP -> RJ -> MG -> SP (circular, resiliente)");

    println!("\n💡 Vantagens:");
    println!("   ✓ Sem ponto único de falha");
    println!("   ✓ Replicação automática");
    println!("   ✓ Escalabilidade horizontal");
    println!("   ✓ Auto-recuperação da rede");

    Ok(())
}
