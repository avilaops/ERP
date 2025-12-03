//! RAG (Retrieval-Augmented Generation) com AvilaDB
//!
//! Sistema de chat com IA usando:
//! - Vector search para busca semântica
//! - Cache de embeddings
//! - Armazenamento de conversas

use aviladb::{AvilaClient, Document};
use serde::{Deserialize, Serialize};
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize)]
struct Message {
    role: String,
    content: String,
    embedding: Option<Vec<f32>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ConversationContext {
    user_id: String,
    messages: Vec<Message>,
    metadata: serde_json::Value,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🤖 AI Chat with RAG - AvilaDB\n");

    let client = AvilaClient::connect("http://localhost:8000").await?;
    let db = client.database("ai_chat");

    // Collections
    let conversations = db.collection("conversations");
    let knowledge_base = db.collection("knowledge_base");
    let embeddings_cache = db.collection("embeddings_cache");

    println!("📚 1. Carregando knowledge base...");

    // Simular knowledge base com embeddings
    let knowledge = vec![
        ("AvilaDB é um banco de dados NoSQL distribuído globalmente", vec![0.1, 0.2, 0.3, 0.4, 0.5]),
        ("Otimizado para Brasil e LATAM com latência <10ms", vec![0.2, 0.3, 0.4, 0.5, 0.6]),
        ("Suporta vector search nativo para RAG", vec![0.3, 0.4, 0.5, 0.6, 0.7]),
        ("Cache inteligente e compressão automática", vec![0.4, 0.5, 0.6, 0.7, 0.8]),
        ("APIs simples e intuitivas em Rust, Python, Node.js", vec![0.5, 0.6, 0.7, 0.8, 0.9]),
    ];

    for (i, (text, embedding)) in knowledge.iter().enumerate() {
        let doc = Document::new()
            .set("id", format!("kb_{}", i))
            .set("text", text.to_string())
            .set("embedding", serde_json::to_value(embedding)?)
            .set("category", "documentation")
            .set("language", "pt-BR");

        knowledge_base.insert(doc).await?;
    }

    println!("✅ {} documentos carregados\n", knowledge.len());

    // Simular conversa
    println!("💬 2. Iniciando conversa com IA...");
    let user_id = "user_123";
    let session_id = uuid::Uuid::new_v4().to_string();

    // User message
    let user_query = "O que é AvilaDB e quais suas vantagens?";
    let query_embedding = vec![0.15, 0.25, 0.35, 0.45, 0.55];

    println!("👤 User: {}", user_query);

    // Vector search para RAG
    #[cfg(feature = "vector-search")]
    {
        let start = Instant::now();
        let relevant_docs = knowledge_base
            .vector_search("embedding", &query_embedding, 3)
            .await?;
        let search_time = start.elapsed();

        println!("🔍 Busca semântica: {:?} - {} docs relevantes", search_time, relevant_docs.len());
        println!("\n📄 Contexto recuperado:");
        for (i, doc) in relevant_docs.iter().enumerate() {
            println!("  {}. {}", i + 1, doc["text"]);
        }
    }

    // Build context e gerar resposta
    let context = ConversationContext {
        user_id: user_id.to_string(),
        messages: vec![
            Message {
                role: "user".to_string(),
                content: user_query.to_string(),
                embedding: Some(query_embedding.clone()),
            },
        ],
        metadata: serde_json::json!({
            "session_id": session_id,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "language": "pt-BR",
        }),
    };

    // Salvar conversa
    let conversation_doc = Document::new()
        .set("userId", user_id)
        .set("sessionId", &session_id)
        .set("context", serde_json::to_value(&context)?);

    conversations.insert(conversation_doc).await?;
    println!("\n💾 Conversa salva\n");

    // Simular resposta da IA (baseada no contexto)
    let ai_response = "AvilaDB é um banco de dados NoSQL distribuído globalmente, \
        otimizado especialmente para Brasil e LATAM com latência inferior a 10ms. \
        Suas principais vantagens incluem: vector search nativo para RAG, cache \
        inteligente, compressão automática e APIs simples em múltiplas linguagens.";

    let ai_embedding = vec![0.2, 0.3, 0.4, 0.5, 0.6];

    println!("🤖 AI: {}", ai_response);

    // Atualizar conversa com resposta
    let updated_context = ConversationContext {
        user_id: user_id.to_string(),
        messages: vec![
            Message {
                role: "user".to_string(),
                content: user_query.to_string(),
                embedding: Some(query_embedding),
            },
            Message {
                role: "assistant".to_string(),
                content: ai_response.to_string(),
                embedding: Some(ai_embedding.clone()),
            },
        ],
        metadata: serde_json::json!({
            "session_id": session_id,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "language": "pt-BR",
            "model": "gpt-4",
            "tokens_used": 250,
        }),
    };

    conversations
        .update(
            &session_id,
            Document::new()
                .set("context", serde_json::to_value(&updated_context)?)
                .set("lastUpdate", chrono::Utc::now().to_rfc3339())
        )
        .await?;

    // Cache embeddings para reutilização
    let cache_doc = Document::new()
        .set("text", ai_response)
        .set("embedding", serde_json::to_value(&ai_embedding)?)
        .set("model", "text-embedding-3-small")
        .set("cached_at", chrono::Utc::now().to_rfc3339());

    embeddings_cache.insert(cache_doc).await?;
    println!("💾 Embedding cached\n");

    // Histórico de conversas
    println!("📊 3. Análise de conversas");
    let user_conversations = conversations
        .query("SELECT * FROM conversations WHERE userId = @user_id ORDER BY lastUpdate DESC")
        .param("user_id", user_id)
        .execute()
        .await?;

    println!("✅ {} conversas do usuário", user_conversations.len());

    // Stats
    let stats = db.stats().await?;
    println!("\n📈 Estatísticas:");
    println!("  Knowledge base: {} docs", stats.collection_count);
    println!("  Conversas: {} sessions", user_conversations.len());
    println!("  Cache size: {:.2} MB", stats.storage_size_mb);

    // Telemetria
    let diagnostics = client.diagnostics().await;
    println!("\n⚡ Performance:");
    println!("  Latência média: {:?}", diagnostics.avg_latency);
    println!("  Cache hit rate: {:.1}%", diagnostics.cache_hit_rate * 100.0);

    println!("\n🎉 RAG demo concluída!");

    Ok(())
}
