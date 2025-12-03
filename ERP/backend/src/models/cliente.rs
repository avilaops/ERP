use serde::{Deserialize, Serialize};
use validator::Validate;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Cliente {
    pub id: i64,
    pub nome: String,
    pub cpf_cnpj: String,
    pub telefone: Option<String>,
    pub email: Option<String>,
    pub endereco: Option<String>,
    pub cidade: Option<String>,
    pub estado: Option<String>,
    pub cep: Option<String>,
    pub ativo: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateCliente {
    #[validate(length(min = 3, max = 255))]
    pub nome: String,

    #[validate(length(min = 11, max = 14))]
    pub cpf_cnpj: String,

    pub telefone: Option<String>,

    #[validate(email)]
    pub email: Option<String>,

    pub endereco: Option<String>,
    pub cidade: Option<String>,
    pub estado: Option<String>,
    pub cep: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateCliente {
    #[validate(length(min = 3, max = 255))]
    pub nome: Option<String>,

    pub telefone: Option<String>,

    #[validate(email)]
    pub email: Option<String>,

    pub endereco: Option<String>,
    pub cidade: Option<String>,
    pub estado: Option<String>,
    pub cep: Option<String>,
    pub ativo: Option<bool>,
}
