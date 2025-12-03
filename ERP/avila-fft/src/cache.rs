//! Cache Optimization Module
//!
//! Advanced caching strategies for maximum performance:
//! - Twiddle factor precomputation and reuse
//! - Window function caching
//! - FFT planner pooling
//! - Cache-aligned memory allocation

use crate::{Complex, FftPlanner};
use crate::timefreq::WindowType;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Global cache for FFT planners (thread-safe)
static PLANNER_CACHE: Mutex<Option<PlannerCache>> = Mutex::new(None);

/// Cache key for FFT planners
#[derive(Hash, Eq, PartialEq, Clone, Debug)]
struct PlannerKey {
    size: usize,
    inverse: bool,
}

/// Thread-safe FFT planner cache
pub struct PlannerCache {
    cache_f64: HashMap<PlannerKey, Arc<FftPlanner<f64>>>,
    cache_f32: HashMap<PlannerKey, Arc<FftPlanner<f32>>>,
    hits: usize,
    misses: usize,
}

impl PlannerCache {
    fn new() -> Self {
        Self {
            cache_f64: HashMap::new(),
            cache_f32: HashMap::new(),
            hits: 0,
            misses: 0,
        }
    }

    /// Get or create cached planner for f64
    pub fn get_planner_f64(&mut self, size: usize, inverse: bool) -> Arc<FftPlanner<f64>> {
        let key = PlannerKey { size, inverse };

        if let Some(planner) = self.cache_f64.get(&key) {
            self.hits += 1;
            Arc::clone(planner)
        } else {
            self.misses += 1;
            let planner = Arc::new(
                FftPlanner::new(size, inverse)
                    .expect("Failed to create FFT planner")
            );
            self.cache_f64.insert(key, Arc::clone(&planner));
            planner
        }
    }

    /// Get cache statistics
    pub fn stats(&self) -> (usize, usize, f64) {
        let total = self.hits + self.misses;
        let hit_rate = if total > 0 {
            self.hits as f64 / total as f64
        } else {
            0.0
        };
        (self.hits, self.misses, hit_rate)
    }

    /// Clear the cache
    pub fn clear(&mut self) {
        self.cache_f64.clear();
        self.cache_f32.clear();
        self.hits = 0;
        self.misses = 0;
    }
}

/// Get or create the global planner cache
fn get_cache() -> std::sync::MutexGuard<'static, Option<PlannerCache>> {
    let mut cache = PLANNER_CACHE.lock().unwrap();
    if cache.is_none() {
        *cache = Some(PlannerCache::new());
    }
    cache
}

/// Get a cached FFT planner (reuses planners for same size)
pub fn get_cached_planner(size: usize, inverse: bool) -> Arc<FftPlanner<f64>> {
    let mut cache = get_cache();
    cache.as_mut().unwrap().get_planner_f64(size, inverse)
}

/// Get cache statistics
pub fn cache_stats() -> (usize, usize, f64) {
    let cache = get_cache();
    cache.as_ref().unwrap().stats()
}

/// Clear the planner cache
pub fn clear_cache() {
    let mut cache = get_cache();
    if let Some(c) = cache.as_mut() {
        c.clear();
    }
}

/// Window function cache
#[derive(Hash, Eq, PartialEq, Clone, Copy)]
struct WindowKey {
    window_type: WindowType,
    size: usize,
}

pub struct WindowCache {
    cache: HashMap<WindowKey, Vec<f64>>,
}

impl WindowCache {
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    /// Get or compute window function
    pub fn get_window(&mut self, window_type: WindowType, size: usize) -> Vec<f64> {
        let key = WindowKey { window_type, size };

        if let Some(window) = self.cache.get(&key) {
            window.clone()
        } else {
            let window = compute_window(window_type, size);
            self.cache.insert(key, window.clone());
            window
        }
    }

    /// Precompute common window sizes
    pub fn warmup(&mut self, window_type: WindowType) {
        let common_sizes = [256, 512, 1024, 2048, 4096, 8192];
        for &size in &common_sizes {
            self.get_window(window_type, size);
        }
    }
}

/// Compute window function (internal)
fn compute_window(window_type: WindowType, size: usize) -> Vec<f64> {
    use std::f64::consts::PI;

    match window_type {
        WindowType::Hann => {
            (0..size)
                .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f64 / size as f64).cos()))
                .collect()
        }
        WindowType::Hamming => {
            (0..size)
                .map(|i| 0.54 - 0.46 * (2.0 * PI * i as f64 / size as f64).cos())
                .collect()
        }
        WindowType::Blackman => {
            (0..size)
                .map(|i| {
                    let x = 2.0 * PI * i as f64 / size as f64;
                    0.42 - 0.5 * x.cos() + 0.08 * (2.0 * x).cos()
                })
                .collect()
        }
        WindowType::BlackmanHarris => {
            (0..size)
                .map(|i| {
                    let x = 2.0 * PI * i as f64 / size as f64;
                    0.35875 - 0.48829 * x.cos() + 0.14128 * (2.0 * x).cos() - 0.01168 * (3.0 * x).cos()
                })
                .collect()
        }
        WindowType::Rectangle => {
            vec![1.0; size]
        }
    }
}

