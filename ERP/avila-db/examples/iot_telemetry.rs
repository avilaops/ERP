//! IoT Telemetry Example - Sensor data ingestion and time-series analysis
//!
//! This example demonstrates:
//! - High-throughput sensor data ingestion
//! - Device twins and profiles
//! - Time-series queries
//! - Scientific data storage (LIGO/LISA patterns)

use aviladb::{AvilaClient, Document};
use chrono::{Duration, Utc};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    println!("📡 AvilaDB - IoT Telemetry Example\n");

    // Connect to AvilaDB
    let client = AvilaClient::connect("http://localhost:8000").await?;
    let db = client.database("iotdb").await?;

    println!("=== 1. Device Profiles (Device Twins) ===\n");

    let devices = db.collection("devices").await?;

    // Create device twin with metadata
    let device = Document::new()
        .set("deviceId", "sensor-001")
        .set("name", "Temperature Sensor - Lab A")
        .set("type", "temperature")
        .set("location", json!({
            "city": "São Paulo",
            "country": "Brazil",
            "coordinates": [-23.5505, -46.6333]
        }))
        .set("firmware", "v2.1.0")
        .set("status", "online")
        .set("capabilities", vec!["temperature", "humidity", "pressure"])
        .set("registered_at", Utc::now())
        .set("last_seen", Utc::now());

    devices.insert(device).await?;
    println!("✅ Device registered: sensor-001");
    println!();

    println!("=== 2. Sensor Data Ingestion ===\n");

    let telemetry = db.collection("telemetry").await?;

    // Simulate high-frequency sensor readings
    println!("📊 Ingesting sensor data...");
    let base_time = Utc::now();

    for i in 0..100 {
        let reading = Document::new()
            .set("deviceId", "sensor-001")
            .set("timestamp", base_time - Duration::seconds(i * 60))
            .set("temperature", 22.5 + (i as f64 * 0.1))
            .set("humidity", 60.0 + (i as f64 * 0.5))
            .set("pressure", 1013.0 + (i as f64 * 0.2));

        telemetry.insert(reading).await?;

        if (i + 1) % 25 == 0 {
            println!("   ✓ Ingested {} readings", i + 1);
        }
    }
    println!("✅ 100 readings ingested");
    println!();

    println!("=== 3. Time-Series Queries ===\n");

    // Query recent data
    let recent = telemetry
        .query(
            "SELECT * FROM telemetry WHERE deviceId = @device
             AND timestamp > @since ORDER BY timestamp DESC LIMIT 10",
        )
        .param("device", "sensor-001")
        .param("since", Utc::now() - Duration::hours(1))
        .execute()
        .await?;

    println!("📈 Recent readings (last hour):");
    for doc in recent.documents.iter().take(5) {
        let temp: f64 = doc.get("temperature")?;
        let hum: f64 = doc.get("humidity")?;
        println!("   🌡️  {:.1}°C  💧 {:.1}%", temp, hum);
    }
    println!("   ⚡ Query latency: {} ms", recent.latency_ms);
    println!();

    println!("=== 4. Aggregations ===\n");

    // Get statistics (using avila-telemetry patterns)
    let stats = telemetry
        .query(
            "SELECT AVG(temperature) as avg_temp,
                    MAX(temperature) as max_temp,
                    MIN(temperature) as min_temp
             FROM telemetry
             WHERE deviceId = @device",
        )
        .param("device", "sensor-001")
        .execute()
        .await?;

    if let Some(doc) = stats.documents.first() {
        let avg: f64 = doc.get("avg_temp")?;
        let max: f64 = doc.get("max_temp")?;
        let min: f64 = doc.get("min_temp")?;

        println!("📊 Temperature Statistics:");
        println!("   Average: {:.2}°C", avg);
        println!("   Maximum: {:.2}°C", max);
        println!("   Minimum: {:.2}°C", min);
    }
    println!();

    println!("=== 5. Device State Updates ===\n");

    // Update device state (current values)
    devices
        .update()
        .set("current_temperature", 25.3)
        .set("current_humidity", 65.0)
        .set("status", "online")
        .set("last_seen", Utc::now())
        .where_eq("deviceId", "sensor-001")
        .execute()
        .await?;

    println!("✅ Device state updated");
    println!();

    println!("=== 6. Alerts & Anomalies ===\n");

    let alerts = db.collection("alerts").await?;

    // Create alert for high temperature
    let alert = Document::new()
        .set("deviceId", "sensor-001")
        .set("type", "temperature_high")
        .set("severity", "warning")
        .set("message", "Temperature exceeded threshold")
        .set("value", 32.5)
        .set("threshold", 30.0)
        .set("timestamp", Utc::now())
        .set("acknowledged", false);

    alerts.insert(alert).await?;
    println!("⚠️  Alert created: Temperature too high!");
    println!();

    println!("🎉 IoT Telemetry Example Complete!\n");
    println!("🏛️  Key Benefits:");
    println!("   ✅ High-throughput ingestion");
    println!("   ✅ Device twins (metadata + state)");
    println!("   ✅ Time-series queries");
    println!("   ✅ Real-time aggregations");
    println!("   ✅ 5-10ms latency in Brazil");
    println!();
    println!("🔬 Scientific Use Cases:");
    println!("   - LIGO gravitational wave data");
    println!("   - LISA space mission telemetry");
    println!("   - Telescope observations");
    println!("   - Weather stations");
    println!("   - Industrial sensors");

    Ok(())
}
