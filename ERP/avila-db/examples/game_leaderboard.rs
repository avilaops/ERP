//! Game Leaderboard Example
//!
//! This example demonstrates:
//! - Creating a global game leaderboard
//! - Player profiles with stats
//! - Real-time ranking queries
//! - Batch updates for match results
//! - Regional leaderboards (Brazil, LATAM, Global)
//!
//! Run with: cargo run --example game_leaderboard

use aviladb::{AvilaClient, Document};
use serde_json::json;
use rand::Rng;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🎮 AvilaDB Game Leaderboard Example\n");

    // 1. Connect to AvilaDB
    println!("📡 Connecting to AvilaDB...");
    let client = AvilaClient::connect("http://localhost:8000").await?;
    println!("✅ Connected!\n");

    // 2. Create game database
    println!("🗄️  Creating database 'gamedb'...");
    let db = client.database("gamedb").await?;
    println!("✅ Database ready!\n");

    // 3. Create players collection
    println!("📦 Creating collection 'players'...");
    let players = db.collection("players").await?;
    println!("✅ Players collection ready!\n");

    // 4. Create matches collection
    println!("📦 Creating collection 'matches'...");
    let matches = db.collection("matches").await?;
    println!("✅ Matches collection ready!\n");

    // 5. Insert player profiles
    println!("👥 Creating player profiles...");

    let player_data = vec![
        ("player001", "CoolGamer", "São Paulo", "Brazil", 1500),
        ("player002", "ProGamer99", "Rio de Janeiro", "Brazil", 2100),
        ("player003", "SkillMaster", "Buenos Aires", "Argentina", 1850),
        ("player004", "FastShooter", "Santiago", "Chile", 1920),
        ("player005", "ElitePro", "Brasília", "Brazil", 2400),
        ("player006", "NinjaKing", "Lima", "Peru", 1650),
        ("player007", "SpeedDemon", "Bogotá", "Colombia", 1780),
        ("player008", "ChampionX", "Belo Horizonte", "Brazil", 2200),
        ("player009", "MegaPlayer", "Montevideo", "Uruguay", 1900),
        ("player010", "SuperStar", "Curitiba", "Brazil", 2050),
    ];

    let mut player_docs = Vec::new();
    for (id, username, city, country, elo) in player_data {
        let player = Document::new()
            .set("playerId", id)
            .set("username", username)
            .set("city", city)
            .set("country", country)
            .set("region", if country == "Brazil" { "BR" } else { "LATAM" })
            .set("elo", elo)
            .set("wins", 0)
            .set("losses", 0)
            .set("draws", 0)
            .set("totalMatches", 0)
            .set("level", 1)
            .set("xp", 0)
            .set("achievements", Vec::<String>::new())
            .set("createdAt", chrono::Utc::now().timestamp());

        player_docs.push(player);
    }

    let results = players.insert_batch(player_docs).await?;
    println!("✅ Created {} players\n", results.len());

    // 6. Simulate matches and update stats
    println!("⚔️  Simulating matches...");

    let mut rng = rand::thread_rng();
    let player_ids = vec![
        "player001", "player002", "player003", "player004", "player005",
        "player006", "player007", "player008", "player009", "player010",
    ];

    for match_num in 1..=20 {
        // Random match between two players
        let p1_idx = rng.gen_range(0..player_ids.len());
        let mut p2_idx = rng.gen_range(0..player_ids.len());
        while p2_idx == p1_idx {
            p2_idx = rng.gen_range(0..player_ids.len());
        }

        let player1_id = player_ids[p1_idx];
        let player2_id = player_ids[p2_idx];

        // Random outcome (0 = p1 wins, 1 = draw, 2 = p2 wins)
        let outcome = rng.gen_range(0..3);

        let (winner_id, loser_id, result) = match outcome {
            0 => (player1_id, player2_id, "win"),
            1 => (player1_id, player2_id, "draw"),
            _ => (player2_id, player1_id, "win"),
        };

        // Store match
        let match_doc = Document::new()
            .set("matchId", format!("match{:03}", match_num))
            .set("player1", player1_id)
            .set("player2", player2_id)
            .set("winner", if outcome == 1 { "draw" } else { winner_id })
            .set("duration", rng.gen_range(300..1800))
            .set("timestamp", chrono::Utc::now().timestamp());

        matches.insert(match_doc).await?;

        // Update player stats
        if outcome == 0 {
            // Player 1 wins
            players.update()
                .set("wins", "wins + 1")
                .set("totalMatches", "totalMatches + 1")
                .set("elo", "elo + 25")
                .set("xp", "xp + 100")
                .where_eq("playerId", player1_id)
                .execute()
                .await?;

            players.update()
                .set("losses", "losses + 1")
                .set("totalMatches", "totalMatches + 1")
                .set("elo", "elo - 15")
                .set("xp", "xp + 25")
                .where_eq("playerId", player2_id)
                .execute()
                .await?;
        } else if outcome == 1 {
            // Draw
            for pid in [player1_id, player2_id] {
                players.update()
                    .set("draws", "draws + 1")
                    .set("totalMatches", "totalMatches + 1")
                    .set("xp", "xp + 50")
                    .where_eq("playerId", pid)
                    .execute()
                    .await?;
            }
        } else {
            // Player 2 wins
            players.update()
                .set("wins", "wins + 1")
                .set("totalMatches", "totalMatches + 1")
                .set("elo", "elo + 25")
                .set("xp", "xp + 100")
                .where_eq("playerId", player2_id)
                .execute()
                .await?;

            players.update()
                .set("losses", "losses + 1")
                .set("totalMatches", "totalMatches + 1")
                .set("elo", "elo - 15")
                .set("xp", "xp + 25")
                .where_eq("playerId", player1_id)
                .execute()
                .await?;
        }

        print!(".");
        if match_num % 5 == 0 {
            println!(" {} matches", match_num);
        }
    }
    println!("\n✅ Simulated 20 matches\n");

    // 7. Query Global Leaderboard (Top 10)
    println!("🏆 GLOBAL LEADERBOARD (Top 10)");
    println!("═══════════════════════════════════════════════════\n");

    let global_leaderboard = players
        .query("SELECT * FROM players ORDER BY elo DESC LIMIT 10")
        .execute()
        .await?;

    for (rank, doc) in global_leaderboard.documents.iter().enumerate() {
        let username: String = doc.get("username")?;
        let country: String = doc.get("country")?;
        let elo: i32 = doc.get("elo")?;
        let wins: i32 = doc.get("wins")?;
        let losses: i32 = doc.get("losses")?;
        let total: i32 = doc.get("totalMatches")?;

        let win_rate = if total > 0 {
            (wins as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        println!("#{:<2} 🏅 {:<15} | {} | ELO: {:>4} | W/L: {}/{} ({:.1}%)",
            rank + 1, username, country, elo, wins, losses, win_rate);
    }
    println!();

    // 8. Query Brazil Leaderboard
    println!("🇧🇷 BRAZIL LEADERBOARD (Top 5)");
    println!("═══════════════════════════════════════════════════\n");

    let brazil_leaderboard = players
        .query("SELECT * FROM players WHERE region = @region ORDER BY elo DESC LIMIT 5")
        .param("region", "BR")
        .execute()
        .await?;

    for (rank, doc) in brazil_leaderboard.documents.iter().enumerate() {
        let username: String = doc.get("username")?;
        let city: String = doc.get("city")?;
        let elo: i32 = doc.get("elo")?;

        println!("#{} 🥇 {} from {} - ELO: {}",
            rank + 1, username, city, elo);
    }
    println!();

    // 9. Query Player Stats
    println!("📊 PLAYER PROFILE: ProGamer99");
    println!("═══════════════════════════════════════════════════\n");

    let player_profile = players
        .query("SELECT * FROM players WHERE username = @username")
        .param("username", "ProGamer99")
        .execute()
        .await?;

    if let Some(doc) = player_profile.documents.first() {
        let username: String = doc.get("username")?;
        let city: String = doc.get("city")?;
        let country: String = doc.get("country")?;
        let elo: i32 = doc.get("elo")?;
        let wins: i32 = doc.get("wins")?;
        let losses: i32 = doc.get("losses")?;
        let draws: i32 = doc.get("draws")?;
        let total: i32 = doc.get("totalMatches")?;
        let level: i32 = doc.get("level")?;
        let xp: i32 = doc.get("xp")?;

        println!("Player: {} (Level {})", username, level);
        println!("Location: {}, {}", city, country);
        println!("ELO Rating: {}", elo);
        println!("Total Matches: {}", total);
        println!("Record: {}W / {}L / {}D", wins, losses, draws);
        let win_rate = if total > 0 {
            (wins as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        println!("Win Rate: {:.1}%", win_rate);
        println!("Experience: {} XP", xp);
    }
    println!();

    // 10. Recent Matches
    println!("🎯 RECENT MATCHES (Last 5)");
    println!("═══════════════════════════════════════════════════\n");

    let recent_matches = matches
        .query("SELECT * FROM matches ORDER BY timestamp DESC LIMIT 5")
        .execute()
        .await?;

    for doc in recent_matches.documents.iter() {
        let match_id: String = doc.get("matchId")?;
        let player1: String = doc.get("player1")?;
        let player2: String = doc.get("player2")?;
        let winner: String = doc.get("winner")?;
        let duration: i32 = doc.get("duration")?;

        let result = if winner == "draw" {
            "DRAW".to_string()
        } else {
            format!("Winner: {}", winner)
        };

        println!("{}: {} vs {} | {} | Duration: {}s",
            match_id, player1, player2, result, duration);
    }
    println!();

    // 11. Statistics
    println!("📈 GAME STATISTICS");
    println!("═══════════════════════════════════════════════════\n");

    let stats = client.stats().await;
    println!("Total Players: {}", global_leaderboard.total_count);
    println!("Total Matches: {}", recent_matches.total_count);
    println!("Database Latency: {}ms (avg)", stats.avg_latency_ms);
    println!("Compression Ratio: {:.2}x", global_leaderboard.compression_ratio);
    println!("Cache Hit Rate: {:.1}%", stats.cache_hit_rate * 100.0);

    println!("\n✅ Game leaderboard example completed!");
    println!("\n💡 Next steps:");
    println!("  - Add real-time leaderboard updates with WebSockets");
    println!("  - Implement seasonal rankings");
    println!("  - Add achievement tracking");
    println!("  - Create matchmaking based on ELO");
    println!("  - Add player inventory and items");

    Ok(())
}
