//! Example of compute operations on arrays
//!
//! Demonstrates filtering, aggregation, and arithmetic operations

use avila_arrow::array::{Array, Float64Array, Int64Array, BooleanArray};
use avila_arrow::compute::*;

fn main() {
    println!("=== Avila Arrow Compute Example ===\n");

    // Create temperature data (Celsius)
    let temperatures = Float64Array::from(vec![
        15.5, 23.2, 28.7, 31.5, 22.1, 18.9, 25.3, 29.8, 20.5, 24.6
    ]);

    println!("Temperatures: {:?}", temperatures.values());
    println!("Mean: {:.2}°C", mean_f64(&temperatures).unwrap());
    println!("Min: {:.2}°C", min_f64(&temperatures).unwrap());
    println!("Max: {:.2}°C", max_f64(&temperatures).unwrap());

    // Filter hot days (> 25°C)
    let hot_days = gt_f64(&temperatures, 25.0);
    let hot_temps = filter_f64(&temperatures, &hot_days).unwrap();
    println!("\nHot days (>25°C): {} days", hot_temps.len());
    println!("Hot temps: {:?}", hot_temps.values());

    // Sensor data analysis
    println!("\n=== Sensor Data Analysis ===");
    let sensor1 = Int64Array::from(vec![100, 120, 110, 130, 125]);
    let sensor2 = Int64Array::from(vec![95, 125, 105, 135, 120]);

    println!("Sensor 1: {:?}", sensor1.values());
    println!("Sensor 2: {:?}", sensor2.values());

    let diff = sub_i64(&sensor1, &sensor2).unwrap();
    println!("Difference: {:?}", diff.values());

    let sum_reading = add_i64(&sensor1, &sensor2).unwrap();
    println!("Combined: {:?}", sum_reading.values());
    println!("Total sum: {}", sum_i64(&sum_reading));

    // Sorting example
    println!("\n=== Sorting ===");
    let unsorted = Int64Array::from(vec![42, 7, 23, 91, 15, 3, 68]);
    println!("Original: {:?}", unsorted.values());

    let sorted = sort_i64(&unsorted);
    println!("Sorted: {:?}", sorted.values());

    // Statistical analysis
    println!("\n=== Statistical Analysis ===");
    let data = Float64Array::from(vec![
        10.5, 12.3, 11.8, 9.7, 13.2, 10.9, 12.1, 11.5
    ]);

    let mean = mean_f64(&data).unwrap();
    let min = min_f64(&data).unwrap();
    let max = max_f64(&data).unwrap();

    println!("Data: {:?}", data.values());
    println!("Mean: {:.2}", mean);
    println!("Min: {:.2}", min);
    println!("Max: {:.2}", max);
    println!("Range: {:.2}", max - min);

    // Complex filtering
    println!("\n=== Complex Filtering ===");
    let values = Int64Array::from(vec![5, 15, 25, 35, 45, 55, 65, 75]);

    let above_20 = gt_i64(&values, 20);
    let below_60 = lt_i64(&values, 60);

    // Combine masks (AND operation)
    let combined_mask = BooleanArray::new(
        above_20.values().iter()
            .zip(below_60.values().iter())
            .map(|(&a, &b)| a && b)
            .collect()
    );

    let filtered = filter_i64(&values, &combined_mask).unwrap();
    println!("Values between 20 and 60: {:?}", filtered.values());

    println!("\n✓ Compute operations completed successfully!");
}
