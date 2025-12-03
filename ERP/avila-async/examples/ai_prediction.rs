//! Example: AI/ML Workload Prediction
//!
//! Demonstrates AI-powered predictive capabilities for workload optimization

use avila_async::{Runtime, WorkloadPredictor, sleep};
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.spawn(async {
        println!("🤖 AI/ML Workload Prediction Demo");
        println!("=====================================\n");

        // Create workload predictor
        let predictor = WorkloadPredictor::new(10, 0.3);

        // Simulate workload patterns
        println!("📊 Training predictor with workload samples...\n");

        // Morning pattern - increasing load
        for i in 0..5 {
            let load = 10.0 + (i as f64 * 5.0);
            predictor.record(load);
            println!("  Sample {}: Load = {:.1} tasks/sec", i + 1, load);
            sleep(Duration::from_millis(100)).await;
        }

        // Get prediction
        if let Some(prediction) = predictor.predict() {
            println!("\n🔮 Prediction:");
            println!("  Expected load: {:.1} tasks/sec", prediction.predicted_value);
            println!("  Confidence: {:.1}%", prediction.confidence * 100.0);
            println!("  Trend: {:?}", prediction.trend);
        }

        // Afternoon pattern - stable high load
        println!("\n📊 Stable high load pattern...\n");
        for i in 0..5 {
            let load = 45.0 + (i as f64 * 0.5);
            predictor.record(load);
            println!("  Sample {}: Load = {:.1} tasks/sec", i + 6, load);
            sleep(Duration::from_millis(100)).await;
        }

        if let Some(prediction) = predictor.predict() {
            println!("\n🔮 Updated Prediction:");
            println!("  Expected load: {:.1} tasks/sec", prediction.predicted_value);
            println!("  Confidence: {:.1}%", prediction.confidence * 100.0);
            println!("  Trend: {:?}", prediction.trend);
        }

        // Evening pattern - decreasing load
        println!("\n📊 Decreasing load pattern...\n");
        for i in 0..5 {
            let load = 50.0 - (i as f64 * 8.0);
            predictor.record(load);
            println!("  Sample {}: Load = {:.1} tasks/sec", i + 11, load);
            sleep(Duration::from_millis(100)).await;
        }

        if let Some(prediction) = predictor.predict() {
            println!("\n🔮 Final Prediction:");
            println!("  Expected load: {:.1} tasks/sec", prediction.predicted_value);
            println!("  Confidence: {:.1}%", prediction.confidence * 100.0);
            println!("  Trend: {:?}", prediction.trend);

            // Recommendation
            match prediction.trend {
                avila_async::ai::WorkloadTrend::Increasing => {
                    println!("\n💡 Recommendation: Scale up resources to handle increasing load");
                }
                avila_async::ai::WorkloadTrend::Decreasing => {
                    println!("\n💡 Recommendation: Scale down resources to save costs");
                }
                avila_async::ai::WorkloadTrend::Stable => {
                    println!("\n💡 Recommendation: Maintain current resource allocation");
                }
            }
        }

        println!("\n✅ AI/ML prediction demo complete!");
    });

    rt.run();
}
