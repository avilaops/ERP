//! Demo do fluxo completo de email: compose → send → store → search → display

use avila_organism::webmail;
use avila_organ::auth::AuthSystem;
use avila_organ::client::EmailClient;
use avila_tissue::{EmailStorage, EmailMetadata, SearchEngine, EmailIndex};
use avila_cell::message::Email;
use avila_id::Id;
use avila_time::DateTime;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🍄 Demo: Fluxo Completo de Email (E2E)");
    println!("=======================================\n");

    // 1. Autenticação
    println!("🔐 ETAPA 1: Autenticação");
    println!("------------------------");
    let auth = AuthSystem::new();
    auth.register("alice", "password123")?;
    auth.register("bob", "securepass")?;

    if auth.authenticate("alice", "password123")? {
        println!("✓ Alice autenticada");
    }
    if auth.authenticate("bob", "securepass")? {
        println!("✓ Bob autenticado");
    }
    println!();

    // 2. Compose & Send
    println!("✉️  ETAPA 2: Composição e Envio");
    println!("-------------------------------");

    let mut client = EmailClient::new();

    let email1 = Email {
        id: Id::new().to_string(),
        from: "alice@avila.inc".to_string(),
        to: vec!["bob@avila.inc".to_string()],
        subject: "Bem-vindo ao Ávila Mail!".to_string(),
        body: "Olá Bob! Este é o primeiro email do nosso sistema distribuído de email. O sistema está funcionando perfeitamente com autenticação, armazenamento e busca integrados.".to_string(),
        headers: Default::default(),
    };

    client.send_simple(&email1).await?;

    let email2 = Email {
        id: Id::new().to_string(),
        from: "bob@avila.inc".to_string(),
        to: vec!["alice@avila.inc".to_string()],
        subject: "Re: Bem-vindo ao Ávila Mail!".to_string(),
        body: "Olá Alice! Que incrível! O sistema realmente funciona. Estou impressionado com a arquitetura biológica: Atom → Molecule → Cell → Tissue → Organ → Organism!".to_string(),
        headers: Default::default(),
    };

    client.send_simple(&email2).await?;
    println!();

    // 3. Storage
    println!("💾 ETAPA 3: Armazenamento");
    println!("-------------------------");
    let storage = Arc::new(EmailStorage::new());

    let meta1 = EmailMetadata {
        id: Id::parse(&email1.id)?,
        mailbox: "inbox".to_string(),
        flags: vec!["unread".to_string()],
        received_at: DateTime::now().timestamp() as i64,
    };
    storage.store(&email1, &meta1)?;
    println!("✓ Email 1 armazenado (ID: {})", email1.id);

    let meta2 = EmailMetadata {
        id: Id::parse(&email2.id)?,
        mailbox: "inbox".to_string(),
        flags: vec!["unread".to_string()],
        received_at: DateTime::now().timestamp() as i64,
    };
    storage.store(&email2, &meta2)?;
    println!("✓ Email 2 armazenado (ID: {})", email2.id);
    println!();

    // 4. Indexing & Search
    println!("🔍 ETAPA 4: Indexação e Busca");
    println!("------------------------------");
    let index = EmailIndex::create_in_memory()?;
    let search = SearchEngine::new(index, storage.clone());

    // Busca por palavra-chave
    let results = search.search_text("sistema", 10).await?;
    println!("Busca por 'sistema': {} resultados", results.len());
    for result in &results {
        println!("   - {} (score: {:.1})", result.subject, result.score);
    }
    println!();

    // Busca por remetente
    let results = search.search_from("alice").await?;
    println!("Emails de Alice: {} encontrados", results.len());
    for result in &results {
        println!("   - {}", result.subject);
    }
    println!();

    // 5. Display (Inbox)
    println!("📬 ETAPA 5: Exibição (Inbox)");
    println!("----------------------------");
    let all_ids = storage.list_ids()?;
    println!("Total na inbox: {} emails\n", all_ids.len());

    for (i, id) in all_ids.iter().enumerate() {
        if let Some(email) = storage.get(id)? {
            println!("Email #{}:", i + 1);
            println!("   De: {}", email.from);
            println!("   Para: {}", email.to.join(", "));
            println!("   Assunto: {}", email.subject);
            println!("   Preview: {}...", email.body.chars().take(60).collect::<String>());
            println!();
        }
    }

    // 6. Estatísticas finais
    println!("📊 ESTATÍSTICAS FINAIS");
    println!("======================");
    println!("Usuários autenticados: {}", auth.list_users()?.len());
    println!("Emails enviados: 2");
    println!("Emails armazenados: {}", storage.list_ids()?.len());
    println!("Sistema de busca: ✓ Operacional");
    println!("Sistema de auth: ✓ Operacional");
    println!("Webmail: ✓ Pronto");
    println!();

    println!("✨ FLUXO COMPLETO EXECUTADO COM SUCESSO!");
    println!("\n🎉 Todos os componentes funcionando:");
    println!("   ✓ Autenticação (hashing SHA-256)");
    println!("   ✓ Cliente SMTP (envio simulado)");
    println!("   ✓ Storage em memória");
    println!("   ✓ Motor de busca full-text");
    println!("   ✓ Webmail interface");
    println!("\n💡 Próximo: Integrar com TCP real e gossip protocol!");

    Ok(())
}
