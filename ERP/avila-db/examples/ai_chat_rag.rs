//! AI Chat with RAG (Retrieval-Augmented Generation) Example
//!
//! This example demonstrates:
//! - Storing chat history with vector embeddings
//! - Semantic search for context retrieval
//! - Multi-user isolation (partition keys)
//! - Native vector search (no external services!)

use aviladb::{AvilaClient, Document};
use chrono::Utc;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    println!("🤖 AvilaDB - AI Chat with RAG Example\n");

    // Connect to AvilaDB
    let client = AvilaClient::connect("http://localhost:8000").await?;
    let db = client.database("aidb").await?;

    println!("=== 1. Create Vector Index ===\n");

    let memories = db.collection("chat_memory").await?;

    // Create HNSW vector index (native in AvilaDB!)
    memories
        .create_vector_index("embedding", 1536, "cosine")
        .await?;

    println!("✅ Vector index created (1536 dimensions, cosine similarity)");
    println!("   No external services needed! (vs Pinecone/Weaviate)");
    println!();

    println!("=== 2. Store Chat Messages with Embeddings ===\n");

    // Simulate storing chat messages with embeddings
    let messages = vec![
        (
            "What is AvilaDB?",
            "AvilaDB is a distributed NoSQL database optimized for Brazil with 5-10ms latency",
            generate_fake_embedding(1536),
        ),
        (
            "How does compression work?",
            "AvilaDB uses LZ4 and Zstd compression automatically via avila-compress",
            generate_fake_embedding(1536),
        ),
        (
            "What about vector search?",
            "Native HNSW index built-in, no external services required",
            generate_fake_embedding(1536),
        ),
        (
            "Tell me about pricing",
            "R$ 0,50 per 1M operations, 40-60% cheaper than AWS/Azure",
            generate_fake_embedding(1536),
        ),
    ];

    for (user_msg, ai_response, embedding) in messages {
        let memory = Document::new()
            .set("userId", "user123")
            .set("sessionId", "session-abc")
            .set("userMessage", user_msg)
            .set("aiResponse", ai_response)
            .set("embedding", embedding)
            .set("timestamp", Utc::now());

        memories.insert(memory).await?;
        println!("💬 Stored: \"{}\"", user_msg);
    }
    println!();

    println!("=== 3. Semantic Search (RAG) ===\n");

    // User asks a question
    let user_query = "How much does it cost?";
    let query_embedding = generate_fake_embedding(1536);

    println!("👤 User: \"{}\"", user_query);
    println!("🔍 Searching for similar context...\n");

    // Vector search to find relevant context
    let similar = memories
        .vector_search("embedding", query_embedding)
        .top_k(2) // Retrieve top 2 most similar
        .execute()
        .await?;

    println!("📚 Retrieved Context:");
    for (i, doc) in similar.documents.iter().enumerate() {
        let msg: String = doc.get("userMessage")?;
        let response: String = doc.get("aiResponse")?;
        let score = doc.similarity_score();

        println!("   {}. {} (similarity: {:.3})", i + 1, msg, score);
        println!("      → {}", response);
    }
    println!();

    println!("=== 4. Multi-User Isolation ===\n");

    // Each user has their own context (partition key: userId)
    let user1_memories = memories
        .query("SELECT * FROM chat_memory WHERE userId = @user")
        .param("user", "user123")
        .execute()
        .await?;

    println!("✅ User123 has {} memories", user1_memories.documents.len());
    println!("   ⚡ Low-latency retrieval (partition-aware)");
    println!();

    println!("=== 5. Chat Session Management ===\n");

    let sessions = db.collection("chat_sessions").await?;

    // Create chat session
    let session = Document::new()
        .set("sessionId", "session-abc")
        .set("userId", "user123")
        .set("title", "AvilaDB Questions")
        .set("messageCount", 4)
        .set("model", "gpt-4")
        .set("created_at", Utc::now())
        .set("last_activity", Utc::now());

    sessions.insert(session).await?;
    println!("✅ Chat session created");
    println!();

    println!("🎉 AI Chat with RAG Complete!\n");
    println!("🏛️  Key Benefits:");
    println!("   ✅ Native vector search (HNSW index)");
    println!("   ✅ No external services (Pinecone/Weaviate)");
    println!("   ✅ Low-cost embeddings storage");
    println!("   ✅ Multi-user isolation (partition keys)");
    println!("   ✅ 5-10ms latency in Brazil");
    println!();
    println!("💡 RAG Pattern:");
    println!("   1. User asks question");
    println!("   2. Generate embedding for question");
    println!("   3. Vector search finds similar context");
    println!("   4. Send context + question to LLM");
    println!("   5. Get contextual response!");

    Ok(())
}

/// Generate fake embedding for demo purposes
/// In production, use OpenAI API or local model
fn generate_fake_embedding(dims: usize) -> Vec<f32> {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..dims).map(|_| rng.gen_range(-1.0..1.0)).collect()
}