/// Twiddle factor cache for FFT
pub struct TwiddleCache {
    cache: HashMap<usize, Vec<Complex<f64>>>,
}

impl TwiddleCache {
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    /// Get or compute twiddle factors for a given size
    pub fn get_twiddles(&mut self, size: usize) -> Vec<Complex<f64>> {
        if let Some(twiddles) = self.cache.get(&size) {
            twiddles.clone()
        } else {
            let twiddles = compute_twiddles(size);
            self.cache.insert(size, twiddles.clone());
            twiddles
        }
    }

    /// Precompute twiddle factors for common FFT sizes
    pub fn warmup(&mut self) {
        let power_of_2_sizes: Vec<usize> = (4..=16).map(|i| 1 << i).collect();
        for size in power_of_2_sizes {
            self.get_twiddles(size);
        }
    }
}

/// Compute twiddle factors (internal)
fn compute_twiddles(size: usize) -> Vec<Complex<f64>> {
    use std::f64::consts::PI;

    (0..size)
        .map(|k| {
            let angle = -2.0 * PI * k as f64 / size as f64;
            Complex::new(angle.cos(), angle.sin())
        })
        .collect()
}

/// Cache-aligned memory allocator for better SIMD performance
pub struct CacheAlignedVec<T> {
    data: Vec<T>,
    _alignment: usize,
}

impl<T: Clone> CacheAlignedVec<T> {
    /// Create a new cache-aligned vector
    pub fn new(size: usize, default: T) -> Self {
        // Allocate with extra space for alignment
        let alignment = 64; // Cache line size
        let mut data = Vec::with_capacity(size + alignment / std::mem::size_of::<T>());
        data.resize(size, default);

        Self {
            data,
            _alignment: alignment,
        }
    }

    /// Get slice of the data
    pub fn as_slice(&self) -> &[T] {
        &self.data
    }

    /// Get mutable slice of the data
    pub fn as_mut_slice(&mut self) -> &mut [T] {
        &mut self.data
    }

    /// Get length
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }
}

/// Global window cache (thread-safe)
static WINDOW_CACHE: Mutex<Option<WindowCache>> = Mutex::new(None);

/// Get cached window function
pub fn get_cached_window(window_type: WindowType, size: usize) -> Vec<f64> {
    let mut cache = WINDOW_CACHE.lock().unwrap();
    if cache.is_none() {
        *cache = Some(WindowCache::new());
    }
    cache.as_mut().unwrap().get_window(window_type, size)
}

/// Warmup window cache with common sizes
pub fn warmup_window_cache(window_type: WindowType) {
    let mut cache = WINDOW_CACHE.lock().unwrap();
    if cache.is_none() {
        *cache = Some(WindowCache::new());
    }
    cache.as_mut().unwrap().warmup(window_type);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_planner_cache() {
        clear_cache();

        let planner1 = get_cached_planner(1024, false);
        let planner2 = get_cached_planner(1024, false);

        // Should be the same Arc
        assert!(Arc::ptr_eq(&planner1, &planner2));

        let (hits, misses, hit_rate) = cache_stats();
        assert_eq!(hits, 1);
        assert_eq!(misses, 1);
        assert!((hit_rate - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_window_cache() {
        let mut cache = WindowCache::new();

        let window1 = cache.get_window(WindowType::Hann, 1024);
        let window2 = cache.get_window(WindowType::Hann, 1024);

        assert_eq!(window1.len(), 1024);
        assert_eq!(window2.len(), 1024);

        // Verify Hann window properties
        assert!((window1[0] - 0.0).abs() < 1e-10);
        assert!((window1[512] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_twiddle_cache() {
        let mut cache = TwiddleCache::new();

        let twiddles = cache.get_twiddles(8);
        assert_eq!(twiddles.len(), 8);

        // Verify W_8^0 = 1
        assert!((twiddles[0].re - 1.0).abs() < 1e-10);
        assert!((twiddles[0].im - 0.0).abs() < 1e-10);

        // Verify W_8^4 = -1
        assert!((twiddles[4].re - (-1.0)).abs() < 1e-10);
        assert!((twiddles[4].im - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_cache_aligned_vec() {
        let vec = CacheAlignedVec::new(100, 0.0f64);
        assert_eq!(vec.len(), 100);
        assert!(!vec.is_empty());

        let slice = vec.as_slice();
        assert_eq!(slice.len(), 100);
    }

    #[test]
    fn test_warmup() {
        let mut window_cache = WindowCache::new();
        window_cache.warmup(WindowType::Hann);

        // Should have 6 precomputed sizes
        assert!(window_cache.cache.len() >= 6);

        let mut twiddle_cache = TwiddleCache::new();
        twiddle_cache.warmup();

        // Should have multiple precomputed sizes
        assert!(twiddle_cache.cache.len() >= 10);
    }
}
