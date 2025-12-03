//! REST API routes

use axum::{Router, routing::{get, post}, Json};
use serde::{Serialize, Deserialize};

pub fn routes() -> Router {
    Router::new()
        .route("/api/v1/emails", get(list_emails).post(send_email))
        .route("/api/v1/emails/:id", get(get_email))
}

#[derive(Serialize, Deserialize)]
struct EmailResponse {
    id: String,
    subject: String,
    from: String,
}

async fn list_emails() -> Json<Vec<EmailResponse>> {
    Json(vec![])
}

async fn send_email(Json(_payload): Json<serde_json::Value>) -> &'static str {
    "Email sent"
}

async fn get_email() -> &'static str {
    "Email details"
}
