use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub jwt_secret: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        // Obter diretório do workspace
        let workspace_root = env::current_dir()?
            .parent()
            .unwrap()
            .to_path_buf();

        let default_db = workspace_root
            .join("database")
            .join("avila_erp.db")
            .to_string_lossy()
            .to_string();

        Ok(Self {
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()?,
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| format!("sqlite://{}?mode=rwc", default_db)),
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| "change-me-in-production".to_string()),
        })
    }
}
