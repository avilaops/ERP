use avila_async::{Runtime, sleep};
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.block_on(async {
        println!("Hello from Avila Async!");

        sleep(Duration::from_secs(1)).await;

        println!("One second later...");
    });
}
