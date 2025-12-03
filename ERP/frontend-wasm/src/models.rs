use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Venda {
    pub id: i64,
    pub cliente_id: Option<i64>,
    pub total: f64,
    pub desconto: f64,
    pub total_final: f64,
    pub forma_pagamento: String,
    pub status: String,
    pub observacoes: Option<String>,
    pub usuario: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ItemVenda {
    pub id: i64,
    pub venda_id: i64,
    pub produto_id: i64,
    pub produto_nome: String,
    pub quantidade: i32,
    pub preco_unitario: f64,
    pub subtotal: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardData {
    pub vendas_hoje: VendasHoje,
    pub estoque_critico: Vec<EstoqueCritico>,
    pub produtos_mais_vendidos: Vec<ProdutoMaisVendido>,
    pub resumo_mes: ResumoMes,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VendasHoje {
    pub quantidade: i64,
    pub valor_total: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EstoqueCritico {
    pub id: i64,
    pub nome: String,
    pub estoque_atual: i32,
    pub estoque_minimo: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProdutoMaisVendido {
    pub produto_id: i64,
    pub produto_nome: String,
    pub total_vendido: i64,
    pub valor_total: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResumoMes {
    pub total_vendas: i64,
    pub valor_total: f64,
    pub ticket_medio: f64,
}
