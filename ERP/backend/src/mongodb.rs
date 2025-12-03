use mongodb::{Client, Database, Collection, bson::doc};
use serde::{Deserialize, Serialize};
use anyhow::Result;

#[derive(Debug, Clone)]
pub struct MongoDb {
    pub db: Database,
}

impl MongoDb {
    pub async fn new(uri: &str, database_name: &str) -> Result<Self> {
        let client = Client::with_uri_str(uri).await?;

        // Ping para verificar conexão
        client
            .database("admin")
            .run_command(doc! { "ping": 1 }, None)
            .await?;

        tracing::info!("✅ Conectado ao MongoDB Atlas");

        let db = client.database(database_name);

        Ok(Self { db })
    }

    pub fn clientes(&self) -> Collection<crate::models::Cliente> {
        self.db.collection("clientes")
    }

    pub fn produtos(&self) -> Collection<crate::models::Produto> {
        self.db.collection("produtos")
    }

    pub fn vendas(&self) -> Collection<crate::models::Venda> {
        self.db.collection("vendas")
    }
}

// Adicionar no Cargo.toml:
// mongodb = "2.8"
// bson = "2.9"
