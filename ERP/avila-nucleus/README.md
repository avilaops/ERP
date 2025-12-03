# Avila Nucleus

**Low-level cryptographic primitives and bit-manipulation operations**

## Overview

`avila-nucleus` provides foundational building blocks for cryptographic operations, including constant-time comparisons, bit manipulation, SIMD operations, and mathematical primitives used throughout the Avila ecosystem.

## Features

- **Constant-Time Operations**: Timing-attack resistant comparisons and operations
- **Bit Manipulation**: Efficient bit-level operations for 256-bit, 512-bit, and larger integers
- **SIMD Support**: Hardware-accelerated operations for x86_64 architectures
- **Arithmetic Primitives**: Addition, subtraction, multiplication, division for big integers
- **Modular Arithmetic**: Montgomery multiplication and reduction
- **Endianness Conversions**: Little-endian byte array operations

## Modules

### `bits`
Low-level bit manipulation and arithmetic operations:
- `u256_ops`: 256-bit unsigned integer operations
- `u512_ops`: 512-bit unsigned integer operations
- `u1024_ops`: 1024-bit unsigned integer operations
- `u2048_ops`: 2048-bit unsigned integer operations
- `u4096_ops`: 4096-bit unsigned integer operations

### `simd`
SIMD-accelerated operations (x86_64):
- Parallel processing for cryptographic operations
- Hardware acceleration when available

### Core Operations

#### Constant-Time Equality
```rust
use avila_nucleus::bits::eq256;

let a = [1u64, 2, 3, 4];
let b = [1u64, 2, 3, 4];
assert!(eq256(&a, &b));
```

#### Big Integer Arithmetic
```rust
use avila_nucleus::bits::u256_ops::*;

let a = [100u64, 0, 0, 0];
let b = [50u64, 0, 0, 0];
let (sum, carry) = add256(&a, &b);
assert_eq!(sum[0], 150);
```

#### Division with Remainder
```rust
use avila_nucleus::bits::u256_ops::*;

let dividend = [107u64, 0, 0, 0];
let divisor = [10u64, 0, 0, 0];
let (quotient, remainder) = div256(&dividend, &divisor);
assert_eq!(quotient[0], 10);
assert_eq!(remainder[0], 7);
```

## Security Considerations

All operations in this crate are designed with security in mind:

- **Constant-time operations** prevent timing attacks
- **No branching** on secret data
- **Careful carry propagation** in arithmetic operations
- **Secure memory handling** for sensitive data

## Performance

The crate is optimized for:
- Zero-cost abstractions
- Minimal allocations (mostly stack-based)
- Cache-friendly memory access patterns
- SIMD acceleration where available

## Testing

Run the test suite:
```bash
cargo test
```

Current test coverage: **47 tests passing**

## Dependencies

- `core` only (no_std compatible)
- Optional SIMD support requires x86_64 architecture

## License

Part of the Avila cryptographic suite.

## Related Crates

- `avila-primitives`: High-level big integer types using these primitives
- `avila-crypto`: Cryptographic algorithms built on these foundations
- `avila-atom`: Thread-safe atomic operations

## Contributing

When adding new operations:
1. Ensure constant-time behavior for security-sensitive code
2. Add comprehensive tests including edge cases
3. Document security properties and performance characteristics
4. Maintain no_std compatibility
