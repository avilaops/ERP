# avila-error

**Unified error handling system for the Avila ecosystem.**

[![Crates.io](https://img.shields.io/crates/v/avila-error.svg)](https://crates.io/crates/avila-error)
[![Documentation](https://docs.rs/avila-error/badge.svg)](https://docs.rs/avila-error)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)

## Features

- **Zero Dependencies** - Pure Rust (except derive macros)
- **Rich Error Context** - Chain context information
- **Error Categories** - 15+ predefined error kinds
- **Derive Macros** - Automatic trait implementations
- **no_std Compatible** - Works in embedded environments
- **Backtrace Support** - Optional std backtrace integration
- **Type-Safe** - Compile-time error handling

## Error Kinds

- `InvalidInput` - Bad input data
- `NotFound` - Resource missing
- `PermissionDenied` - Access denied
- `ConnectionFailed` - Network error
- `Timeout` - Operation timeout
- `DataCorruption` - Corrupted data
- `ConfigError` - Configuration issue
- `AuthenticationFailed` - Auth failure
- `AuthorizationFailed` - Permission failure
- `AlreadyExists` - Duplicate resource
- `ResourceExhausted` - Out of resources
- `Cancelled` - Operation cancelled
- `Internal` - Internal error
- `NotImplemented` - Feature not implemented
- `Unavailable` - Service unavailable
- `Unknown` - Unknown error

## Examples

### Basic Usage

```rust
use avila_error::{Error, ErrorKind, Result};

fn load_config(path: &str) -> Result<Config> {
    if path.is_empty() {
        return Err(Error::new(
            ErrorKind::InvalidInput,
            "Path cannot be empty"
        ));
    }

    // ...
    Ok(Config::default())
}
```

### Error Context

```rust
use avila_error::{Result, ResultExt};

fn parse_file(path: &str) -> Result<Data> {
    read_file(path)
        .context("Failed to read file")?;

    parse_json(contents)
        .with_context(|| format!("Failed to parse {}", path))?;

    Ok(data)
}
```

### Custom Errors with Derive

```rust
use avila_error::Error as AvilaError;

#[derive(Debug, AvilaError)]
enum MyError {
    IoError(std::io::Error),
    ParseError(String),
    Custom { code: i32, message: String },
}
```

### Error Matching

```rust
use avila_error::{Error, ErrorKind};

match error.kind() {
    ErrorKind::NotFound => {
        // Handle missing resource
    },
    ErrorKind::PermissionDenied => {
        // Handle access denied
    },
    _ => {
        // Handle other errors
    }
}
```

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
avila-error = "0.3.0"
```

With derive macros:

```toml
[dependencies]
avila-error = { version = "0.3.0", features = ["derive"] }
```

For `no_std` environments:

```toml
[dependencies]
avila-error = { version = "0.3.0", default-features = false }
```

## Integration

All Avila crates use `avila-error` as the foundation:

```rust
// In avila-db
pub type Result<T> = avila_error::Result<T>;

// In avila-http
impl From<HttpError> for avila_error::Error {
    fn from(err: HttpError) -> Self {
        // Convert to avila_error::Error
    }
}
```

## License

Licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.
