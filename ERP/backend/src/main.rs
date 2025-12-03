use avila_erp::{Config, routes};
use axum::Router;
use tower_http::cors::CorsLayer;
use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Inicializar telemetria
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,avila_erp=debug".into()),
        )
        .json()
        .init();

    info!("🚀 Iniciando Avila ERP Server");

    // Carregar configuração
    let config = Config::from_env()?;

    // Conectar ao banco de dados
    let pool = avila_erp::db::connect(&config.database_url).await?;

    // Executar migrations
    sqlx::migrate!("../database/migrations")
        .run(&pool)
        .await?;

    info!("✅ Banco de dados conectado e migrations aplicadas");

    // Criar aplicação
    let app = Router::new()
        .nest("/api/v1", routes::create_routes(pool.clone()))
        .layer(CorsLayer::permissive());

    let addr = format!("{}:{}", config.host, config.port);
    info!("🌐 Servidor rodando em http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
