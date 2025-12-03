use avila_cell::{EmailAddress, message::Email};

fn main() {
    println!("=== Avila Cell - Email Protocol Demo ===\n");

    // Criar endereços de email
    let from = EmailAddress::new("sender@avila.inc").unwrap();
    let to = vec![EmailAddress::new("recipient@avila.inc").unwrap()];

    println!("✓ Endereços criados:");
    println!("  De: {}", from);
    println!("  Para: {}", to[0]);

    // Criar email
    let mut email = Email::new(
        from.clone(),
        to,
        "Teste Avila Cell".to_string(),
        "Esta é uma mensagem de teste do ecossistema Avila!".to_string(),
    );

    // Adicionar CC
    email.add_cc(EmailAddress::new("cc@avila.inc").unwrap());

    // Adicionar header customizado
    email.add_header("X-Avila-Version".to_string(), "0.1.0".to_string());

    println!("\n✓ Email criado:");
    println!("  Message-ID: {}", email.id);
    println!("  Assunto: {}", email.subject);
    println!("  CC: {:?}", email.cc);

    // Converter para RFC 5322
    let rfc5322 = email.to_rfc5322();

    println!("\n✓ Formato RFC 5322:");
    println!("{}", "=".repeat(60));
    println!("{}", rfc5322);
    println!("{}", "=".repeat(60));

    // Validar endereços
    println!("\n✓ Validações:");
    println!("  {} é válido? {}", from, from.is_valid());

    let invalid = EmailAddress::new("test@localhost").unwrap();
    println!("  {} é válido? {}", invalid, invalid.is_valid());

    println!("\n✅ Demo concluído com sucesso!");
}
