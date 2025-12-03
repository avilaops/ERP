# 📦 Publishing Guide for avila-parallel

This guide walks you through publishing `avila-parallel` to crates.io.

## ✅ Pre-Publication Checklist

### 1. Verify All Tests Pass

```bash
# Run all tests in release mode
cargo test --release

# Expected output:
# test result: ok. 24 passed; 0 failed; 0 ignored
```

### 2. Check Code Quality

```bash
# Format code
cargo fmt

# Check formatting
cargo fmt -- --check

# Run Clippy (Rust linter)
cargo clippy -- -D warnings

# Should have no warnings in src/
```

### 3. Build Documentation

```bash
# Generate documentation
cargo doc --no-deps

# Open in browser
cargo doc --no-deps --open

# Verify:
# - All public APIs documented
# - Examples render correctly
# - Links work
```

### 4. Run All Examples

```bash
# Basic usage
cargo run --example basic_usage

# Performance comparison
cargo run --example performance_comparison --release

# Advanced operations
cargo run --example advanced_operations --release

# Real-world benchmarks
cargo run --example real_world_benchmark --release

# All should run without errors
```

### 5. Verify Package Metadata

Check `Cargo.toml`:

```toml
[package]
name = "avila-parallel"
version = "0.1.0"
edition = "2021"
rust-version = "1.70.0"

description = "Zero-dependency parallel computation library with true multi-threaded execution"
license = "MIT"
repository = "https://github.com/your-org/avila-parallel"
documentation = "https://docs.rs/avila-parallel"
homepage = "https://github.com/your-org/avila-parallel"
keywords = ["parallel", "threads", "iterator", "multicore", "zero-dependency"]
categories = ["concurrency", "algorithms", "no-std"]

readme = "README.md"
```

**Update:**
- `repository` URL
- `homepage` URL
- `authors` if needed

### 6. Verify README

Check `README.md`:
- ✅ Badges are correct
- ✅ Installation instructions clear
- ✅ Examples work
- ✅ Links valid
- ✅ Benchmarks up-to-date

### 7. Update Version in CHANGELOG

Verify `CHANGELOG.md`:
- ✅ Version 0.1.0 is documented
- ✅ All features listed
- ✅ Release date filled in
- ✅ Links work

## 🔐 Setup crates.io Account

### 1. Create Account

Visit https://crates.io/ and sign in with GitHub

### 2. Get API Token

1. Go to https://crates.io/me
2. Click "New Token"
3. Enter token name (e.g., "avila-parallel-publish")
4. Copy token

### 3. Login via Cargo

```bash
cargo login

# Paste your token when prompted
# Token is saved to ~/.cargo/credentials
```

## 📦 Publish Package

### 1. Dry Run (Test Without Publishing)

```bash
cargo publish --dry-run

# This will:
# - Package your crate
# - Verify all files included
# - Check for errors
# - NOT actually publish
```

**Review output:**
- File list (should include src/, examples/, LICENSE, README)
- Any warnings
- Package size

### 2. Package Locally

```bash
cargo package

# Creates: target/package/avila-parallel-0.1.0.crate
```

### 3. Extract and Verify Package

```bash
# Extract package
cd target/package
tar -xzf avila-parallel-0.1.0.crate
cd avila-parallel-0.1.0

# Test the extracted package
cargo test --release
cargo run --example basic_usage

# If everything works, go back
cd ../../..
```

### 4. Publish (For Real)

```bash
# This is irreversible!
cargo publish

# You'll see:
# Uploading avila-parallel v0.1.0
# ```

**Note:** Once published, version 0.1.0 can never be changed. You can only yank it or publish a new version.

## 🔍 Post-Publication Verification

### 1. Wait for Processing (5-10 minutes)

crates.io needs time to:
- Process the upload
- Generate documentation
- Update indexes

### 2. Verify on crates.io

Visit: https://crates.io/crates/avila-parallel

Check:
- ✅ Package appears
- ✅ Description correct
- ✅ Version 0.1.0 listed
- ✅ Dependencies: 0
- ✅ README renders

### 3. Verify Documentation

Visit: https://docs.rs/avila-parallel

Check:
- ✅ Docs generated
- ✅ All modules present
- ✅ Examples render
- ✅ Links work

### 4. Test Installation

In a new directory:

