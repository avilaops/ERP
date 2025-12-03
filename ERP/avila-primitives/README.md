# avila-primitives

**Primitive types and core abstractions for the Avila ecosystem.**

[![Crates.io](https://img.shields.io/crates/v/avila-primitives.svg)](https://crates.io/crates/avila-primitives)
[![Documentation](https://docs.rs/avila-primitives/badge.svg)](https://docs.rs/avila-primitives)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)

## Features

- **Zero Dependencies** - Pure Rust, no external crates
- **Stack-First** - Fixed-size types allocated on stack
- **const fn** - Maximum compile-time computation
- **no_std Compatible** - Works in embedded environments
- **Constant-Time Ops** - Security-critical operations

## Types

### Fixed-Size Integers
- `U64`, `U128` - Type aliases for consistency
- `U256` - 256-bit integer (4 × u64 limbs)
- `U512` - 512-bit integer (8 × u64 limbs)
- `U1024`, `U2048`, `U4096` - Larger types (array of limbs)

### Byte Arrays
- `Bytes32` - 32-byte array (256 bits)
- `Bytes64` - 64-byte array (512 bits)

### Traits
- `BitOps` - Bit manipulation
- `CountBits` - Type metadata
- `FromBytes` / `ToBytes` - Conversions
- `ByteArray` - Byte array operations

## Examples

### Basic Usage

```rust
use avila_primitives::prelude::*;

// Create U256 from u64
let a = U256::from_u64(42);
let b = U256::from_u64(8);

// Arithmetic
let sum = a + b;
assert_eq!(sum.to_u64(), 50);

// Checked operations
let overflow = U256::MAX.checked_add(&U256::ONE);
assert!(overflow.is_none());
```

### Byte Operations

```rust
use avila_primitives::{Bytes32, ByteArray};

let mut data = Bytes32::ZERO;
data.0[0] = 0xFF;

// Zeroize (security)
data.zeroize();
assert_eq!(data.0, [0u8; 32]);
```

### Constant-Time Operations

```rust
use avila_primitives::bits::{ct_select_u64, ct_eq_u64};

// Constant-time selection (no branches)
let secret = ct_select_u64(condition, value_a, value_b);

// Constant-time comparison
assert!(ct_eq_u64(secret, expected));
```

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
avila-primitives = "0.1.0"
```

For `no_std` environments:

```toml
[dependencies]
avila-primitives = { version = "0.1.0", default-features = false }
```

## License

Licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.

## Contribution

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md).
