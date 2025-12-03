use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use validator::Validate;

use crate::{
    db::DbPool,
    error::{AppError, Result},
    models::{Cliente, CreateCliente, UpdateCliente},
};

pub fn routes(pool: DbPool) -> Router {
    Router::new()
        .route("/", get(list_clientes).post(create_cliente))
        .route("/:id", get(get_cliente).put(update_cliente).delete(delete_cliente))
        .with_state(pool)
}

async fn list_clientes(State(pool): State<DbPool>) -> Result<Json<Vec<Cliente>>> {
    let clientes = sqlx::query_as::<_, Cliente>(
        "SELECT * FROM clientes WHERE ativo = true ORDER BY nome"
    )
    .fetch_all(&pool)
    .await?;

    Ok(Json(clientes))
}

async fn get_cliente(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
) -> Result<Json<Cliente>> {
    let cliente = sqlx::query_as::<_, Cliente>(
        "SELECT * FROM clientes WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(cliente))
}

async fn create_cliente(
    State(pool): State<DbPool>,
    Json(payload): Json<CreateCliente>,
) -> Result<Json<Cliente>> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let result = sqlx::query(
        r#"
        INSERT INTO clientes (nome, cpf_cnpj, telefone, email, endereco, cidade, estado, cep)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#
    )
    .bind(&payload.nome)
    .bind(&payload.cpf_cnpj)
    .bind(&payload.telefone)
    .bind(&payload.email)
    .bind(&payload.endereco)
    .bind(&payload.cidade)
    .bind(&payload.estado)
    .bind(&payload.cep)
    .execute(&pool)
    .await?;

    let cliente = sqlx::query_as::<_, Cliente>(
        "SELECT * FROM clientes WHERE id = ?"
    )
    .bind(result.last_insert_rowid())
    .fetch_one(&pool)
    .await?;

    Ok(Json(cliente))
}

async fn update_cliente(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateCliente>,
) -> Result<Json<Cliente>> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    // Verificar se existe
    sqlx::query("SELECT id FROM clientes WHERE id = ?")
        .bind(id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    // Atualizar apenas campos fornecidos
    let mut query = String::from("UPDATE clientes SET updated_at = CURRENT_TIMESTAMP");

    if let Some(nome) = &payload.nome {
        query.push_str(&format!(", nome = '{}'", nome));
    }
    if let Some(telefone) = &payload.telefone {
        query.push_str(&format!(", telefone = '{}'", telefone));
    }
    if let Some(email) = &payload.email {
        query.push_str(&format!(", email = '{}'", email));
    }
    if let Some(endereco) = &payload.endereco {
        query.push_str(&format!(", endereco = '{}'", endereco));
    }
    if let Some(cidade) = &payload.cidade {
        query.push_str(&format!(", cidade = '{}'", cidade));
    }
    if let Some(estado) = &payload.estado {
        query.push_str(&format!(", estado = '{}'", estado));
    }
    if let Some(cep) = &payload.cep {
        query.push_str(&format!(", cep = '{}'", cep));
    }
    if let Some(ativo) = payload.ativo {
        query.push_str(&format!(", ativo = {}", ativo));
    }

    query.push_str(&format!(" WHERE id = {}", id));

    sqlx::query(&query).execute(&pool).await?;

    let cliente = sqlx::query_as::<_, Cliente>(
        "SELECT * FROM clientes WHERE id = ?"
    )
    .bind(id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(cliente))
}

async fn delete_cliente(
    State(pool): State<DbPool>,
    Path(id): Path<i64>,
) -> Result<Json<()>> {
    let result = sqlx::query("UPDATE clientes SET ativo = false WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(()))
}
