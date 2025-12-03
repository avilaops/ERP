# Contributing to avila-parallel

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## 🤝 Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something great together.

## 🎯 Ways to Contribute

### 1. Bug Reports

Found a bug? Please open an issue with:
- **Clear title**: Describe the problem succinctly
- **Reproduction steps**: Minimal code to reproduce
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**: Rust version, OS, CPU cores
- **Relevant logs**: Error messages or backtraces

**Example:**
```markdown
**Title:** panic in parallel_map with empty input

**Description:**
Calling `parallel_map` on an empty slice causes a panic.

**Reproduction:**
\`\`\`rust
use avila_parallel::executor::parallel_map;
let data: Vec<i32> = vec![];
let result = parallel_map(&data, |x| x * 2); // panics here
\`\`\`

**Environment:**
- Rust 1.75.0
- Windows 11
- 12 cores
```

### 2. Feature Requests

Have an idea? Open an issue with:
- **Use case**: Why is this needed?
- **Proposed API**: How would it look?
- **Alternatives**: Other ways to achieve this?
- **Implementation ideas**: (optional)

### 3. Performance Improvements

Found a bottleneck? We'd love to hear about it:
- **Benchmark code**: Show the slow case
- **Profiling data**: Use `cargo flamegraph` or similar
- **Proposed solution**: What could be faster?
- **Trade-offs**: Any downsides?

### 4. Documentation

Docs can always be better:
- Fix typos or unclear wording
- Add examples
- Improve API documentation
- Write guides or tutorials

### 5. Code Contributions

Want to write code? Great! See below for guidelines.

## 🛠️ Development Setup

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install development tools
cargo install cargo-edit
cargo install cargo-flamegraph
```

### Clone and Build

```bash
git clone https://github.com/your-org/avila-parallel
cd avila-parallel
cargo build
cargo test
```

### Running Tests

```bash
# All tests
cargo test

# With output
cargo test -- --nocapture

# Specific test
cargo test test_parallel_map

# Release mode (faster)
cargo test --release
```

### Running Examples

```bash
# Basic usage
cargo run --example basic_usage

# Performance comparison
cargo run --example performance_comparison --release

# Advanced operations
cargo run --example advanced_operations --release

# Real-world benchmarks
cargo run --example real_world_benchmark --release
```

### Benchmarking

```bash
# Run benchmarks in release mode
cargo run --example performance_comparison --release

# Profile with flamegraph
cargo flamegraph --example performance_comparison
```

## 📝 Coding Standards

### Style

We follow standard Rust conventions:

```bash
# Format code
cargo fmt

# Check formatting
cargo fmt -- --check

# Lint with Clippy
cargo clippy -- -D warnings
```

### Best Practices

1. **Use descriptive names**
   ```rust
   // ❌ Bad
   fn pm<T>(d: &[T], f: fn(&T) -> T) -> Vec<T>

   // ✅ Good
   fn parallel_map<T, F>(data: &[T], func: F) -> Vec<T>
   where F: Fn(&T) -> T + Send + Sync
   ```

2. **Document public APIs**
   ```rust
   /// Maps a function over elements in parallel.
   ///
   /// # Examples
   ///
   /// ```
   /// use avila_parallel::executor::parallel_map;
   /// let data = vec![1, 2, 3];
   /// let result = parallel_map(&data, |x| x * 2);
   /// assert_eq!(result, vec![2, 4, 6]);
   /// ```
   ///
   /// # Performance
   ///
   /// Best for datasets >10K elements with expensive operations.
   pub fn parallel_map<T, F>(data: &[T], func: F) -> Vec<T>
   ```

3. **Write tests**
   ```rust
   #[test]
   fn test_parallel_map_basic() {
       let data = vec![1, 2, 3];
       let result = parallel_map(&data, |x| x * 2);
       assert_eq!(result, vec![2, 4, 6]);
   }

   #[test]
   fn test_parallel_map_empty() {
       let data: Vec<i32> = vec![];
       let result = parallel_map(&data, |x| x * 2);
       assert!(result.is_empty());
   }
   ```

4. **Handle edge cases**
   - Empty input
   - Single element
   - Large input (>1M elements)
   - Thread safety
   - Type constraints

5. **Performance considerations**
   - Minimize allocations
   - Avoid unnecessary cloning
   - Use `Arc` for sharing, not `clone()`
   - Consider sequential fallback for small data

### Code Structure

```
avila-parallel/
├── src/
│   ├── lib.rs              # Public API exports
│   ├── executor.rs         # Core parallel execution
│   ├── parallel.rs         # ParallelIterator trait
│   ├── parallel_vec.rs     # High-level fluent API
│   ├── scope.rs            # (legacy, unused)
│   └── thread_pool.rs      # (legacy, unused)
├── examples/               # Usage examples
├── tests/                  # Integration tests (optional)
├── benches/               # Benchmarks (optional)
└── docs/                  # Additional documentation
```

## 🔀 Pull Request Process

### 1. Fork and Create Branch

```bash
# Fork on GitHub, then clone
git clone https://github.com/YOUR_USERNAME/avila-parallel
cd avila-parallel

