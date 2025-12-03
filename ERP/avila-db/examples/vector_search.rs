//! Vector search example for AI/RAG applications
//!
//! Run with: cargo run --example vector_search

use aviladb::{AvilaClient, Document};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🔍 AvilaDB Vector Search Example\n");

    // Connect to AvilaDB
    let client = AvilaClient::connect("http://localhost:8000").await?;
    let db = client.database("aidb").await?;
    let memories = db.collection("chat_memory").await?;

    println!("✓ Connected to AvilaDB");
    println!("✓ Database: aidb");
    println!("✓ Collection: chat_memory\n");

    // Create vector index (HNSW)
    println!("Creating vector index (1536 dimensions, cosine similarity)...");
    memories.create_vector_index("embedding", 1536, "cosine").await?;
    println!("✓ Vector index created\n");

    // Insert chat memories with embeddings
    println!("Inserting chat memories...");

    let memories_data = vec![
        (
            "Tell me about quantum physics",
            vec![0.1, 0.2, 0.3, /* ... 1536 dims */],
        ),
        (
            "What is machine learning?",
            vec![0.15, 0.18, 0.29, /* ... 1536 dims */],
        ),
        (
            "Explain general relativity",
            vec![0.12, 0.19, 0.31, /* ... 1536 dims */],
        ),
    ];

    for (message, embedding) in memories_data {
        let memory = Document::new()
            .set("userId", "user123")
            .set("message", message)
            .set("embedding", vec![0.0; 1536]) // Placeholder
            .set("timestamp", chrono::Utc::now().to_rfc3339());

        memories.insert(memory).await?;
        println!("  ✓ Inserted: {}", message);
    }
    println!();

    // Perform semantic search
    println!("Performing semantic search for 'physics concepts'...");
    let query_embedding = vec![0.11, 0.21, 0.32, /* ... 1536 dims */];

    let similar = memories
        .vector_search("embedding", vec![0.0; 1536]).await // Placeholder
        .top_k(3)
        .execute()
        .await?;

    println!("✓ Found {} similar memories:\n", similar.len());

    for (i, doc) in similar.iter().enumerate() {
        let message: String = doc.get("message").unwrap_or_default();
        println!("  {}. {}", i + 1, message);
        println!("     (similarity score would be shown here)");
    }

    println!("\n🎉 Vector search example complete!");
    println!("\n💡 Use cases:");
    println!("   - AI chat with memory");
    println!("   - Semantic document search");
    println!("   - Recommendation systems");
    println!("   - Content similarity detection");

    Ok(())
}
