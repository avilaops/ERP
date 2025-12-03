//! Basic AvilaDB operations example
//!
//! Run with: cargo run --example basic

use aviladb::{AvilaClient, Document};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🏛️ AvilaDB Basic Example\n");

    // Connect to AvilaDB
    println!("Connecting to AvilaDB...");
    let client = AvilaClient::connect("http://localhost:8000").await?;
    println!("✓ Connected!\n");

    // Get database and collection
    let db = client.database("gamedb").await?;
    let players = db.collection("players").await?;
    println!("✓ Database: gamedb");
    println!("✓ Collection: players\n");

    // Insert a player
    println!("Inserting player...");
    let player = Document::new()
        .set("userId", "player123")
        .set("username", "CoolGamer")
        .set("level", 42)
        .set("inventory", vec!["sword", "shield", "potion"])
        .set("stats", serde_json::json!({
            "hp": 100,
            "mp": 50,
            "attack": 25,
            "defense": 15
        }));

    let result = players.insert(player).await?;
    println!("✓ Inserted document ID: {}", result.id);
    println!("  Size: {} bytes", result.size_bytes);
    println!("  Compression ratio: {:.2}x", result.compression_ratio);
    println!("  Latency: {} ms\n", result.latency_ms);

    // Insert batch of players
    println!("Inserting batch of players...");
    let batch = vec![
        Document::new()
            .set("userId", "player456")
            .set("username", "ProGamer")
            .set("level", 55),
        Document::new()
            .set("userId", "player789")
            .set("username", "NewbieGamer")
            .set("level", 10),
    ];

    let batch_results = players.insert_batch(batch).await?;
    println!("✓ Inserted {} documents\n", batch_results.len());

    // Query high-level players
    println!("Querying high-level players (level > 40)...");
    let high_level = players
        .query("SELECT * FROM players WHERE level > @min_level")
        .param("min_level", 40)
        .execute()
        .await?;

    println!("✓ Found {} high-level players", high_level.total_count);
    println!("  Query latency: {} ms\n", high_level.latency_ms);

    // Update player level
    println!("Updating player level...");
    let updated = players
        .update()
        .await
        .set("level", 43)
        .set("lastPlayed", chrono::Utc::now().to_rfc3339())
        .where_eq("userId", "player123")
        .execute()
        .await?;

    println!("✓ Updated {} documents\n", updated);

    // Delete a player
    println!("Deleting player...");
    let deleted = players
        .delete()
        .await
        .where_eq("userId", "player789")
        .execute()
        .await?;

    println!("✓ Deleted {} documents\n", deleted);

    println!("🎉 Example complete!");

    Ok(())
}
