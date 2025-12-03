use avila_async::Runtime;
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.block_on(async move {
        println!("Spawning 100 concurrent tasks...");

        let mut handles = vec![];

        for i in 0..100 {
            let handle = rt.spawn_with_handle(async move {
                avila_async::sleep(Duration::from_millis(10)).await;
                i * i
            });
            handles.push(handle);
        }

        println!("Waiting for all tasks to complete...");

        let mut sum = 0;
        for handle in handles {
            if let Some(result) = handle.await_result().await {
                sum += result;
            }
        }

        println!("Sum of squares from 0 to 99: {}", sum);
        println!("Active tasks: {}", rt.task_count());
    });
}
