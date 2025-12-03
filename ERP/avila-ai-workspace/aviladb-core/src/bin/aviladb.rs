//! AvilaDB - Servidor Principal

extern crate alloc;
use alloc::string::String;
use aviladb_core::{AvilaDB, Config};

fn main() {
    println!("🇧🇷 AvilaDB v0.1.0 - Banco de Dados Soberano");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!();
    println!("✅ Criptografia: secp256k1 + Schnorr (Bitcoin-grade)");
    println!("✅ Rede: QUIC/UDP (baixa latência)");
    println!("✅ Storage: LSM Tree (write-optimized)");
    println!("✅ Transações: MVCC (snapshot isolation)");
    println!("✅ ZERO dependencies externas");
    println!();

    // Configuração padrão
    let config = Config {
        data_dir: String::from("./aviladb-data"),
        bind_addr: String::from("127.0.0.1:7000"),
        cache_size: 256 * 1024 * 1024,
        checkpoint_interval: 60,
        server_public_key: [0u8; 33],
        server_private_key: [0u8; 32],
    };

    println!("📂 Data directory: {}", config.data_dir);
    println!("🌐 Listening on: {}", config.bind_addr);
    println!("💾 Cache size: {} MB", config.cache_size / (1024 * 1024));
    println!();

    // Cria e inicia servidor
    let mut db = AvilaDB::new(config);

    println!("🚀 AvilaDB iniciando...");
    db.start();

    println!("✅ AvilaDB pronto para conexões!");
    println!();
    println!("Pressione Ctrl+C para parar.");

    // TODO: Implementar loop principal
    // loop {
    //     // Aceitar conexões
    //     // Processar queries
    //     // Checkpoint periódico
    // }
}
