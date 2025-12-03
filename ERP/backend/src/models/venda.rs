use serde::{Deserialize, Serialize};
use validator::Validate;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Venda {
    pub id: i64,
    pub cliente_id: Option<i64>,
    pub total: f64,
    pub desconto: f64,
    pub total_final: f64,
    pub forma_pagamento: String,
    pub status: String, // "ABERTA", "FINALIZADA", "CANCELADA"
    pub observacoes: Option<String>,
    pub usuario: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ItemVenda {
    pub id: i64,
    pub venda_id: i64,
    pub produto_id: i64,
    pub produto_nome: String,
    pub quantidade: i32,
    pub preco_unitario: f64,
    pub subtotal: f64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateVenda {
    pub cliente_id: Option<i64>,

    #[validate(range(min = 0.0))]
    pub desconto: Option<f64>,

    #[validate(length(min = 1))]
    pub forma_pagamento: String,

    pub observacoes: Option<String>,
    pub usuario: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct AddItemVenda {
    pub produto_id: i64,

    #[validate(range(min = 1))]
    pub quantidade: i32,
}

#[derive(Debug, Serialize)]
pub struct VendaCompleta {
    pub venda: Venda,
    pub itens: Vec<ItemVenda>,
}
