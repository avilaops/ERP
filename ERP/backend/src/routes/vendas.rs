use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use validator::Validate;

use crate::{
    db::DbPool,
    error::{AppError, Result},
    models::{Venda, ItemVenda, CreateVenda, AddItemVenda, VendaCompleta},
};

pub fn routes(pool: DbPool) -> Router {
    Router::new()
        .route("/", get(list_vendas).post(create_venda))
        .route("/:id", get(get_venda))
        .route("/:id/itens", post(add_item))
        .route("/:id/finalizar", post(finalizar_venda))
        .route("/:id/cancelar", post(cancelar_venda))
        .with_state(pool)
}

async fn list_vendas(State(pool): State<DbPool>) -> Result<Json<Vec<Venda>>> {
    let vendas = sqlx::query_as::<_, Venda>(
        "SELECT * FROM vendas ORDER BY created_at DESC LIMIT 100"
    )
    .fetch_all(&pool)
    .await?;

    Ok(Json(vendas))
}

async fn get_venda(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
) -> Result<Json<VendaCompleta>> {
    let venda = sqlx::query_as::<_, Venda>(
        "SELECT * FROM vendas WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let itens = sqlx::query_as::<_, ItemVenda>(
        r#"
        SELECT iv.*, p.nome as produto_nome
        FROM itens_venda iv
        JOIN produtos p ON iv.produto_id = p.id
        WHERE iv.venda_id = ?
        "#
    )
    .bind(id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(VendaCompleta { venda, itens }))
}

async fn create_venda(
    State(pool): State<DbPool>,
    Json(payload): Json<CreateVenda>,
) -> Result<Json<Venda>> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let desconto = payload.desconto.unwrap_or(0.0);

    let result = sqlx::query(
        r#"
        INSERT INTO vendas (cliente_id, total, desconto, total_final, forma_pagamento, observacoes, usuario, status)
        VALUES (?, 0, ?, 0, ?, ?, ?, 'ABERTA')
        "#
    )
    .bind(payload.cliente_id)
    .bind(desconto)
    .bind(&payload.forma_pagamento)
    .bind(&payload.observacoes)
    .bind(&payload.usuario)
    .execute(&pool)
    .await?;

    let venda = sqlx::query_as::<_, Venda>(
        "SELECT * FROM vendas WHERE id = ?"
    )
    .bind(result.last_insert_rowid())
    .fetch_one(&pool)
    .await?;

    Ok(Json(venda))
}

async fn add_item(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
    Json(payload): Json<AddItemVenda>,
) -> Result<Json<ItemVenda>> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    // Verificar se venda existe e está aberta
    let venda = sqlx::query_as::<_, Venda>("SELECT * FROM vendas WHERE id = ?")
        .bind(id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    if venda.status != "ABERTA" {
        return Err(AppError::Validation("Venda não está aberta".to_string()));
    }

    // Buscar produto
    let produto = sqlx::query_as::<_, crate::models::Produto>(
        "SELECT * FROM produtos WHERE id = ? AND ativo = true"
    )
    .bind(payload.produto_id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::Validation("Produto não encontrado ou inativo".to_string()))?;

    // Verificar estoque
    if produto.estoque_atual < payload.quantidade {
        return Err(AppError::Validation("Estoque insuficiente".to_string()));
    }

    let subtotal = produto.preco_venda * payload.quantidade as f64;

    // Inserir item
    let result = sqlx::query(
        r#"
        INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario, subtotal)
        VALUES (?, ?, ?, ?, ?)
        "#
    )
    .bind(id)
    .bind(payload.produto_id)
    .bind(payload.quantidade)
    .bind(produto.preco_venda)
    .bind(subtotal)
    .execute(&pool)
    .await?;

    // Atualizar total da venda
    let novo_total = venda.total + subtotal;
    let novo_total_final = novo_total - venda.desconto;

    sqlx::query("UPDATE vendas SET total = ?, total_final = ? WHERE id = ?")
        .bind(novo_total)
        .bind(novo_total_final)
        .bind(id)
        .execute(&pool)
        .await?;

    let item = sqlx::query_as::<_, ItemVenda>(
        r#"
        SELECT iv.*, p.nome as produto_nome
        FROM itens_venda iv
        JOIN produtos p ON iv.produto_id = p.id
        WHERE iv.id = ?
        "#
    )
    .bind(result.last_insert_rowid())
    .fetch_one(&pool)
    .await?;

    Ok(Json(item))
}

async fn finalizar_venda(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
) -> Result<Json<VendaCompleta>> {
    // Verificar se venda existe e está aberta
    let venda = sqlx::query_as::<_, Venda>("SELECT * FROM vendas WHERE id = ?")
        .bind(id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    if venda.status != "ABERTA" {
        return Err(AppError::Validation("Venda não está aberta".to_string()));
    }

    // Buscar itens
    let itens = sqlx::query_as::<_, ItemVenda>(
        r#"
        SELECT iv.*, p.nome as produto_nome
        FROM itens_venda iv
        JOIN produtos p ON iv.produto_id = p.id
        WHERE iv.venda_id = ?
        "#
    )
    .bind(id)
    .fetch_all(&pool)
    .await?;

    if itens.is_empty() {
        return Err(AppError::Validation("Venda sem itens".to_string()));
    }

    // Dar baixa no estoque de cada produto
    for item in &itens {
        sqlx::query("UPDATE produtos SET estoque_atual = estoque_atual - ? WHERE id = ?")
            .bind(item.quantidade)
            .bind(item.produto_id)
            .execute(&pool)
            .await?;

        // Registrar movimentação
        sqlx::query(
            r#"
            INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, motivo)
            VALUES (?, 'SAIDA', ?, ?)
            "#
        )
        .bind(item.produto_id)
        .bind(item.quantidade)
        .bind(format!("Venda #{}", id))
        .execute(&pool)
        .await?;
    }

    // Finalizar venda
    sqlx::query("UPDATE vendas SET status = 'FINALIZADA' WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await?;

    let venda = sqlx::query_as::<_, Venda>("SELECT * FROM vendas WHERE id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await?;

    Ok(Json(VendaCompleta { venda, itens }))
}

async fn cancelar_venda(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
) -> Result<Json<Venda>> {
    sqlx::query("UPDATE vendas SET status = 'CANCELADA' WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await?;

    let venda = sqlx::query_as::<_, Venda>("SELECT * FROM vendas WHERE id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await?;

    Ok(Json(venda))
}
