# avila-atom

**Atomic Computational Structures** - High-performance fundamental data structures built from first principles.

[![Crates.io](https://img.shields.io/crates/v/avila-atom.svg)](https://crates.io/crates/avila-atom)
[![Documentation](https://docs.rs/avila-atom/badge.svg)](https://docs.rs/avila-atom)
[![License](https://img.shields.io/badge/license-MIT%2FApache--2.0-blue.svg)](LICENSE)

## Features

- **Zero-cost abstractions** - No runtime overhead vs manual implementation
- **Memory efficiency** - Contiguous allocation for optimal cache locality
- **Compile-time optimization** - Monomorphization enables aggressive inlining
- **no_std compatible** - Works in embedded and OS development contexts

## Data Structures

### Core Types

- **`Option<T>`** - Optional value (presence/absence)
  - Zero-cost abstraction with enum-based representation
  - Null pointer optimization for references

- **`Result<T, E>`** - Result type (success/failure)
  - Tagged union for error handling
  - Zero-cost compared to manual error codes

- **`DynamicArray<T>`** - Growable contiguous array
  - O(1) amortized push with geometric growth
  - 24 bytes header (ptr + len + capacity)

- **`AssociativeArray<K, V>`** - Key-value storage
  - `std`: HashMap with O(1) average lookup
  - `no_std`: BTreeMap with O(log n) lookup

- **`StringBuffer`** - UTF-8 encoded string
  - Guaranteed valid UTF-8 at all times
  - Efficient growable capacity

### Advanced Types

- **`FixedArray<T, N>`** - Stack-allocated fixed-size array
  - Zero heap allocation
  - Compile-time size known

- **`CacheAlignedArray<T, N>`** - Cache-line aligned array
  - 64-byte alignment prevents false sharing
  - Optimal for multithreaded performance

- **`SmallString`** - Small string optimization
  - Stores ≤23 bytes inline (no heap)
  - Automatic heap promotion for larger strings

### Performance Modules

- **`perf`** - Branch prediction hints and alignment
  - `likely()` / `unlikely()` - Branch prediction hints
  - `assume_aligned()` - Pointer alignment assertions

- **`simd`** - SIMD-optimized operations (x86_64)
  - AVX2/AVX-512 feature detection
  - Vectorized memory operations
  - 2-4x faster for large buffers

- **`DynamicArrayExt`** - Extended array operations
  - `reserve_exact_fast()` - Smart capacity management
  - `extend_from_slice_fast()` - Optimized slice extension
  - `clear_and_resize()` - Memory-efficient resizing

### Memory Management (v0.4.0+)

- **`arena::Arena`** - Bump allocator for batch allocations
  - O(1) allocation, O(1) bulk deallocation
  - Zero per-object overhead
  - Perfect for temporary allocations

- **`pool::ObjectPool<T>`** - Object reuse without reallocation
  - Eliminates allocation overhead
  - Per-thread pools for multithreading
  - Automatic slot reuse

### Concurrency (v0.4.0+)

- **`lockfree::LockFreeStack<T>`** - Wait-free LIFO stack
  - No mutex overhead
  - Compare-and-swap operations
  - Thread-safe push/pop

- **`lockfree::AtomicCounter`** - Cache-line padded counter
  - Prevents false sharing
  - Lock-free increment/get/set
  - 64-byte alignment

- **`lockfree::RingBuffer<T, N>`** (v0.5.0+) - SPSC circular buffer
  - Single-producer single-consumer
  - Const generic power-of-2 capacity
  - Lock-free with Acquire/Release semantics
  - Zero-copy inter-thread communication

### Advanced Data Structures (v0.5.0+)

- **`btree::BPlusTree<K, V>`** - Cache-optimized B+Tree
  - 16-way fanout for cache-line alignment
  - Database-grade ordered storage
  - O(log N) operations

- **`robinhood::RobinHoodMap<K, V>`** - Robin Hood hash table
  - Linear probing with displacement tracking
  - FNV-1a hash for excellent distribution
  - Superior cache performance vs chaining
  - Bounded probe length variance

### Compression (v0.5.0+)

- **`compress`** - Inline compression algorithms
  - `rle_encode()` / `rle_decode()` - Run-length encoding (2-10x for repetitive data)
  - `delta_encode()` / `delta_decode()` - Delta encoding for sequential data
  - Zero heap allocations, in-place compression

## Usage

Add to your `Cargo.toml`:```toml
[dependencies]
avila-atom = "0.7"
```

### Complete Data Structure Suite (v0.7.0+)

```rust
// Priority Queues
use avila_atom::heap::{MinHeap, MaxHeap};
let mut heap = MinHeap::new();
heap.push(5);
heap.push(2);
assert_eq!(heap.pop(), Some(2)); // Min element

// Graph Algorithms
use avila_atom::unionfind::UnionFind;
let mut uf = UnionFind::new(100);
uf.union(1, 2);
assert!(uf.connected(1, 2));

// LRU Cache
use avila_atom::lru::LruCache;
let mut cache = LruCache::new(100);
cache.put("key", "value");
assert_eq!(cache.get(&"key"), Some(&"value"));

// BitSet - 64x compression
use avila_atom::bitset::BitSet;
let mut bs = BitSet::new(10000);
bs.insert(42);
assert!(bs.contains(42));
assert_eq!(bs.count(), 1);

// Radix Sort - O(n) for integers
use avila_atom::sort::radix_sort_u32;
let mut arr = vec![170, 45, 75, 90, 802, 24, 2, 66];
radix_sort_u32(&mut arr);
// arr is now [2, 24, 45, 66, 75, 90, 170, 802]

// Segment Tree - Range queries
use avila_atom::segtree::SegmentTree;
let arr = vec![1, 3, 5, 7, 9];
let tree = SegmentTree::new(&arr, 0);
let sum = tree.query(1, 3); // Sum of arr[1..=3]

// Trie - Prefix matching
use avila_atom::trie::Trie;
let mut trie = Trie::new();
trie.insert("hello");
trie.insert("help");
assert!(trie.starts_with("hel"));

// MPMC Queue - Lock-free
use avila_atom::mpmc::MpmcQueue;
let queue = MpmcQueue::new(1024);
queue.push(42).unwrap();
assert_eq!(queue.pop(), Some(42));

// SmallVec - Stack optimization
use avila_atom::smallvec::SmallVec;
let mut sv: SmallVec<i32, 8> = SmallVec::new();
sv.push(1); // On stack (no allocation!)

// Sparse Set - O(1) operations
use avila_atom::sparseset::SparseSet;
let mut ss = SparseSet::new(1000);
ss.insert(42);
assert!(ss.contains(42));

// Matrix operations
use avila_atom::matrix::Matrix;
let mut m = Matrix::new(3, 3);
m.set(0, 0, 1.0);
let result = m.multiply(&m); // Matrix multiplication

// Slab Allocator
use avila_atom::slab::SlabAllocator;
let mut slab = SlabAllocator::new(1000);
let id = slab.allocate(42).unwrap();
assert_eq!(slab.get(id), Some(&42));
```

### Revolutionary Features (v0.6.0+)

```rust
use avila_atom::skiplist::SkipList;
use avila_atom::bloom::BloomFilter;
use avila_atom::radix::RadixTree;
use avila_atom::cow::CowArray;
use avila_atom::numa::{NumaPool, NumaNode};

// Lock-free concurrent skip list
let mut skiplist: SkipList<i32, String> = SkipList::new();
skiplist.insert(42, "answer".to_string());
let exists = skiplist.contains(&42); // O(log N) concurrent

// Bloom filter - probabilistic set membership
let mut bloom: BloomFilter<&str> = BloomFilter::new(10000, 0.01); // 1% FPR
bloom.insert(&"user123");
if bloom.contains(&"user123") { // Fast negative lookups
    // Might be present (or false positive)
}

// Radix tree for prefix matching
let mut radix = RadixTree::new();
radix.insert(b"192.168.1.0", "subnet_a");
radix.insert(b"192.168.2.0", "subnet_b");
let route = radix.get(b"192.168.1.0"); // O(k) where k = key length

// Copy-on-Write array for immutable sharing
let mut arr1: CowArray<i32> = CowArray::new();
arr1.push(1);
arr1.push(2);
let arr2 = arr1.clone(); // O(1) - shared until write

// NUMA-aware memory pool
let mut pool = NumaPool::new(2); // 2-socket system
pool.set_node(NumaNode(0)); // Bind to socket 0
pool.push(data); // Allocate on local NUMA node
```

### Examples

```rust
use avila_atom::{DynamicArray, AssociativeArray, StringBuffer};

// Dynamic array with type inference
let mut numbers = DynamicArray::new();
numbers.push(1);
numbers.push(2);
numbers.push(3);

// Map with convenient macro
use avila_atom::map;
let config = map! {
    "host" => "localhost",
    "port" => "8080",
};

// UTF-8 string buffer
let mut text = StringBuffer::from("Hello, ");
text.push_str("Ávila!");
assert_eq!(text.len(), 14); // UTF-8 byte count
```

### Macros

```rust
use avila_atom::{map, list, array};

// Map with capacity pre-allocation
let m = map! {
    "key1" => "value1",
    "key2" => "value2",
};

// Dynamic array
let v = list![1, 2, 3, 4, 5];

// Fixed-size stack array
let arr = array![10, 20, 30];
assert_eq!(arr.len(), 3);
```

### Performance Optimizations

```rust
use avila_atom::{DynamicArray, DynamicArrayExt};
use avila_atom::fixed::CacheAlignedArray;
use avila_atom::perf::{likely, unlikely};

// Cache-aligned array for multithreading
let aligned = CacheAlignedArray::new([0u64; 8]);

// Smart capacity management
let mut v = DynamicArray::new();
v.reserve_exact_fast(1000); // Only allocates if needed
v.extend_from_slice_fast(&[1, 2, 3]);

// Branch prediction hints
fn process(value: i32) -> i32 {
    if likely(value > 0) {
        value * 2
    } else {
        0
    }
}
```

### SIMD Operations (x86_64)

```rust
#[cfg(target_arch = "x86_64")]
use avila_atom::simd::{has_avx2, has_avx512f, fast_copy};

#[cfg(target_arch = "x86_64")]
fn optimized_copy(dst: &mut [u8], src: &[u8]) {
    if has_avx512f() {
        unsafe {
            fast_copy(
                dst.as_mut_ptr(),
                src.as_ptr(),
                src.len()
            );
        }
    } else {
        dst.copy_from_slice(src);
    }
}
```

### Arena Allocator

```rust
use avila_atom::arena::Arena;

let mut arena = Arena::with_capacity(4096);

// Allocate multiple values
let val1 = arena.alloc_value(42u64).unwrap();
let val2 = arena.alloc_value(String::from("hello")).unwrap();

// Use values...
println!("val1: {}", *val1);

// Bulk deallocation
arena.reset(); // O(1) - frees all at once
```

### Object Pool

```rust
use avila_atom::pool::ObjectPool;

let mut pool = ObjectPool::with_capacity(100);

// Acquire object
let id = pool.acquire(|| vec![0u8; 1024]);

// Use object
if let Some(buffer) = pool.get_mut(id) {
    buffer.extend_from_slice(&[1, 2, 3]);
}

// Release back to pool (for reuse)
pool.release(id);
```

### Lock-Free Concurrency

```rust
use avila_atom::lockfree::{LockFreeStack, AtomicCounter};
use std::thread;

// Lock-free stack
let stack = LockFreeStack::new();

let handles: Vec<_> = (0..4).map(|i| {
    let stack_ref = &stack;
    thread::spawn(move || {
        stack_ref.push(i);
    })
}).collect();

for handle in handles {
    handle.join().unwrap();
}

// Atomic counter (cache-line padded)
let counter = AtomicCounter::new(0);
let handles: Vec<_> = (0..1000).map(|_| {
    let counter_ref = &counter;
    thread::spawn(move || {
        counter_ref.increment();
    })
}).collect();

for handle in handles {
    handle.join().unwrap();
}

assert_eq!(counter.get(), 1000);
```

### Advanced Structures (v0.5.0+)

```rust
use avila_atom::robinhood::RobinHoodMap;
use avila_atom::lockfree::RingBuffer;
use avila_atom::compress::{rle_encode, rle_decode};
use avila_atom::DynamicArray;

// Robin Hood hash map
let mut map = RobinHoodMap::new();
map.insert("key1", 100);
map.insert("key2", 200);
assert_eq!(map.get(&"key1"), Some(&100));

// Lock-free SPSC ring buffer (power-of-2 capacity)
let buffer: RingBuffer<u64, 1024> = RingBuffer::new();
buffer.push(42);
buffer.push(99);
assert_eq!(buffer.pop(), Some(42));

// Run-length encoding compression
let data = [1u8, 1, 1, 2, 2, 3];
let mut compressed = DynamicArray::new();
rle_encode(&data, &mut compressed);
// Result: [3, 1, 2, 2, 1, 3] = 3 ones, 2 twos, 1 three
```

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| `DynamicArray::push` | O(1) amortized | Geometric growth (2x) |
| `DynamicArray::get` | O(1) | Direct index access |
| `AssociativeArray::get` | O(1) avg / O(log n) | HashMap / BTree |
| `StringBuffer::push_str` | O(n) | UTF-8 validation required |
| `FixedArray` operations | O(1) | Stack-allocated, inlined |
| `Arena::alloc` | O(1) | Bump pointer increment |
| `Arena::reset` | O(1) | Bulk deallocation |
| `ObjectPool::acquire` | O(1) | Slot reuse from free list |
| `LockFreeStack::push/pop` | O(1) | Wait-free CAS operations |
| `RobinHoodMap::insert/get` | O(1) avg | Bounded probe length |
| `RingBuffer::push/pop` | O(1) | Lock-free SPSC |
| `BPlusTree::insert` | O(log N) | 16-way fanout |
| `rle_encode/decode` | O(n) | 2-10x compression |
| `SkipList::insert/search` | O(log N) | Probabilistic, concurrent |
| `RadixTree::insert/get` | O(k) | k = key length |
| `BloomFilter::insert/contains` | O(h) | h = hash count |
| `CowArray::clone` | O(1) | Lazy copy, refcounted |
| `IntrusiveList::push/pop` | O(1) | Zero allocations |
| `NumaPool::push/pop` | O(1) | NUMA-local access |

## Compile-Time Guarantees

```rust
use avila_atom::static_assert_size;

// Verify structure sizes for ABI compatibility
static_assert_size!(Option<&str>, 16); // Two pointers on 64-bit
```

## no_std Support

Disable default features and enable `alloc`:

```toml
[dependencies]
avila-atom = { version = "0.2", default-features = false }
```

Note: `AssociativeArray` falls back to BTreeMap in `no_std` mode.

## Architecture

Built following the **Ávila Engineering Philosophy**:

- **Stack-preferred** - Minimize heap allocations
- **Zero dependencies** - Built from Rust core types
- **Performance-first** - Optimized for modern CPU architectures
- **Type-safe** - Compile-time guarantees prevent runtime errors

## License

Licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass (`cargo test`)
2. Code is formatted (`cargo fmt`)
3. No clippy warnings (`cargo clippy`)
4. Documentation is updated

---

**Part of the Ávila Computational Stack** - Building high-performance systems from first principles.
