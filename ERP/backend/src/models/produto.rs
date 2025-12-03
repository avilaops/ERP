use serde::{Deserialize, Serialize};
use validator::Validate;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Produto {
    pub id: i64,
    pub nome: String,
    pub descricao: Option<String>,
    pub codigo_barras: Option<String>,
    pub preco_custo: f64,
    pub preco_venda: f64,
    pub estoque_atual: i32,
    pub estoque_minimo: i32,
    pub unidade: String,
    pub ativo: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateProduto {
    #[validate(length(min = 3, max = 255))]
    pub nome: String,

    pub descricao: Option<String>,
    pub codigo_barras: Option<String>,

    #[validate(range(min = 0.0))]
    pub preco_custo: f64,

    #[validate(range(min = 0.0))]
    pub preco_venda: f64,

    #[validate(range(min = 0))]
    pub estoque_inicial: i32,

    #[validate(range(min = 0))]
    pub estoque_minimo: i32,

    #[validate(length(min = 1, max = 10))]
    pub unidade: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateProduto {
    #[validate(length(min = 3, max = 255))]
    pub nome: Option<String>,

    pub descricao: Option<String>,
    pub codigo_barras: Option<String>,

    #[validate(range(min = 0.0))]
    pub preco_custo: Option<f64>,

    #[validate(range(min = 0.0))]
    pub preco_venda: Option<f64>,

    #[validate(range(min = 0))]
    pub estoque_minimo: Option<i32>,

    pub unidade: Option<String>,
    pub ativo: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct MovimentacaoEstoque {
    pub id: i64,
    pub produto_id: i64,
    pub tipo: String, // "ENTRADA" ou "SAIDA"
    pub quantidade: i32,
    pub motivo: String,
    pub usuario: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateMovimentacao {
    pub produto_id: i64,

    #[validate(length(min = 1))]
    pub tipo: String,

    #[validate(range(min = 1))]
    pub quantidade: i32,

    #[validate(length(min = 3))]
    pub motivo: String,

    pub usuario: Option<String>,
}
