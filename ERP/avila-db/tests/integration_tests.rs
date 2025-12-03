//! Integration tests for AvilaDB SDK

use aviladb::{AvilaClient, Document, Config};
use chrono::Utc;

#[tokio::test]
async fn test_client_connection() {
    let client = AvilaClient::connect("http://localhost:8000").await;
    assert!(client.is_ok(), "Failed to connect to AvilaDB");
}

#[tokio::test]
async fn test_document_crud() {
    let client = AvilaClient::connect("http://localhost:8000")
        .await
        .expect("Failed to connect");

    let db = client.database("test_db").await.expect("Failed to get database");
    let collection = db.collection("test_collection").await.expect("Failed to get collection");

    // Insert
    let doc = Document::new()
        .set("testId", "test123")
        .set("name", "Test Document")
        .set("value", 42)
        .set("active", true);

    let result = collection.insert(doc).await;
    assert!(result.is_ok(), "Failed to insert document");

    let insert_result = result.unwrap();
    assert!(!insert_result.id.is_empty(), "Document ID should not be empty");
    assert!(insert_result.compression_ratio > 0.0, "Compression ratio should be positive");

    // Query
    let query_result = collection
        .query("SELECT * FROM test_collection WHERE testId = @id")
        .param("id", "test123")
        .execute()
        .await;

    assert!(query_result.is_ok(), "Failed to query documents");
    let docs = query_result.unwrap();
    assert!(!docs.documents.is_empty(), "Should find at least one document");

    // Update
    let update_result = collection
        .update()
        .set("value", 43)
        .where_eq("testId", "test123")
        .execute()
        .await;

    assert!(update_result.is_ok(), "Failed to update document");

    // Delete
    let delete_result = collection
        .delete()
        .where_eq("testId", "test123")
        .execute()
        .await;

    assert!(delete_result.is_ok(), "Failed to delete document");
}

#[tokio::test]
async fn test_document_size_limit() {
    let doc = Document::new()
        .set("id", "large")
        .set("data", vec![0u8; 5 * 1024 * 1024]); // 5 MB - exceeds 4 MB limit

    let result = doc.validate();
    assert!(result.is_err(), "Should reject documents larger than 4 MB");
}

#[tokio::test]
async fn test_batch_insert() {
    let client = AvilaClient::connect("http://localhost:8000")
        .await
        .expect("Failed to connect");

    let db = client.database("test_db").await.expect("Failed to get database");
    let collection = db.collection("batch_test").await.expect("Failed to get collection");

    let docs: Vec<Document> = (0..10)
        .map(|i| {
            Document::new()
                .set("batchId", format!("batch_{}", i))
                .set("index", i)
                .set("timestamp", Utc::now())
        })
        .collect();

    let result = collection.batch_insert(docs).await;
    assert!(result.is_ok(), "Failed to batch insert documents");
}

#[tokio::test]
async fn test_config_validation() {
    let valid_config = Config::default();
    assert!(valid_config.validate().is_ok(), "Default config should be valid");

    let invalid_config = Config {
        max_connections: 0,
        ..Default::default()
    };
    assert!(invalid_config.validate().is_err(), "Zero connections should be invalid");

    let oversized_doc_config = Config {
        max_document_size: 5 * 1024 * 1024, // 5 MB
        ..Default::default()
    };
    assert!(
        oversized_doc_config.validate().is_err(),
        "Document size > 4 MB should be invalid"
    );
}

#[tokio::test]
async fn test_query_with_parameters() {
    let client = AvilaClient::connect("http://localhost:8000")
        .await
        .expect("Failed to connect");

    let db = client.database("test_db").await.expect("Failed to get database");
    let collection = db.collection("param_test").await.expect("Failed to get collection");

    // Insert test data
    for i in 1..=5 {
        collection
            .insert(
                Document::new()
                    .set("userId", format!("user{}", i))
                    .set("level", i * 10),
            )
            .await
            .ok();
    }

    // Query with parameter
    let result = collection
        .query("SELECT * FROM param_test WHERE level > @min")
        .param("min", 25)
        .execute()
        .await;

    assert!(result.is_ok(), "Failed to query with parameters");
    let docs = result.unwrap();
    assert!(docs.documents.len() >= 2, "Should find at least 2 documents with level > 25");
}

#[tokio::test]
async fn test_compression() {
    let client = AvilaClient::connect("http://localhost:8000")
        .await
        .expect("Failed to connect");

    let db = client.database("test_db").await.expect("Failed to get database");
    let collection = db.collection("compression_test").await.expect("Failed to get collection");

    // Insert document with repetitive data (highly compressible)
    let repetitive_data = "A".repeat(1000);
    let doc = Document::new()
        .set("id", "compress_test")
        .set("data", repetitive_data);

    let result = collection.insert(doc).await;
    assert!(result.is_ok(), "Failed to insert document");

    let insert_result = result.unwrap();
    assert!(
        insert_result.compression_ratio > 1.0,
        "Compression ratio should be > 1.0 for repetitive data"
    );
}
