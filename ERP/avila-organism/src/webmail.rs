//! Webmail HTTP routes

use axum::{
    Router,
    routing::{get, post},
    Json,
    extract::{Query, State},
    response::{Html, IntoResponse},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Estado compartilhado do webmail
#[derive(Clone)]
pub struct WebmailState {
    // Futuramente: conexão com avila-tissue
}

impl WebmailState {
    pub fn new() -> Self {
        Self {}
    }
}

pub fn routes() -> Router {
    let state = WebmailState::new();

    Router::new()
        .route("/", get(home))
        .route("/inbox", get(inbox))
        .route("/compose", get(compose_page))
        .route("/api/send", post(send_email))
        .route("/api/messages", get(list_messages))
        .with_state(Arc::new(state))
}

async fn home() -> Html<&'static str> {
    Html(r#"
<!DOCTYPE html>
<html>
<head>
    <title>Ávila Webmail</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
        h1 { color: #2c3e50; }
        nav { margin: 20px 0; }
        nav a { margin-right: 20px; color: #3498db; text-decoration: none; }
        nav a:hover { text-decoration: underline; }
        .status { color: #27ae60; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🍄 Ávila Webmail</h1>
        <p class="status">✓ Sistema operacional</p>
        <nav>
            <a href="/inbox">📬 Inbox</a>
            <a href="/compose">✉️ Compose</a>
        </nav>
        <p>Plataforma de email distribuída baseada em arquitetura biológica.</p>
    </div>
</body>
</html>
    "#)
}

async fn inbox(State(state): State<Arc<WebmailState>>) -> Html<String> {
    // Mock de mensagens
    let messages = vec![
        Message {
            id: "1".to_string(),
            from: "alice@avila.inc".to_string(),
            subject: "Bem-vindo ao Ávila Mail".to_string(),
            preview: "Sistema funcionando corretamente...".to_string(),
            timestamp: "2 min atrás".to_string(),
            unread: true,
        },
        Message {
            id: "2".to_string(),
            from: "system@avila.inc".to_string(),
            subject: "Sistema iniciado".to_string(),
            preview: "Todas as células operacionais...".to_string(),
            timestamp: "1 hora atrás".to_string(),
            unread: false,
        },
    ];

    let mut rows = String::new();
    for msg in messages {
        let style = if msg.unread { "font-weight: bold;" } else { "" };
        rows.push_str(&format!(
            r#"<tr style="{}">
                <td>{}</td>
                <td>{}</td>
                <td>{}</td>
                <td>{}</td>
            </tr>"#,
            style, msg.from, msg.subject, msg.preview, msg.timestamp
        ));
    }

    Html(format!(r#"
<!DOCTYPE html>
<html>
<head>
    <title>Inbox - Ávila Webmail</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }}
        .container {{ max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }}
        h1 {{ color: #2c3e50; }}
        nav {{ margin: 20px 0; }}
        nav a {{ margin-right: 20px; color: #3498db; text-decoration: none; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background: #34495e; color: white; }}
        tr:hover {{ background: #f9f9f9; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>📬 Inbox</h1>
        <nav>
            <a href="/">← Home</a>
            <a href="/compose">✉️ Compose</a>
        </nav>
        <table>
            <thead>
                <tr>
                    <th>From</th>
                    <th>Subject</th>
                    <th>Preview</th>
                    <th>Time</th>
                </tr>
            </thead>
            <tbody>
                {}
            </tbody>
        </table>
    </div>
</body>
</html>
    "#, rows))
}

async fn compose_page() -> Html<&'static str> {
    Html(r#"
<!DOCTYPE html>
<html>
<head>
    <title>Compose - Ávila Webmail</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
        h1 { color: #2c3e50; }
        nav { margin: 20px 0; }
        nav a { margin-right: 20px; color: #3498db; text-decoration: none; }
        form { margin-top: 20px; }
        label { display: block; margin-top: 15px; font-weight: bold; }
        input, textarea { width: 100%; padding: 10px; margin-top: 5px; border: 1px solid #ddd; border-radius: 4px; }
        textarea { min-height: 200px; }
        button { margin-top: 20px; padding: 12px 30px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #2980b9; }
    </style>
</head>
<body>
    <div class="container">
        <h1>✉️ Compose Email</h1>
        <nav>
            <a href="/">← Home</a>
            <a href="/inbox">📬 Inbox</a>
        </nav>
        <form action="/api/send" method="POST">
            <label>To:</label>
            <input type="email" name="to" required placeholder="recipient@example.com">

            <label>Subject:</label>
            <input type="text" name="subject" required placeholder="Email subject">

            <label>Body:</label>
            <textarea name="body" required placeholder="Write your message here..."></textarea>

            <button type="submit">Send Email 🚀</button>
        </form>
    </div>
</body>
</html>
    "#)
}

#[derive(Deserialize)]
struct SendEmailRequest {
    to: String,
    subject: String,
    body: String,
}

#[derive(Serialize)]
struct SendEmailResponse {
    success: bool,
    message: String,
    message_id: String,
}

async fn send_email(
    State(state): State<Arc<WebmailState>>,
    Json(req): Json<SendEmailRequest>
) -> impl IntoResponse {
        use avila_tissue::generate_id;

    // Futuramente: integrar com avila-tissue para armazenamento
        let message_id = generate_id();

    println!("📧 Enviando email:");
    println!("   To: {}", req.to);
    println!("   Subject: {}", req.subject);
    println!("   ID: {}", message_id);

    let response = SendEmailResponse {
        success: true,
        message: "Email enqueued for delivery".to_string(),
        message_id,
    };

    (StatusCode::OK, Json(response))
}

#[derive(Serialize)]
struct Message {
    id: String,
    from: String,
    subject: String,
    preview: String,
    timestamp: String,
    unread: bool,
}

#[derive(Deserialize)]
struct ListMessagesQuery {
    #[serde(default)]
    limit: Option<usize>,
}

async fn list_messages(
    State(state): State<Arc<WebmailState>>,
    Query(query): Query<ListMessagesQuery>
) -> Json<Vec<Message>> {
    // Mock data
    let messages = vec![
        Message {
            id: "1".to_string(),
            from: "alice@avila.inc".to_string(),
            subject: "Bem-vindo ao Ávila Mail".to_string(),
            preview: "Sistema funcionando corretamente...".to_string(),
            timestamp: "2 min atrás".to_string(),
            unread: true,
        },
    ];

    Json(messages)
}
