//! Ávila email server

use avila_organism::{ApplicationConfig, webmail, api, admin};
use avila_organ::server::EmailServer;
use avila_tissue::storage::EmailStorage;
use axum::Router;
use tokio::net::TcpListener;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = ApplicationConfig::default();

    println!("\n╔══════════════════════════════════════════════╗");
    println!("║        ÁVILA - Email Application Server     ║");
    println!("╚══════════════════════════════════════════════╝");
    println!();
    println!("Starting servers...");
    println!("   • SMTP: :{}", config.smtp_port);
    println!("   • IMAP: :{}", config.imap_port);
    println!("   • HTTP: :{}", config.http_port);
    println!();
    println!("Application Stack:");
    println!("   • Primitive types & binary operations");
    println!("   • Data structures (Option, Result, Vec)");
    println!("   • Network protocols (TCP, UDP, TLS)");
    println!("   • Email protocols (SMTP, IMAP, POP3)");
    println!("   • Storage & indexing layer");
    println!("   • Server & client implementation");
    println!("   • Application layer");
    println!();

    // Create shared storage
    let storage = EmailStorage::new();

    // Create email server
    let email_server = Arc::new(EmailServer::new(
        config.smtp_port,
        config.imap_port,
        storage,
    ));

    // Start SMTP and IMAP servers in background
    let email_server_task = Arc::clone(&email_server);
    tokio::spawn(async move {
        if let Err(e) = email_server_task.start().await {
            eprintln!("❌ Email server error: {}", e);
        }
    });

    // Merge all HTTP routes
    let app = Router::new()
        .merge(webmail::routes())
        .merge(api::routes())
        .merge(admin::routes());

    // Start HTTP server
    let addr = format!("0.0.0.0:{}", config.http_port);
    let listener = TcpListener::bind(&addr).await?;

    println!("HTTP server running on http://{}", addr);
    println!("Email application ready - Zero external core dependencies");
    println!();

    axum::serve(listener, app).await?;

    Ok(())
}
