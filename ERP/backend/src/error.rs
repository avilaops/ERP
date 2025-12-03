use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Erro no banco de dados: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Não encontrado")]
    NotFound,

    #[error("Erro de validação: {0}")]
    Validation(String),

    #[error("Erro interno do servidor")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::Database(e) => {
                tracing::error!("Database error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Erro no banco de dados")
            }
            AppError::NotFound => (StatusCode::NOT_FOUND, "Recurso não encontrado"),
            AppError::Validation(ref msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::Internal(e) => {
                tracing::error!("Internal error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Erro interno do servidor")
            }
        };

        let body = Json(json!({
            "error": message,
        }));

        (status, body).into_response()
    }
}
