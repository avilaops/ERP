use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use validator::Validate;

use crate::{
    db::DbPool,
    error::{AppError, Result},
    models::{Produto, CreateProduto, UpdateProduto, MovimentacaoEstoque, CreateMovimentacao},
};

pub fn routes(pool: DbPool) -> Router {
    Router::new()
        .route("/", get(list_produtos).post(create_produto))
        .route("/:id", get(get_produto).put(update_produto).delete(delete_produto))
        .route("/:id/movimentacoes", get(list_movimentacoes).post(create_movimentacao))
        .route("/estoque/critico", get(list_estoque_critico))
        .with_state(pool)
}

async fn list_produtos(State(pool): State<DbPool>) -> Result<Json<Vec<Produto>>> {
    let produtos = sqlx::query_as::<_, Produto>(
        "SELECT * FROM produtos WHERE ativo = true ORDER BY nome"
    )
    .fetch_all(&pool)
    .await?;

    Ok(Json(produtos))
}

async fn get_produto(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
) -> Result<Json<Produto>> {
    let produto = sqlx::query_as::<_, Produto>(
        "SELECT * FROM produtos WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(produto))
}

async fn create_produto(
    State(pool): State<DbPool>,
    Json(payload): Json<CreateProduto>,
) -> Result<Json<Produto>> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let result = sqlx::query(
        r#"
        INSERT INTO produtos (nome, descricao, codigo_barras, preco_custo, preco_venda,
                              estoque_atual, estoque_minimo, unidade)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#
    )
    .bind(&payload.nome)
    .bind(&payload.descricao)
    .bind(&payload.codigo_barras)
    .bind(payload.preco_custo)
    .bind(payload.preco_venda)
    .bind(payload.estoque_inicial)
    .bind(payload.estoque_minimo)
    .bind(&payload.unidade)
    .execute(&pool)
    .await?;

    let produto = sqlx::query_as::<_, Produto>(
        "SELECT * FROM produtos WHERE id = ?"
    )
    .bind(result.last_insert_rowid())
    .fetch_one(&pool)
    .await?;

    Ok(Json(produto))
}

async fn update_produto(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateProduto>,
) -> Result<Json<Produto>> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    // Verificar se existe
    sqlx::query("SELECT id FROM produtos WHERE id = ?")
        .bind(id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    // Atualizar campos fornecidos
    if let Some(nome) = &payload.nome {
        sqlx::query("UPDATE produtos SET nome = ? WHERE id = ?")
            .bind(nome).bind(id).execute(&pool).await?;
    }
    if let Some(preco_custo) = payload.preco_custo {
        sqlx::query("UPDATE produtos SET preco_custo = ? WHERE id = ?")
            .bind(preco_custo).bind(id).execute(&pool).await?;
    }
    if let Some(preco_venda) = payload.preco_venda {
        sqlx::query("UPDATE produtos SET preco_venda = ? WHERE id = ?")
            .bind(preco_venda).bind(id).execute(&pool).await?;
    }

    let produto = sqlx::query_as::<_, Produto>(
        "SELECT * FROM produtos WHERE id = ?"
    )
    .bind(id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(produto))
}

async fn delete_produto(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
) -> Result<Json<()>> {
    let result = sqlx::query("UPDATE produtos SET ativo = false WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(()))
}

async fn list_estoque_critico(State(pool): State<DbPool>) -> Result<Json<Vec<Produto>>> {
    let produtos = sqlx::query_as::<_, Produto>(
        "SELECT * FROM produtos WHERE ativo = true AND estoque_atual <= estoque_minimo ORDER BY estoque_atual"
    )
    .fetch_all(&pool)
    .await?;

    Ok(Json(produtos))
}

async fn list_movimentacoes(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<MovimentacaoEstoque>>> {
    let movimentacoes = sqlx::query_as::<_, MovimentacaoEstoque>(
        "SELECT * FROM movimentacoes_estoque WHERE produto_id = ? ORDER BY created_at DESC LIMIT 50"
    )
    .bind(id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(movimentacoes))
}

async fn create_movimentacao(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
    Json(payload): Json<CreateMovimentacao>,
) -> Result<Json<MovimentacaoEstoque>> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    // Verificar se produto existe
    let produto = sqlx::query_as::<_, Produto>("SELECT * FROM produtos WHERE id = ?")
        .bind(id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    // Validar tipo
    if payload.tipo != "ENTRADA" && payload.tipo != "SAIDA" {
        return Err(AppError::Validation("Tipo deve ser ENTRADA ou SAIDA".to_string()));
    }

    // Validar estoque para saída
    if payload.tipo == "SAIDA" && produto.estoque_atual < payload.quantidade {
        return Err(AppError::Validation("Estoque insuficiente".to_string()));
    }

    // Inserir movimentação
    let result = sqlx::query(
        r#"
        INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, motivo, usuario)
        VALUES (?, ?, ?, ?, ?)
        "#
    )
    .bind(id)
    .bind(&payload.tipo)
    .bind(payload.quantidade)
    .bind(&payload.motivo)
    .bind(&payload.usuario)
    .execute(&pool)
    .await?;

    // Atualizar estoque
    let nova_quantidade = if payload.tipo == "ENTRADA" {
        produto.estoque_atual + payload.quantidade
    } else {
        produto.estoque_atual - payload.quantidade
    };

    sqlx::query("UPDATE produtos SET estoque_atual = ? WHERE id = ?")
        .bind(nova_quantidade)
        .bind(id)
        .execute(&pool)
        .await?;

    let movimentacao = sqlx::query_as::<_, MovimentacaoEstoque>(
        "SELECT * FROM movimentacoes_estoque WHERE id = ?"
    )
    .bind(result.last_insert_rowid())
    .fetch_one(&pool)
    .await?;

    Ok(Json(movimentacao))
}
