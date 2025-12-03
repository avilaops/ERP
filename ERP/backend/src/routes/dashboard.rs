use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::{db::DbPool, error::Result};

pub fn routes(pool: DbPool) -> Router {
    Router::new()
        .route("/", get(get_dashboard))
        .with_state(pool)
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

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct EstoqueCritico {
    pub id: i64,
    pub nome: String,
    pub estoque_atual: i32,
    pub estoque_minimo: i32,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
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

async fn get_dashboard(State(pool): State<DbPool>) -> Result<Json<DashboardData>> {
    // Vendas de hoje
    let vendas_hoje: (i64, Option<f64>) = sqlx::query_as(
        r#"
        SELECT COUNT(*) as quantidade, COALESCE(SUM(total_final), 0) as valor_total
        FROM vendas
        WHERE DATE(created_at) = DATE('now') AND status = 'FINALIZADA'
        "#
    )
    .fetch_one(&pool)
    .await?;

    // Estoque crítico
    let estoque_critico = sqlx::query_as::<_, EstoqueCritico>(
        r#"
        SELECT id, nome, estoque_atual, estoque_minimo
        FROM produtos
        WHERE ativo = true AND estoque_atual <= estoque_minimo
        ORDER BY estoque_atual
        LIMIT 10
        "#
    )
    .fetch_all(&pool)
    .await?;

    // Produtos mais vendidos (últimos 30 dias)
    let produtos_mais_vendidos = sqlx::query_as::<_, ProdutoMaisVendido>(
        r#"
        SELECT
            p.id as produto_id,
            p.nome as produto_nome,
            SUM(iv.quantidade) as total_vendido,
            SUM(iv.subtotal) as valor_total
        FROM itens_venda iv
        JOIN produtos p ON iv.produto_id = p.id
        JOIN vendas v ON iv.venda_id = v.id
        WHERE v.status = 'FINALIZADA'
          AND v.created_at >= DATE('now', '-30 days')
        GROUP BY p.id, p.nome
        ORDER BY total_vendido DESC
        LIMIT 10
        "#
    )
    .fetch_all(&pool)
    .await?;

    // Resumo do mês
    let resumo_mes: (i64, Option<f64>) = sqlx::query_as(
        r#"
        SELECT COUNT(*) as total_vendas, COALESCE(SUM(total_final), 0) as valor_total
        FROM vendas
        WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
          AND status = 'FINALIZADA'
        "#
    )
    .fetch_one(&pool)
    .await?;

    let ticket_medio = if resumo_mes.0 > 0 {
        resumo_mes.1.unwrap_or(0.0) / resumo_mes.0 as f64
    } else {
        0.0
    };

    Ok(Json(DashboardData {
        vendas_hoje: VendasHoje {
            quantidade: vendas_hoje.0,
            valor_total: vendas_hoje.1.unwrap_or(0.0),
        },
        estoque_critico,
        produtos_mais_vendidos,
        resumo_mes: ResumoMes {
            total_vendas: resumo_mes.0,
            valor_total: resumo_mes.1.unwrap_or(0.0),
            ticket_medio,
        },
    }))
}
