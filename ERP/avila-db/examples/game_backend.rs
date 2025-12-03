//! Game Backend Example - Real-time multiplayer game with AvilaDB
//!
//! This example demonstrates AvilaDB best practices for game development:
//! - Player profiles with inventory (embedded data)
//! - Leaderboards with rankings
//! - Session management
//! - Matchmaking queues
//! - 5-10ms latency in Brazil 🇧🇷

use aviladb::{AvilaClient, Document};
use chrono::Utc;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    println!("🎮 AvilaDB - Game Backend Example\n");

    // Connect to AvilaDB
    let client = AvilaClient::connect("http://localhost:8000").await?;
    let db = client.database("gamedb").await?;

    println!("=== 1. Player Profiles ===\n");

    // Create players collection
    let players = db.collection("players").await?;

    // Insert player with embedded inventory (all data in one document!)
    let player = Document::new()
        .set("userId", "player123")
        .set("username", "CoolGamer")
        .set("level", 42)
        .set("xp", 125_000)
        .set("coins", 5000)
        .set("gems", 150)
        .set("inventory", json!({
            "weapons": ["sword", "bow", "magic_staff"],
            "armor": ["helmet", "chestplate", "boots"],
            "potions": {"health": 10, "mana": 5}
        }))
        .set("stats", json!({
            "hp": 100,
            "mp": 50,
            "attack": 25,
            "defense": 15,
            "speed": 20
        }))
        .set("achievements", vec!["first_kill", "level_10", "arena_champion"])
        .set("created_at", Utc::now())
        .set("last_login", Utc::now());

    let result = players.insert(player).await?;
    println!("✅ Player created: {}", result.id);
    println!("   Compression: {:.2}x (saves bandwidth!)", result.compression_ratio);
    println!();

    println!("=== 2. Leaderboards ===\n");

    let leaderboard = db.collection("leaderboard").await?;

    // Insert multiple players for leaderboard
    for (username, level, xp) in [
        ("CoolGamer", 42, 125_000),
        ("ProPlayer", 50, 200_000),
        ("Noob123", 5, 1_000),
        ("BrazilianAce", 48, 180_000),
    ] {
        leaderboard
            .insert(
                Document::new()
                    .set("username", username)
                    .set("level", level)
                    .set("xp", xp)
                    .set("region", "br")
                    .set("updated_at", Utc::now()),
            )
            .await?;
    }

    // Query top players (low latency!)
    let top_players = leaderboard
        .query("SELECT * FROM leaderboard ORDER BY xp DESC LIMIT 3")
        .execute()
        .await?;

    println!("🏆 Top 3 Players:");
    for (rank, doc) in top_players.documents.iter().enumerate() {
        let username: String = doc.get("username")?;
        let xp: i32 = doc.get("xp")?;
        println!("   {}. {} - {} XP", rank + 1, username, xp);
    }
    println!("   ⚡ Latency: {} ms (Brazil optimized!)", top_players.latency_ms);
    println!();

    println!("=== 3. Game Sessions ===\n");

    let sessions = db.collection("sessions").await?;

    // Create game session
    let session = Document::new()
        .set("sessionId", "session-abc123")
        .set("gameMode", "battle_royale")
        .set("map", "island_paradise")
        .set("players", vec!["player123", "player456", "player789"])
        .set("maxPlayers", 100)
        .set("status", "waiting")
        .set("region", "sa-east-1") // São Paulo
        .set("created_at", Utc::now());

    sessions.insert(session).await?;
    println!("✅ Game session created");
    println!();

    println!("=== 4. Matchmaking Queue ===\n");

    let queue = db.collection("matchmaking").await?;

    // Add player to queue
    let queue_entry = Document::new()
        .set("userId", "player123")
        .set("level", 42)
        .set("region", "br")
        .set("gameMode", "ranked")
        .set("queueTime", Utc::now());

    queue.insert(queue_entry).await?;

    // Find similar level players (matchmaking logic)
    let matches = queue
        .query("SELECT * FROM matchmaking WHERE level BETWEEN @min AND @max AND region = @region")
        .param("min", 40)
        .param("max", 45)
        .param("region", "br")
        .execute()
        .await?;

    println!("🎯 Found {} players for matchmaking", matches.documents.len());
    println!();

    println!("=== 5. Real-time Stats ===\n");

    // Update player stats in real-time
    players
        .update()
        .set("kills", 150)
        .set("deaths", 50)
        .set("kd_ratio", 3.0)
        .set("wins", 75)
        .set("win_rate", 0.75)
        .where_eq("userId", "player123")
        .execute()
        .await?;

    println!("✅ Player stats updated");
    println!();

    println!("🎉 Game Backend Example Complete!\n");
    println!("🏛️  Key Benefits:");
    println!("   ✅ 5-10ms latency in Brazil (vs 80-120ms AWS)");
    println!("   ✅ 4 MB documents (store full inventory in one doc)");
    println!("   ✅ Automatic compression (saves bandwidth)");
    println!("   ✅ Multi-region writes FREE");
    println!("   ✅ 40-60% cheaper than DynamoDB");

    Ok(())
}
