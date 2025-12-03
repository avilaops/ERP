# avila-alloc

**Stack-first memory allocation strategies for the Avila ecosystem.**

[![Crates.io](https://img.shields.io/crates/v/avila-alloc.svg)](https://crates.io/crates/avila-alloc)
[![Documentation](https://docs.rs/avila-alloc/badge.svg)](https://docs.rs/avila-alloc)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)

## Features

- **Stack-First** - Prefer stack allocation over heap
- **StackVec** - Fixed-capacity vector on the stack
- **Arena Allocator** - Bump allocation for temporary data
- **Object Pools** - Pre-allocated fixed-size pools
- **Zero Heap** - All core types work without heap
- **no_std Compatible** - Works in embedded environments
- **Thread-Safe** - Lock-free data structures

## Core Types

### StackVec - Stack-Allocated Vector

```rust
use avila_alloc::StackVec;

let mut vec = StackVec::<u32, 16>::new();
vec.push(1);
vec.push(2);
vec.push(3);

assert_eq!(vec.len(), 3);
assert_eq!(vec.capacity(), 16);
```

### StackString - Stack-Allocated String

```rust
use avila_alloc::StackString;

let mut s = StackString::<32>::new();
s.push_str("Hello, ").unwrap();
s.push_str("Avila!").unwrap();

assert_eq!(s.as_str(), "Hello, Avila!");
```

### Arena - Bump Allocator

```rust
use avila_alloc::Arena;

let mut arena = Arena::new();

// Allocate a slice
let numbers = arena.alloc_slice::<u64>(100);
numbers[0] = 42;

// Allocate a single value
let value = arena.alloc(123);
assert_eq!(*value, 123);

// Reset for reuse
arena.reset();
```

### Pool - Fixed-Size Object Pool

```rust
use avila_alloc::Pool;

let mut pool = Pool::<Data, 256>::new();

// Allocate from pool
let obj1 = pool.alloc(Data::new()).unwrap();
let obj2 = pool.alloc(Data::new()).unwrap();

// Deallocate back to pool
unsafe {
    pool.dealloc(obj1 as *mut Data);
}
```

## Philosophy

Avila follows a **stack-first** allocation strategy:

1. **Stack by Default** - Use stack-allocated types when possible
2. **Predictable Performance** - No surprise allocations
3. **Deterministic Behavior** - No hidden heap usage
4. **Cache-Friendly** - Stack data is cache-local
5. **Embedded-Ready** - Works without allocator

## Performance

Stack allocation is typically **10-100x faster** than heap:

- **StackVec**: ~1ns per operation
- **Arena**: ~2-5ns per allocation
- **Pool**: ~3-7ns per alloc/dealloc
- **Vec (heap)**: ~50-200ns per allocation

## Use Cases

### Database Operations (AvilaDB)

```rust
// Query results on stack
let mut results = StackVec::<Row, 1000>::new();
db.query("SELECT * FROM users", &mut results)?;
```

### HTTP Request Handling

```rust
// Headers on stack
let mut headers = StackVec::<Header, 32>::new();
parse_headers(request, &mut headers)?;
```

### Temporary Computation

```rust
// Arena for request-scoped allocations
let mut arena = Arena::new();
let temp_buffer = arena.alloc_slice::<u8>(4096);
process_request(temp_buffer)?;
// arena dropped, all memory freed at once
```

## Installation

```toml
[dependencies]
avila-alloc = "0.1.0"
```

For `no_std`:

```toml
[dependencies]
avila-alloc = { version = "0.1.0", default-features = false }
```

## Integration

All Avila crates use `avila-alloc` for memory management:

```rust
// In avila-db
use avila_alloc::StackVec;
pub type ResultSet = StackVec<Row, 1000>;

// In avila-http
use avila_alloc::Arena;
pub struct RequestContext {
    arena: Arena,
}
```

## License

Licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.
