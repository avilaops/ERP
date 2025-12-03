use sqlx::{Pool, Sqlite, SqlitePool};

pub type DbPool = Pool<Sqlite>;

pub async fn connect(database_url: &str) -> anyhow::Result<DbPool> {
    let pool = SqlitePool::connect(database_url).await?;
    Ok(pool)
}
