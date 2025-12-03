# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-01-XX

### Added
- **Advanced parallel operations module** (`advanced.rs`):
  - `parallel_sort`: Parallel merge sort implementation
  - `parallel_sort_by`: Sort with custom comparator
  - `parallel_zip`: Combine two slices element-wise
  - `parallel_chunks`: Process data in fixed-size chunks
  - `parallel_partition_advanced`: Advanced partitioning with better performance
- Environment variable configuration: `AVILA_MIN_CHUNK_SIZE`
- AtomicBool optimization for early termination in `find` operations
- Updated benchmarks with Criterion.rs
- Performance analysis documentation

### Changed
- Optimized `MIN_CHUNK_SIZE` from 512 to 1024 based on benchmark results
- Improved `parallel_find` performance with early termination
- Enhanced documentation with benchmark results and optimization guide

### Fixed
- Fixed chunk size calculations for better load balancing
- Improved thread utilization for large datasets

## [0.1.0] - 2025-01-XX

### Added
- Initial release with core parallel operations
- True parallel execution using `std::thread::scope`
- Zero runtime dependencies
- Parallel iterators: `map`, `filter`, `reduce`, `sum`
- Advanced operators: `find`, `count`, `partition`
- Thread pool implementation
- Comprehensive test suite (24 tests)
- Documentation and examples
- Criterion benchmarks

### Features
- Auto-detection of CPU cores
- Configurable chunk sizes
- Work distribution across threads
- Arc<Mutex<>> synchronization
- Early termination support
