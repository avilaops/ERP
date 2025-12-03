pub mod clientes;
pub mod produtos;
pub mod vendas;
pub mod dashboard;

use axum::{Router, routing::get};
use crate::db::DbPool;

pub fn create_routes(pool: DbPool) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .nest("/clientes", clientes::routes(pool.clone()))
        .nest("/produtos", produtos::routes(pool.clone()))
        .nest("/vendas", vendas::routes(pool.clone()))
        .nest("/dashboard", dashboard::routes(pool))
}

async fn health_check() -> &'static str {
    "OK"
}
