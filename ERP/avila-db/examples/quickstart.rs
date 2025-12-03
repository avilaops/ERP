//! Quickstart example - Basic operations with AvilaDB
//!
//! This example demonstrates:
//! - Connecting to AvilaDB
//! - Creating a database and collection
//! - Inserting documents
//! - Querying data
//! - Updating and deleting documents

use aviladb::{AvilaClient, Document};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    println!("🗄️  AvilaDB - Quickstart Example\n");

    // 1. Connect to AvilaDB
    println!("📡 Connecting to AvilaDB...");
    let client = AvilaClient::connect("http://localhost:8000").await?;
    println!("✅ Connected!\n");

    // 2. Get database handle
    let db = client.database("quickstart_db").await?;
    println!("📂 Database: quickstart_db");

    // 3. Get collection handle
    let users = db.collection("users").await?;
    println!("📋 Collection: users\n");

    // 4. Insert document (up to 4 MB!)
    println!("➕ Inserting user...");
    let user = Document::new()
        .set("userId", "user123")
        .set("name", "João Silva")
        .set("email", "joao@example.com")
        .set("level", 42)
        .set("active", true)
        .set("tags", vec!["developer", "rust", "brazil"]);

    let result = users.insert(user).await?;
    println!("✅ Inserted document: {}", result.id);
    println!("   Size: {} bytes", result.size_bytes);
    println!("   Compression: {:.2}x\n", result.compression_ratio);

    // 5. Query documents
    println!("🔍 Querying users...");
    let active_users = users
        .query("SELECT * FROM users WHERE active = true")
        .execute()
        .await?;

    println!("✅ Found {} active users", active_users.documents.len());
    for doc in &active_users.documents {
        let name: String = doc.get("name")?;
        let level: i32 = doc.get("level")?;
        println!("   - {}: Level {}", name, level);
    }
    println!();

    // 6. Query with parameters (prevents injection)
    println!("🔍 Query with parameters...");
    let high_level_users = users
        .query("SELECT * FROM users WHERE level > @min_level")
        .param("min_level", 40)
        .execute()
        .await?;

    println!("✅ Found {} high-level users\n", high_level_users.documents.len());

    // 7. Update document
    println!("✏️  Updating user...");
    users
        .update()
        .set("level", 43)
        .set("updated_at", chrono::Utc::now())
        .where_eq("userId", "user123")
        .execute()
        .await?;
    println!("✅ User updated!\n");

    // 8. Delete document
    println!("🗑️  Deleting user...");
    users
        .delete()
        .where_eq("userId", "user123")
        .execute()
        .await?;
    println!("✅ User deleted!\n");

    println!("🎉 Quickstart complete!");
    println!("📚 Next steps:");
    println!("   - Try vector search: cargo run --example vector_search");
    println!("   - Build a game backend: cargo run --example game_backend");
    println!("   - Create AI chat: cargo run --example ai_chat_rag");

    Ok(())
}
