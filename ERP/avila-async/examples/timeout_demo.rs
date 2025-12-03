use avila_async::{Runtime, timeout, sleep};
use std::time::Duration;

async fn slow_operation() -> i32 {
    sleep(Duration::from_secs(5)).await;
    42
}

async fn fast_operation() -> i32 {
    sleep(Duration::from_millis(100)).await;
    100
}

fn main() {
    let rt = Runtime::new();

    rt.block_on(async {
        // This will timeout
        match timeout(Duration::from_secs(1), slow_operation()).await {
            Ok(val) => println!("Slow operation completed: {}", val),
            Err(_) => println!("Slow operation timed out!"),
        }

        // This will succeed
        match timeout(Duration::from_secs(1), fast_operation()).await {
            Ok(val) => println!("Fast operation completed: {}", val),
            Err(_) => println!("Fast operation timed out!"),
        }
    });
}