```bash
# Create test project
cargo new test-avila-parallel
cd test-avila-parallel

# Add dependency
cargo add avila-parallel

# Or manually edit Cargo.toml:
# [dependencies]
# avila-parallel = "0.1.0"

# Create test
cat > src/main.rs << 'EOF'
use avila_parallel::prelude::*;

fn main() {
    let data = vec![1, 2, 3, 4, 5];
    let sum: i32 = data.par_iter().sum();
    println!("Sum: {}", sum);
}
EOF

# Build and run
cargo run

# Should output: Sum: 15
```

## 🏷️ Create Git Release

### 1. Commit All Changes

```bash
git add .
git commit -m "Release v0.1.0"
```

### 2. Create Tag

```bash
git tag -a v0.1.0 -m "Release version 0.1.0"
```

### 3. Push to GitHub

```bash
git push origin main
git push origin v0.1.0
```

### 4. Create GitHub Release

1. Go to GitHub repository
2. Click "Releases" → "Create a new release"
3. Select tag: `v0.1.0`
4. Title: `v0.1.0 - Initial Release`
5. Description: Copy from `CHANGELOG.md`
6. Click "Publish release"

## 📢 Announce Release

### Reddit
- r/rust (Sunday only for projects)
- r/rust_gamedev (if applicable)

### Twitter/X
```
🎉 Announcing avila-parallel v0.1.0!

Zero-dependency parallel computation for Rust 🦀

✨ True multi-threaded execution
📦 Zero external dependencies
🔒 Thread-safe by design
⚡ 1.17x speedup on large datasets

https://crates.io/crates/avila-parallel

#rustlang #rust #opensource
```

### Discord
- Rust Community Discord (#showcase)
- Rust Gamedev Discord (if applicable)

### This Week in Rust
Submit to: https://this-week-in-rust.org/

## 🔄 Post-Release Tasks

### 1. Update Development Version

```toml
# Cargo.toml
[package]
version = "0.2.0-dev"  # Next version
```

### 2. Create Roadmap Issue

Create GitHub issue for v0.2.0 planning

### 3. Monitor Issues

Watch for:
- Bug reports
- Feature requests
- Questions
- Contribution PRs

## 🐛 If Something Goes Wrong

### Wrong Metadata

```bash
# Yank the version (don't delete)
cargo yank --version 0.1.0

# Fix metadata in Cargo.toml
# Bump to 0.1.1
cargo publish
```

### Documentation Issues

```bash
# Trigger rebuild at docs.rs
# Go to https://docs.rs/avila-parallel
# Click "Build latest version"
```

### Major Bug Found

```bash
# Yank the version
cargo yank --version 0.1.0 --vers 0.1.0

# Fix bug
# Bump to 0.1.1
# Publish fixed version
cargo publish
```

## 📋 Quick Reference

### Versioning (Semantic Versioning)

- **0.1.0 → 0.1.1**: Patch (bug fixes)
- **0.1.0 → 0.2.0**: Minor (new features, backwards-compatible)
- **0.1.0 → 1.0.0**: Major (breaking changes)

### Important Commands

```bash
# Dry run
cargo publish --dry-run

# Publish
cargo publish

# Yank version
cargo yank --version 0.1.0

# Un-yank version
cargo yank --undo --version 0.1.0

# Update documentation
# (automatic on publish, manual rebuild at docs.rs)
```

### Important URLs

- **Crates.io**: https://crates.io/crates/avila-parallel
- **Docs.rs**: https://docs.rs/avila-parallel
- **Repository**: https://github.com/your-org/avila-parallel

## ✅ Final Checklist Before Publishing

- [ ] All tests pass (`cargo test --release`)
- [ ] Code formatted (`cargo fmt --check`)
- [ ] No Clippy warnings (`cargo clippy -- -D warnings`)
- [ ] Documentation builds (`cargo doc --no-deps`)
- [ ] All examples run (`cargo run --example ...`)
- [ ] Cargo.toml metadata correct
- [ ] README accurate
- [ ] CHANGELOG updated with release date
- [ ] LICENSE file present
- [ ] Repository URL correct
- [ ] Logged into crates.io (`cargo login`)
- [ ] Dry run successful (`cargo publish --dry-run`)
- [ ] Git committed
- [ ] Git tagged (`git tag v0.1.0`)
- [ ] Ready to publish? (`cargo publish`)

## 🎉 You're Ready!

Once published:
1. ✅ Package appears on crates.io
2. ✅ Documentation on docs.rs
3. ✅ Others can use: `cargo add avila-parallel`
4. ✅ GitHub release created
5. ✅ Community notified

**Good luck with your release!** 🚀

---

**Note:** Publishing is **irreversible**. Once published, you can only yank (hide) versions, not delete them. Make sure everything is correct before running `cargo publish`.
