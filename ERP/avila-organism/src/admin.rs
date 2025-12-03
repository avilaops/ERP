//! Admin panel HTTP routes

use axum::{Router, routing::get};

pub fn routes() -> Router {
    Router::new()
        .route("/admin", get(dashboard))
        .route("/admin/users", get(users))
        .route("/admin/stats", get(stats))
}

async fn dashboard() -> &'static str {
    "Admin Dashboard"
}

async fn users() -> &'static str {
    "User Management"
}

async fn stats() -> &'static str {
    "Application Statistics"
}
