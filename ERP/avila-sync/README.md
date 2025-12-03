# avila-sync

**Lock-free synchronization primitives for concurrent programming.**

[![Crates.io](https://img.shields.io/crates/v/avila-sync.svg)](https://crates.io/crates/avila-sync)
[![Documentation](https://docs.rs/avila-sync/badge.svg)](https://docs.rs/avila-sync)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)

## Features

- **Lock-Free** - Wait-free atomic operations
- **AtomicCell** - Generic atomic storage for any Copy type
- **SeqLock** - Optimized for high read/low write scenarios
- **SpinLock** - Lightweight spinning mutex
- **AtomicCounter** - Thread-safe counter with CAS
- **no_std Compatible** - Works in embedded environments
- **Zero Allocation** - All operations stack-based

## Core Types

### AtomicCell - Generic Atomic Storage

```rust
use avila_sync::AtomicCell;

let cell = AtomicCell::new(42u64);
cell.store(100);
assert_eq!(cell.load(), 100);

let old = cell.swap(200);
assert_eq!(old, 100);
```

### SeqLock - Read-Optimized Lock

Perfect for scenarios with frequent reads and rare writes:

```rust
use avila_sync::SeqLock;

let lock = SeqLock::new(Data { x: 1, y: 2 });

// Readers are lock-free
let data = lock.read();

// Writers acquire exclusive access
lock.write(Data { x: 3, y: 4 });
```

### SpinLock - Lightweight Mutex

```rust
use avila_sync::SpinLock;

let lock = SpinLock::new(vec![1, 2, 3]);

{
    let mut data = lock.lock();
    data.push(4);
}

// Lock released automatically
```

### AtomicCounter - Thread-Safe Counter

```rust
use avila_sync::AtomicCounter;

let counter = AtomicCounter::new(0);

// Atomic increment
counter.increment();
counter.increment();
assert_eq!(counter.get(), 2);

// Compare-and-swap
counter.compare_and_swap(2, 10).unwrap();
assert_eq!(counter.get(), 10);
```

## Performance

Lock-free operations provide predictable latency:

- **AtomicCell**: ~2-5 CPU cycles
- **SeqLock read**: ~10-20 cycles (lock-free)
- **SeqLock write**: ~50-100 cycles
- **SpinLock**: ~30-100 cycles (uncontended)
- **AtomicCounter**: ~5-10 cycles per operation

## Use Cases

### Shared Configuration (SeqLock)

```rust
static CONFIG: SeqLock<Config> = SeqLock::new(Config::default());

// Hot path - lock-free reads
fn handle_request() {
    let config = CONFIG.read();
    // Use config...
}

// Cold path - exclusive writes
fn update_config(new_config: Config) {
    CONFIG.write(new_config);
}
```

### Statistics Collection (AtomicCounter)

```rust
static REQUESTS: AtomicCounter = AtomicCounter::new(0);
static ERRORS: AtomicCounter = AtomicCounter::new(0);

fn process_request() {
    REQUESTS.increment();

    if let Err(_) = handle() {
        ERRORS.increment();
    }
}
```

### Concurrent Data Structure

```rust
use avila_sync::SpinLock;

struct ConcurrentQueue<T> {
    items: SpinLock<Vec<T>>,
}

impl<T> ConcurrentQueue<T> {
    fn push(&self, item: T) {
        self.items.lock().push(item);
    }

    fn pop(&self) -> Option<T> {
        self.items.lock().pop()
    }
}
```

## Installation

```toml
[dependencies]
avila-sync = "0.1.0"
```

For `no_std`:

```toml
[dependencies]
avila-sync = { version = "0.1.0", default-features = false }
```

## Integration

Used throughout the Avila ecosystem:

```rust
// In avila-db
use avila_sync::SeqLock;
static DB_CONFIG: SeqLock<DbConfig> = SeqLock::new(DbConfig::default());

// In avila-http
use avila_sync::AtomicCounter;
static ACTIVE_CONNECTIONS: AtomicCounter = AtomicCounter::new(0);

// In avila-queue
use avila_sync::SpinLock;
struct Queue<T> {
    data: SpinLock<Vec<T>>,
}
```

## License

Licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.