# Create feature branch
git checkout -b feature/my-awesome-feature
```

### 2. Make Changes

- Write code
- Add tests
- Update documentation
- Run `cargo fmt` and `cargo clippy`

### 3. Test Thoroughly

```bash
# Format
cargo fmt

# Lint
cargo clippy -- -D warnings

# Test
cargo test --all-features

# Test in release mode
cargo test --release

# Run examples
cargo run --example basic_usage
```

### 4. Commit

Use clear, descriptive commit messages:

```bash
git add .
git commit -m "feat: add parallel_zip operation

- Implement parallel_zip for combining two iterators
- Add tests for basic functionality and edge cases
- Update documentation with examples
- Add benchmark comparing to sequential zip

Closes #123"
```

**Commit message format:**
```
<type>: <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, no code change
- `refactor`: Code restructuring
- `perf`: Performance improvement
- `test`: Adding tests
- `chore`: Build process or auxiliary tools

### 5. Push and Create PR

```bash
git push origin feature/my-awesome-feature
```

Then open a pull request on GitHub with:
- **Clear title**: What does this PR do?
- **Description**: Why is this change needed?
- **Testing**: How was this tested?
- **Breaking changes**: Any incompatibilities?
- **Related issues**: Fixes #123

**PR Template:**
```markdown
## Description
Brief description of changes.

## Motivation
Why is this change needed?

## Changes
- Added feature X
- Fixed bug Y
- Refactored Z

## Testing
- [ ] Unit tests added/updated
- [ ] Examples run successfully
- [ ] Benchmarks show improvement
- [ ] Documentation updated

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests pass locally
- [ ] Documentation is clear
- [ ] No breaking changes (or documented)
```

### 6. Code Review

- Address feedback promptly
- Be open to suggestions
- Ask questions if unclear
- Update PR as needed

### 7. Merge

Once approved, we'll merge your PR! 🎉

## 🧪 Testing Guidelines

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_functionality() {
        let input = vec![1, 2, 3];
        let result = parallel_map(&input, |x| x * 2);
        assert_eq!(result, vec![2, 4, 6]);
    }

    #[test]
    fn test_empty_input() {
        let input: Vec<i32> = vec![];
        let result = parallel_map(&input, |x| x * 2);
        assert!(result.is_empty());
    }

    #[test]
    fn test_large_dataset() {
        let input: Vec<_> = (0..1_000_000).collect();
        let result = parallel_map(&input, |x| x * 2);
        assert_eq!(result.len(), 1_000_000);
        assert_eq!(result[500_000], 1_000_000);
    }
}
```

### Integration Tests

```rust
// tests/integration_test.rs
use avila_parallel::prelude::*;

