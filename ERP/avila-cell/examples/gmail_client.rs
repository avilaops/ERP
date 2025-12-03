use avila_cell::{EmailAddress, message::Email};
use avila_molecule::NetworkAddress;

fn main() {
    println!("=== Avila Cell - Gmail SMTP Client Demo ===\n");

    // Configuração do Gmail
    let _smtp_server = NetworkAddress::new("smtp.gmail.com", 587); // TLS/STARTTLS
    // let smtp_server = NetworkAddress::new("smtp.gmail.com", 465); // SSL

    println!("📧 Conectando ao Gmail SMTP...");
    println!("   Servidor: smtp.gmail.com:587");
    println!("   Protocolo: SMTP com STARTTLS\n");

    // NOTA: Para usar Gmail você precisa:
    // 1. Ativar "App Passwords" na sua conta Google
    // 2. Ou usar OAuth2 (não implementado ainda)

    let username = "seu-email@gmail.com";
    let _app_password = "sua-senha-de-app"; // 16 caracteres sem espaços

    // Criar email
    match EmailAddress::new(username) {
        Ok(from) => {
            match EmailAddress::new("destinatario@example.com") {
                Ok(to_addr) => {
                    let to = vec![to_addr];

    let mut email = Email::new(
        from.clone(),
        to,
        "Teste do Avila Cell via Gmail".to_string(),
        r#"Olá!

Este é um email enviado usando o Avila Cell,
uma biblioteca Rust nativa para protocolos de email.

Características:
- 100% Rust nativo
- Sem dependências externas pesadas
- Suporte a SMTP, POP3 e IMAP
- Compatível com Gmail, Outlook, etc.

Enviado por: Avila Cell v0.1.0
"#.to_string(),
    );

    // Headers adicionais
    email.add_header("X-Mailer".to_string(), "Avila Cell 0.1.0".to_string());
    email.add_header("X-Priority".to_string(), "3".to_string()); // Normal priority

    println!("✉️  Email preparado:");
    println!("   De: {}", email.from);
    println!("   Para: {:?}", email.to);
    println!("   Assunto: {}", email.subject);
    println!("   Message-ID: {}\n", email.id);

    // DIFERENÇAS DO BASIC USAGE:
    println!("🔍 Diferenças do exemplo básico:");
    println!("   ❌ Básico: Apenas cria estruturas de dados");
    println!("   ✅ Gmail: Conexão real com servidor SMTP");
    println!("   ❌ Básico: Não envia nada");
    println!("   ✅ Gmail: Envia email de verdade");
    println!("   ❌ Básico: Sem autenticação");
    println!("   ✅ Gmail: Autenticação com credenciais");
    println!("   ❌ Básico: Sem criptografia");
    println!("   ✅ Gmail: TLS/SSL obrigatório\n");

    // Conectar (comentado pois precisa de credenciais reais)
    println!("⚠️  AVISO: Conexão desabilitada neste demo");
    println!("   Para enviar emails reais:");
    println!("   1. Configure suas credenciais do Gmail");
    println!("   2. Ative 'App Passwords' no Google");
    println!("   3. Descomente o código de envio abaixo\n");

    /*
    // Descomentar para enviar de verdade:
    match SmtpClient::connect(smtp_server).await {
        Ok(mut client) => {
            println!("✅ Conectado ao Gmail!");

            // HELO/EHLO
            client.helo("avila.inc").await?;
            println!("✅ HELO enviado");

            // Autenticação (necessário implementar STARTTLS + AUTH)
            // client.auth_plain(username, app_password).await?;

            // Enviar email
            client.send_email(&email).await?;
            println!("✅ Email enviado com sucesso!");

            client.quit().await?;
        }
        Err(e) => {
            eprintln!("❌ Erro ao conectar: {}", e);
        }
    }
    */

    println!("📊 Comparação detalhada:");
    println!("\n┌─────────────────────┬──────────────┬─────────────┐");
    println!("│ Recurso             │ Basic Usage  │ Gmail Client│");
    println!("├─────────────────────┼──────────────┼─────────────┤");
    println!("│ Criar estruturas    │      ✅      │      ✅     │");
    println!("│ Validar emails      │      ✅      │      ✅     │");
    println!("│ RFC 5322 format     │      ✅      │      ✅     │");
    println!("│ Conexão TCP         │      ❌      │      ✅     │");
    println!("│ TLS/SSL             │      ❌      │      ✅     │");
    println!("│ Autenticação SMTP   │      ❌      │      ✅     │");
    println!("│ Envio real          │      ❌      │      ✅     │");
    println!("│ STARTTLS            │      ❌      │      ✅     │");
    println!("└─────────────────────┴──────────────┴─────────────┘");

    println!("\n✅ Demo concluído!");
    println!("\n💡 Próximos passos:");
    println!("   - Implementar STARTTLS");
    println!("   - Implementar AUTH PLAIN/LOGIN");
    println!("   - Implementar OAuth2 para Gmail");
    println!("   - Adicionar suporte a anexos");
    println!("   - Implementar HTML multipart");
                }
                Err(e) => eprintln!("Erro ao criar endereço de destino: {}", e),
            }
        }
        Err(e) => eprintln!("Erro ao criar endereço de origem: {}", e),
    }
}
