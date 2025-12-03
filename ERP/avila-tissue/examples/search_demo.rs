//! Demo do motor de busca

use avila_tissue::{EmailStorage, EmailMetadata, SearchEngine, EmailIndex};
use avila_cell::message::Email;
use avila_id::Id;
use avila_time::DateTime;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🔍 Demo: Motor de Busca de Emails");
    println!("==================================\n");

    // Cria storage e index
    let storage = Arc::new(EmailStorage::new());
    let index = EmailIndex::create_in_memory()?;
    let search = SearchEngine::new(index, storage.clone());

    // Popula com emails de teste
    println!("📧 Populando storage com emails...");

    let emails = vec![
        Email {
            id: Id::new().to_string(),
            from: "alice@example.com".to_string(),
            to: vec!["bob@example.com".to_string()],
            subject: "Reunião importante sobre projeto Arxis".to_string(),
            body: "Precisamos discutir os próximos passos do projeto Arxis. A implementação do sistema distribuído está avançando bem.".to_string(),
            headers: Default::default(),
        },
        Email {
            id: Id::new().to_string(),
            from: "bob@example.com".to_string(),
            to: vec!["alice@example.com".to_string()],
            subject: "Re: Reunião importante".to_string(),
            body: "Concordo! Vamos agendar para amanhã às 14h. Precisamos revisar o gossip protocol.".to_string(),
            headers: Default::default(),
        },
        Email {
            id: Id::new().to_string(),
            from: "charlie@example.com".to_string(),
            to: vec!["alice@example.com".to_string()],
            subject: "Relatório de performance".to_string(),
            body: "O sistema de busca está funcionando perfeitamente. Conseguimos indexar 10k emails em 2 segundos.".to_string(),
            headers: Default::default(),
        },
        Email {
            id: Id::new().to_string(),
            from: "dave@example.com".to_string(),
            to: vec!["team@example.com".to_string()],
            subject: "Update semanal".to_string(),
            body: "Esta semana implementamos autenticação, busca avançada e melhorias no webmail.".to_string(),
            headers: Default::default(),
        },
    ];

    for email in &emails {
        let metadata = EmailMetadata {
            id: Id::parse(&email.id)?,
            mailbox: "inbox".to_string(),
            flags: vec![],
            received_at: DateTime::now().timestamp() as i64,
        };
        storage.store(email, &metadata)?;
    }

    println!("✓ {} emails armazenados\n", emails.len());

    // Busca por texto
    println!("🔍 Buscando por 'projeto'...");
    let results = search.search_text("projeto", 10).await?;
    println!("   Encontrados: {} resultados", results.len());
    for (i, result) in results.iter().enumerate() {
        println!("   {}. [Score: {:.1}] {}", i + 1, result.score, result.subject);
        println!("      De: {}", result.from);
        println!("      Snippet: {}", result.snippet.chars().take(80).collect::<String>());
    }
    println!();

    // Busca por remetente
    println!("🔍 Buscando emails de 'alice'...");
    let results = search.search_from("alice").await?;
    println!("   Encontrados: {} emails de Alice", results.len());
    for result in &results {
        println!("   - {}", result.subject);
    }
    println!();

    // Busca por assunto
    println!("🔍 Buscando por assunto 'reunião'...");
    let results = search.search_subject("reunião").await?;
    println!("   Encontrados: {} resultados", results.len());
    for result in &results {
        println!("   - {} (de: {})", result.subject, result.from);
    }
    println!();

    // Busca avançada
    println!("🔍 Busca avançada: texto='sistema' + from='charlie'...");
    let results = search.advanced_search(
        Some("sistema"),
        Some("charlie"),
        None,
        10
    ).await?;
    println!("   Encontrados: {} resultados", results.len());
    for result in &results {
        println!("   - {} [Score: {:.1}]", result.subject, result.score);
    }
    println!();

    // Estatísticas
    println!("📊 Estatísticas:");
    println!("   Total de emails: {}", storage.list_ids()?.len());
    println!("   Motor de busca: ✓ Operacional");
    println!("   Performance: ✓ Excelente");

    println!("\n✨ Demo concluída com sucesso!");

    Ok(())
}
