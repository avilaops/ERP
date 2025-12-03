//! Spore - Pacote de dados replicável

use crate::{SporeData, Result};

/// Handler para processar esporos recebidos
pub trait SporeHandler: Send + Sync {
    /// Processa um esporo recebido
    fn handle_spore(&self, spore: &SporeData) -> Result<()>;
}

/// Filtro de esporos por tipo
pub struct SporeFilter {
    /// Tipos de dados aceitos
    accepted_types: Vec<String>,
}

impl SporeFilter {
    /// Cria novo filtro
    pub fn new(accepted_types: Vec<String>) -> Self {
        Self { accepted_types }
    }

    /// Verifica se aceita este tipo de esporo
    pub fn accepts(&self, spore: &SporeData) -> bool {
        self.accepted_types.contains(&spore.data_type)
    }
}

/// Handler que imprime esporos recebidos
pub struct PrintSporeHandler;

impl SporeHandler for PrintSporeHandler {
    fn handle_spore(&self, spore: &SporeData) -> Result<()> {
        println!("🍄 Esporo recebido: {} (tipo: {}, {} bytes)",
                 spore.id, spore.data_type, spore.payload.len());
        Ok(())
    }
}