#[test]
fn test_complex_pipeline() {
    let data: Vec<i32> = (0..10_000).collect();

    let result = data.par_vec()
        .filter(|&x| x % 2 == 0)
        .map(|x| x * x)
        .collect();

    assert_eq!(result.len(), 5_000);
    assert_eq!(result[0], 0);
    assert_eq!(result[1], 4);
}
```

### Property-Based Tests (Optional)

Consider using `proptest` or `quickcheck`:

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_parallel_map_equals_sequential(
        data in prop::collection::vec(any::<i32>(), 0..1000)
    ) {
        let seq_result: Vec<_> = data.iter().map(|x| x * 2).collect();
        let par_result = parallel_map(&data, |x| x * 2);
        prop_assert_eq!(seq_result, par_result);
    }
}
```

## 📊 Performance Testing

### Benchmarking

Create benchmarks in `examples/`:

```rust
use std::time::Instant;
use avila_parallel::prelude::*;

fn bench_parallel_map(size: usize) {
    let data: Vec<i32> = (0..size as i32).collect();

    let start = Instant::now();
    let _ = data.par_vec().map(|x| x * 2).collect::<Vec<_>>();
    let duration = start.elapsed();

    println!("Size: {}, Time: {:?}", size, duration);
}

fn main() {
    for size in [1_000, 10_000, 100_000, 1_000_000] {
        bench_parallel_map(size);
    }
}
```

### Profiling

```bash
# Install flamegraph
cargo install flamegraph

# Generate flame graph
cargo flamegraph --example your_benchmark

# Open flamegraph.svg in browser
```

## 📚 Documentation

### Inline Documentation

Use rustdoc comments:

```rust
/// A parallel iterator over a slice.
///
/// This struct is created by the [`par_iter`](crate::parallel::ParallelSlice::par_iter) method.
///
/// # Examples
///
/// ```
/// use avila_parallel::prelude::*;
///
/// let data = vec![1, 2, 3, 4, 5];
/// let sum: i32 = data.par_iter().sum();
/// assert_eq!(sum, 15);
/// ```
///
/// # Performance
///
/// Best for datasets larger than 10,000 elements. For smaller datasets,
/// consider using sequential iteration due to thread overhead.
///
/// # Thread Safety
///
/// The closure passed to operations must be `Fn + Send + Sync`.
pub struct ParIter<'a, T> {
    data: &'a [T],
}
```

### Examples

Every public function should have examples:

```rust
/// # Examples
///
/// Basic usage:
///
/// ```
/// use avila_parallel::executor::parallel_map;
///
/// let data = vec![1, 2, 3, 4, 5];
/// let result = parallel_map(&data, |x| x * 2);
/// assert_eq!(result, vec![2, 4, 6, 8, 10]);
/// ```
///
/// With complex types:
///
/// ```
/// use avila_parallel::executor::parallel_map;
///
/// #[derive(Debug, PartialEq)]
/// struct Point { x: i32, y: i32 }
///
/// let points = vec![Point { x: 1, y: 2 }, Point { x: 3, y: 4 }];
/// let shifted = parallel_map(&points, |p| Point { x: p.x + 1, y: p.y + 1 });
/// assert_eq!(shifted[0], Point { x: 2, y: 3 });
/// ```
```

## 🐛 Debugging

### Enable Logging

```rust
// In your code
println!("DEBUG: Processing chunk {}/{}", i, num_chunks);

// In tests
cargo test -- --nocapture
```

### Check Thread Count

```rust
let threads = std::thread::available_parallelism()
    .map(|n| n.get())
    .unwrap_or(1);
println!("Using {} threads", threads);
```

### Verify Order Preservation

```rust
#[test]
fn test_order_preserved() {
    let data: Vec<_> = (0..1000).collect();
    let result = parallel_map(&data, |x| x * 2);
    for (i, &val) in result.iter().enumerate() {
        assert_eq!(val, i as i32 * 2, "Order not preserved at index {}", i);
    }
}
```

## 🎓 Learning Resources

- [The Rust Book](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
- [Rayon Documentation](https://docs.rs/rayon/) (similar library)
- [std::thread::scope docs](https://doc.rust-lang.org/std/thread/fn.scope.html)

## 💬 Communication

- **Issues**: For bugs and feature requests
- **Pull Requests**: For code contributions
- **Discussions**: For questions and ideas (if enabled)

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to avila-parallel! 🚀
