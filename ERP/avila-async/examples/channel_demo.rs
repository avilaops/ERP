use avila_async::{Runtime, channel};
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.block_on(async move {
        let (tx, rx) = channel::bounded::<String>(10);

        // Spawn producer task
        rt.spawn({
            let tx = tx.clone();
            async move {
                for i in 0..5 {
                    let msg = format!("Message {}", i);
                    println!("Sending: {}", msg);
                    tx.send(msg).await.unwrap();
                    avila_async::sleep(Duration::from_millis(500)).await;
                }
            }
        });

        // Spawn another producer
        rt.spawn({
            async move {
                for i in 0..5 {
                    let msg = format!("Urgent {}", i);
                    println!("Sending: {}", msg);
                    tx.send(msg).await.unwrap();
                    avila_async::sleep(Duration::from_millis(300)).await;
                }
            }
        });

        // Receive messages
        let mut count = 0;
        while let Some(msg) = rx.recv().await {
            println!("Received: {}", msg);
            count += 1;
            if count >= 10 {
                break;
            }
        }

        println!("All messages received!");
    });
}
