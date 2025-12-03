//! Demo do Webmail Server

use avila_organism::webmail;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🍄 Ávila Webmail Server");
    println!("=======================\n");

    let app = webmail::routes();

    let addr = "127.0.0.1:8080";
    let listener = TcpListener::bind(addr).await?;

    println!("✓ Webmail rodando em http://{}", addr);
    println!("\n📬 Rotas disponíveis:");
    println!("   http://localhost:8080/          - Home");
    println!("   http://localhost:8080/inbox     - Inbox (lista de emails)");
    println!("   http://localhost:8080/compose   - Compose (enviar email)");
    println!("\n💡 Abra o browser e acesse as rotas acima!");
    println!("   Pressione Ctrl+C para parar o servidor\n");

    axum::serve(listener, app).await?;

    Ok(())
}
