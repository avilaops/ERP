use avila_async::*;
use std::time::Duration;

#[test]
fn test_basic_runtime() {
    let rt = Runtime::new();
    let result = rt.block_on(async {
        sleep(Duration::from_millis(10)).await;
        42
    });
    assert_eq!(result, 42);
}

#[test]
fn test_spawn() {
    let rt = Runtime::new();
    rt.block_on(async move {
        rt.spawn(async {
            sleep(Duration::from_millis(5)).await;
        });
        sleep(Duration::from_millis(20)).await;
    });
}

#[test]
fn test_yield_now() {
    let rt = Runtime::new();
    rt.block_on(async {
        for _ in 0..10 {
            yield_now().await;
        }
    });
}

#[test]
fn test_timeout_success() {
    let rt = Runtime::new();
    let result = rt.block_on(async {
        timeout(Duration::from_millis(100), async {
            sleep(Duration::from_millis(10)).await;
            42
        }).await
    });
    assert_eq!(result, Ok(42));
}

#[test]
fn test_timeout_failure() {
    let rt = Runtime::new();
    let result = rt.block_on(async {
        timeout(Duration::from_millis(10), async {
            sleep(Duration::from_millis(100)).await;
            42
        }).await
    });
    assert!(result.is_err());
}

#[test]
fn test_channel() {
    let rt = Runtime::new();
    rt.block_on(async move {
        let (tx, rx) = channel::bounded::<i32>(10);

        rt.spawn(async move {
            for i in 0..5 {
                tx.send(i).await.unwrap();
            }
        });

        let mut sum = 0;
        for _ in 0..5 {
            if let Some(val) = rx.recv().await {
                sum += val;
            }
        }
        assert_eq!(sum, 10);
    });
}

#[test]
fn test_join_handle() {
    let rt = Runtime::new();
    rt.block_on(async move {
        let handle = rt.spawn_with_handle(async {
            sleep(Duration::from_millis(10)).await;
            100
        });

        let result = handle.await_result().await;
        assert_eq!(result, Some(100));
    });
}

#[test]
fn test_multiple_tasks() {
    let rt = Runtime::new();
    rt.block_on(async move {
        let mut handles = vec![];

        for i in 0..10 {
            let handle = rt.spawn_with_handle(async move {
                sleep(Duration::from_millis(1)).await;
                i * 2
            });
            handles.push(handle);
        }

        let mut results = vec![];
        for handle in handles {
            if let Some(val) = handle.await_result().await {
                results.push(val);
            }
        }

        assert_eq!(results.len(), 10);
    });
}
