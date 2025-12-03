//! Demo do sistema de autenticação

use avila_organ::auth::{AuthSystem, Result};

fn main() -> Result<()> {
    println!("🔐 Demo: Sistema de Autenticação");
    println!("=================================\n");

    let auth = AuthSystem::new();

    // Registro de usuários
    println!("📝 Registrando usuários...");
    auth.register("alice", "password123")?;
    auth.register("bob", "securepass456")?;
    auth.register("charlie", "mypassword789")?;
    println!("✓ 3 usuários registrados\n");

    // Lista usuários
    println!("👥 Usuários cadastrados:");
    for user in auth.list_users()? {
        println!("   - {}", user);
    }
    println!();

    // Testes de autenticação
    println!("🔑 Testando autenticação...");

    // Sucesso
    if auth.authenticate("alice", "password123")? {
        println!("✓ Alice autenticada com sucesso");
    }

    // Falha - senha errada
    if !auth.authenticate("bob", "wrongpassword")? {
        println!("✗ Bob: senha incorreta (esperado)");
    }

    // Falha - usuário inexistente
    if !auth.authenticate("david", "anypassword")? {
        println!("✗ David: usuário não existe (esperado)");
    }
    println!();

    // Mudança de senha
    println!("🔄 Testando mudança de senha...");
    auth.change_password("alice", "password123", "newpassword456")?;
    println!("✓ Senha de Alice alterada");

    // Verifica senha antiga não funciona
    if !auth.authenticate("alice", "password123")? {
        println!("✗ Senha antiga não funciona mais (esperado)");
    }

    // Verifica nova senha funciona
    if auth.authenticate("alice", "newpassword456")? {
        println!("✓ Nova senha funciona");
    }
    println!();

    // Testa requisitos de senha
    println!("⚠️  Testando requisitos de segurança...");
    match auth.register("test", "short") {
        Err(_) => println!("✓ Senha muito curta rejeitada"),
        Ok(_) => println!("✗ Deveria rejeitar senha curta"),
    }

    match auth.register("alice", "anotherpass") {
        Err(_) => println!("✓ Usuário duplicado rejeitado"),
        Ok(_) => println!("✗ Deveria rejeitar usuário duplicado"),
    }
    println!();

    // Remove usuário
    println!("🗑️  Removendo usuário...");
    auth.remove_user("charlie")?;
    println!("✓ Charlie removido");

    let users = auth.list_users()?;
    println!("👥 Usuários restantes: {}", users.len());
    println!();

    println!("✨ Demo concluída com sucesso!");
    println!("\n📊 Estatísticas:");
    println!("   Usuários ativos: {}", auth.list_users()?.len());
    println!("   Sistema funcionando corretamente ✓");

    Ok(())
}
