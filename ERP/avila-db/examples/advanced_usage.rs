//! Exemplos avançados do AvilaDB
//!
//! Este exemplo demonstra:
//! - Autenticação e segurança
//! - Cache inteligente
//! - Compressão automática
//! - Telemetria e métricas
//! - Vector search

use aviladb::{AvilaClient, Config, Document};
use std::time::Instant;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 AvilaDB - Exemplos Avançados\n");

    // 1. Configuração avançada
    println!("📋 1. Configuração Avançada");
    let config = Config {
        endpoint: "http://localhost:8000".to_string(),
        enable_compression: true,
        max_cache_entries: 1000,
        cache_ttl: 300,
        request_timeout: 30,
        max_connections: 100,
        ..Default::default()
    };

    let client = AvilaClient::with_config(config).await?;
    println!("✅ Cliente conectado com cache e compressão\n");

    // 2. Criação e inserção de dados
    println!("📊 2. Inserção de Dados com Métricas");
    let db = client.database("gamedb");
    let players = db.collection("players");

    let start = Instant::now();
    for i in 0..1000 {
        let player = Document::new()
            .set("playerId", format!("player_{}", i))
            .set("username", format!("Player{}", i))
            .set("level", (i % 100) as i64)
            .set("xp", (i * 150) as i64)
            .set("guild", if i % 3 == 0 { "Dragons" } else if i % 3 == 1 { "Phoenix" } else { "Titans" })
            .set("active", true)
            .set("stats", serde_json::json!({
                "kills": i * 5,
                "deaths": i * 2,
                "assists": i * 3
            }));

        players.insert(player).await?;
    }
    let elapsed = start.elapsed();
    println!("✅ Inseridos 1000 players em {:?}", elapsed);
    println!("📈 Throughput: {:.2} docs/s\n", 1000.0 / elapsed.as_secs_f64());

    // 3. Queries com cache
    println!("🔍 3. Queries com Cache Inteligente");

    // Primeira query (cold cache)
    let start = Instant::now();
    let high_level = players
        .query("SELECT * FROM players WHERE level > @min_level")
        .param("min_level", 80)
        .execute()
        .await?;
    let cold_time = start.elapsed();
    println!("❄️  Cold cache: {:?} - {} resultados", cold_time, high_level.len());

    // Segunda query (hot cache)
    let start = Instant::now();
    let high_level = players
        .query("SELECT * FROM players WHERE level > @min_level")
        .param("min_level", 80)
        .execute()
        .await?;
    let hot_time = start.elapsed();
    println!("🔥 Hot cache: {:?} - {} resultados", hot_time, high_level.len());
    println!("⚡ Speedup: {:.2}x mais rápido\n", cold_time.as_secs_f64() / hot_time.as_secs_f64());

    // 4. Agregações complexas
    println!("📊 4. Agregações e Análises");
    let guild_stats = players
        .query("SELECT guild, COUNT(*) as members, AVG(level) as avg_level FROM players GROUP BY guild")
        .execute()
        .await?;

    println!("Guild Statistics:");
    for stat in guild_stats {
        println!("  {} - {} members, avg level: {:.1}",
            stat["guild"],
            stat["members"],
            stat["avg_level"]
        );
    }
    println!();

    // 5. Vector Search (se disponível)
    #[cfg(feature = "vector-search")]
    {
        println!("🎯 5. Vector Search - Similaridade");

        // Criar embedding de exemplo
        let query_embedding = vec![0.1, 0.2, 0.3, 0.4, 0.5];

        let similar = players
            .vector_search("embedding", &query_embedding, 10)
            .await?;

        println!("✅ Encontrados {} jogadores similares\n", similar.len());
    }

    // 6. Telemetria e métricas
    println!("📈 6. Métricas de Performance");
    let diagnostics = client.diagnostics().await;
    println!("Diagnósticos:");
    println!("  Latência média: {:?}", diagnostics.avg_latency);
    println!("  Total de requests: {}", diagnostics.total_requests);
    println!("  Cache hit rate: {:.1}%", diagnostics.cache_hit_rate * 100.0);
    println!("  Compressão: {:.1}% economia", diagnostics.compression_ratio * 100.0);
    println!();

    // 7. Transações e consistência
    println!("💰 7. Transações ACID");
    let start = Instant::now();

    // Simular transferência de XP entre players
    let player1 = players
        .query("SELECT * FROM players WHERE playerId = @id")
        .param("id", "player_0")
        .execute()
        .await?
        .first()
        .cloned()
        .expect("Player not found");

    let new_xp = player1["xp"].as_i64().unwrap() + 1000;
    players
        .update("player_0", Document::new().set("xp", new_xp))
        .await?;

    println!("✅ Transação concluída em {:?}\n", start.elapsed());

    // 8. Limpeza e otimização
    println!("🧹 8. Manutenção e Otimização");
    db.optimize().await?;
    println!("✅ Database otimizado");

    let stats = db.stats().await?;
    println!("Estatísticas finais:");
    println!("  Collections: {}", stats.collection_count);
    println!("  Documentos: {}", stats.document_count);
    println!("  Storage: {:.2} MB", stats.storage_size_mb);
    println!("  Index size: {:.2} MB\n", stats.index_size_mb);

    println!("🎉 Exemplo concluído com sucesso!");

    Ok(())
}
