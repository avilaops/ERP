# Avila Async

[![Crates.io](https://img.shields.io/crates/v/avila-async.svg)](https://crates.io/crates/avila-async)
[![Documentation](https://docs.rs/avila-async/badge.svg)](https://docs.rs/avila-async)
[![License](https://img.shields.io/badge/license-MIT%2FApache--2.0-blue.svg)](LICENSE)

Native async runtime for Rust - A lightweight, high-performance alternative to Tokio using only Rust std.

## Features

- 🚀 **Zero external dependencies** - Pure Rust std implementation
- ⚡ **Work-stealing scheduler** - Efficient multi-threaded task execution
- 🔄 **Async I/O primitives** - Non-blocking TCP networking
- 📬 **Channel support** - Message passing between tasks
- ⏱️ **Timeout support** - Execute futures with time limits
- 🛑 **Graceful shutdown** - Proper cleanup and task completion
- 🎯 **JoinHandle** - Await task results
- 🔧 **Simple API** - Easy to use and understand

## Installation

Add this to your `Cargo.toml`:

```toml
[dependencies]
avila-async = "0.1"
```

## Quick Start

### Basic Example

```rust
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
```

### Spawning Tasks

```rust
use avila_async::Runtime;

fn main() {
    let rt = Runtime::new();

    rt.block_on(async {
        // Spawn a task without waiting for result
        rt.spawn(async {
            println!("Background task running!");
        });

        // Spawn a task and get a handle
        let handle = rt.spawn_with_handle(async {
            42
        });

        let result = handle.await_result().await;
        println!("Result: {:?}", result);
    });
}
```

### Using Channels

```rust
use avila_async::{Runtime, channel};

fn main() {
    let rt = Runtime::new();

    rt.block_on(async {
        let (tx, rx) = channel::bounded::<i32>(10);

        rt.spawn(async move {
            for i in 0..5 {
                tx.send(i).await.unwrap();
            }
        });

        while let Some(val) = rx.recv().await {
            println!("Received: {}", val);
        }
    });
}
```

### Timeout Operations

```rust
use avila_async::{Runtime, timeout, sleep};
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.block_on(async {
        let result = timeout(Duration::from_secs(1), async {
            sleep(Duration::from_millis(100)).await;
            42
        }).await;

        match result {
            Ok(val) => println!("Success: {}", val),
            Err(_) => println!("Timeout!"),
        }
    });
}
```

### TCP Server

```rust
use avila_async::{Runtime, net::TcpListener};
use std::net::SocketAddr;

fn main() {
    let rt = Runtime::new();

    rt.block_on(async {
        let addr: SocketAddr = "127.0.0.1:8080".parse().unwrap();
        let listener = TcpListener::bind(addr).await.unwrap();
        println!("Listening on {}", addr);

        loop {
            let (mut stream, peer) = listener.accept().await.unwrap();
            println!("Connection from {}", peer);

            rt.spawn(async move {
                let mut buf = vec![0u8; 1024];
                if let Ok(n) = stream.read(&mut buf).await {
                    stream.write_all(&buf[..n]).await.ok();
                }
            });
        }
    });
}
```

## API Overview

### Runtime

- `Runtime::new()` - Create a new runtime instance
- `runtime.block_on(future)` - Block current thread and execute future
- `runtime.spawn(future)` - Spawn a fire-and-forget task
- `runtime.spawn_with_handle(future)` - Spawn task and return JoinHandle
- `runtime.shutdown()` - Initiate graceful shutdown
- `runtime.task_count()` - Get number of active tasks

### Async Functions

- `sleep(duration)` - Sleep for specified duration
- `yield_now()` - Yield execution to other tasks
- `timeout(duration, future)` - Execute future with timeout

### Channels

- `channel::bounded(capacity)` - Create bounded channel
- `channel::unbounded()` - Create unbounded channel
- `sender.send(value)` - Send value through channel
- `receiver.recv()` - Receive value from channel

### Network

- `TcpListener::bind(addr)` - Bind TCP listener
- `listener.accept()` - Accept incoming connection
- `TcpStream::connect(addr)` - Connect to remote address
- `stream.read(buf)` - Read data from stream
- `stream.write(buf)` - Write data to stream
- `stream.write_all(buf)` - Write all data to stream

## Examples

Run examples with:

```bash
cargo run --example hello_world
cargo run --example channel_demo
cargo run --example timeout_demo
cargo run --example parallel_tasks
```

## Performance

Avila Async is designed for:
- Low latency task scheduling
- Efficient CPU utilization with work-stealing
- Minimal memory overhead
- Zero-cost abstractions

## Comparison with Tokio

| Feature | Avila Async | Tokio |
|---------|-------------|-------|
| Dependencies | 0 | Many |
| Size | Small | Large |
| Complexity | Simple | Complex |
| Ecosystem | Growing | Mature |
| I/O Driver | Basic | Advanced |

## Limitations

- Basic I/O implementation (no io_uring, epoll, etc.)
- Limited ecosystem compared to Tokio
- No timer wheel optimization
- Designed for learning and simple use cases

## Roadmap

- [ ] epoll/kqueue/IOCP support
- [ ] Timer wheel for efficient timeouts
- [ ] async-std compatibility layer
- [ ] More I/O primitives (UDP, Unix sockets)
- [ ] Tracing and metrics
- [ ] Rate limiting
- [ ] Task priorities

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.

## Author

Nícolas Ávila <nicolas@avila.inc>
