//! Basic CRUD operations example
//!
//! This example demonstrates:
//! - Connecting to AvilaDB
//! - Creating databases and collections
//! - Inserting documents
//! - Querying with filters
//! - Updating documents
//! - Deleting documents
//!
//! Run with: cargo run --example basic_crud

use aviladb::{AvilaClient, Document};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 AvilaDB Basic CRUD Example\n");

    // 1. Connect to AvilaDB
    println!("📡 Connecting to AvilaDB...");
    let client = AvilaClient::connect("http://localhost:8000").await?;
    println!("✅ Connected!\n");

    // 2. Create database
    println!("🗄️  Creating database 'testdb'...");
    let db = client.database("testdb").await?;
    println!("✅ Database ready!\n");

    // 3. Create collection
    println!("📦 Creating collection 'users'...");
    let users = db.collection("users").await?;
    println!("✅ Collection ready!\n");

    // 4. INSERT - Create new documents
    println!("📝 Inserting documents...");

    let user1 = Document::new()
        .set("userId", "user001")
        .set("name", "João Silva")
        .set("email", "joao@example.com")
        .set("age", 28)
        .set("city", "São Paulo")
        .set("active", true)
        .set("tags", vec!["developer", "rust", "brazil"]);

    let result1 = users.insert(user1).await?;
    println!("✅ Inserted user: {} (size: {} bytes)", result1.id, result1.size_bytes);

    let user2 = Document::new()
        .set("userId", "user002")
        .set("name", "Maria Santos")
        .set("email", "maria@example.com")
        .set("age", 32)
        .set("city", "Rio de Janeiro")
        .set("active", true)
        .set("tags", vec!["designer", "ui-ux"]);

    let result2 = users.insert(user2).await?;
    println!("✅ Inserted user: {} (size: {} bytes)", result2.id, result2.size_bytes);

    let user3 = Document::new()
        .set("userId", "user003")
        .set("name", "Pedro Costa")
        .set("email", "pedro@example.com")
        .set("age", 25)
        .set("city", "São Paulo")
        .set("active", false)
        .set("tags", vec!["student", "learning-rust"]);

    let result3 = users.insert(user3).await?;
    println!("✅ Inserted user: {} (size: {} bytes)\n", result3.id, result3.size_bytes);

    // 5. BATCH INSERT - Insert multiple documents at once
    println!("📦 Batch inserting documents...");

    let batch_users = vec![
        Document::new()
            .set("userId", "user004")
            .set("name", "Ana Lima")
            .set("email", "ana@example.com")
            .set("age", 30)
            .set("city", "Brasília")
            .set("active", true),
        Document::new()
            .set("userId", "user005")
            .set("name", "Carlos Rocha")
            .set("email", "carlos@example.com")
            .set("age", 35)
            .set("city", "Belo Horizonte")
            .set("active", true),
    ];

    let batch_results = users.insert_batch(batch_users).await?;
    println!("✅ Batch inserted {} users\n", batch_results.len());

    // 6. GET - Retrieve a specific document
    println!("🔍 Getting user by ID...");
    if let Some(user) = users.get(&result1.id).await? {
        let name: String = user.get("name")?;
        let email: String = user.get("email")?;
        println!("✅ Found user: {} ({})\n", name, email);
    }

    // 7. QUERY - Filter and search documents
    println!("🔎 Querying users...");

    // Query active users
    let active_users = users
        .query("SELECT * FROM users WHERE active = @active")
        .param("active", true)
        .execute()
        .await?;

    println!("✅ Found {} active users:", active_users.documents.len());
    for doc in &active_users.documents {
        let name: String = doc.get("name")?;
        let city: String = doc.get("city")?;
        println!("   - {} from {}", name, city);
    }
    println!();

    // Query users from São Paulo
    let sp_users = users
        .query("SELECT * FROM users WHERE city = @city")
        .param("city", "São Paulo")
        .execute()
        .await?;

    println!("✅ Found {} users from São Paulo:", sp_users.documents.len());
    for doc in &sp_users.documents {
        let name: String = doc.get("name")?;
        let age: i32 = doc.get("age")?;
        println!("   - {}, {} years old", name, age);
    }
    println!();

    // Query users older than 30
    let older_users = users
        .query("SELECT * FROM users WHERE age > @min_age")
        .param("min_age", 30)
        .execute()
        .await?;

    println!("✅ Found {} users older than 30\n", older_users.documents.len());

    // 8. UPDATE - Modify existing documents
    println!("✏️  Updating user...");

    let updated_count = users.update()
        .set("city", "Campinas")
        .set("active", true)
        .where_eq("userId", "user003")
        .execute()
        .await?;

    println!("✅ Updated {} user(s)\n", updated_count);

    // Verify update
    let updated_user = users
        .query("SELECT * FROM users WHERE userId = @id")
        .param("id", "user003")
        .execute()
        .await?;

    if let Some(doc) = updated_user.documents.first() {
        let name: String = doc.get("name")?;
        let city: String = doc.get("city")?;
        let active: bool = doc.get("active")?;
        println!("🔍 Verified: {} is now in {} (active: {})\n", name, city, active);
    }

    // 9. DELETE - Remove documents
    println!("🗑️  Deleting user...");

    let deleted_count = users.delete()
        .where_eq("userId", "user005")
        .execute()
        .await?;

    println!("✅ Deleted {} user(s)\n", deleted_count);

    // 10. Final query to see remaining users
    println!("📊 Final count of users...");
    let all_users = users
        .query("SELECT * FROM users")
        .execute()
        .await?;

    println!("✅ Total users in collection: {}", all_users.documents.len());
    println!("   Query latency: {}ms", all_users.latency_ms);
    println!("   Compression ratio: {:.2}x\n", all_users.compression_ratio);

    // 11. Get client statistics
    let stats = client.stats().await;
    println!("📈 Client Statistics:");
    println!("   HTTP requests: {}", stats.http_requests);
    println!("   Successes: {}", stats.http_successes);
    println!("   Failures: {}", stats.http_failures);
    println!("   Avg latency: {}ms", stats.avg_latency_ms);
    println!("   Cache hits: {}", stats.cache_hits);
    println!("   Cache misses: {}", stats.cache_misses);
    println!("   Cache hit rate: {:.2}%", stats.cache_hit_rate * 100.0);

    println!("\n✅ CRUD operations completed successfully!");
    Ok(())
}
