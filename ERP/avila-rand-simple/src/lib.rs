// Simple random number generator replacement

use std::cell::Cell;
use std::time::{SystemTime, UNIX_EPOCH};

thread_local! {
    static RNG_STATE: Cell<u64> = Cell::new(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64
    );
}

/// Simple LCG random number generator
pub struct RngStruct {
    state: u64,
}

impl RngStruct {
    pub fn new() -> Self {
        Self {
            state: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos() as u64,
        }
    }

    pub fn from_seed(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next_u64(&mut self) -> u64 {
        // Linear Congruential Generator
        const A: u64 = 6364136223846793005;
        const C: u64 = 1442695040888963407;
        self.state = self.state.wrapping_mul(A).wrapping_add(C);
        self.state
    }

    pub fn gen<T: SampleUniform>(&mut self) -> T {
        T::sample_uniform(self)
    }

    pub fn gen_range<T: SampleRange>(&mut self, range: std::ops::Range<T>) -> T {
        T::sample_range(self, range)
    }
}

impl Default for RngStruct {
    fn default() -> Self {
        Self::new()
    }
}

pub trait SampleUniform: Sized {
    fn sample_uniform(rng: &mut impl RngCore) -> Self;
}

impl SampleUniform for f64 {
    fn sample_uniform(rng: &mut impl RngCore) -> Self {
        let val = rng.next_u64();
        (val as f64) / (u64::MAX as f64)
    }
}

impl SampleUniform for f32 {
    fn sample_uniform(rng: &mut impl RngCore) -> Self {
        let val = rng.next_u64();
        (val as f32) / (u64::MAX as f32)
    }
}

pub trait SampleRange: Sized {
    fn sample_range(rng: &mut impl RngCore, range: std::ops::Range<Self>) -> Self;
}

impl SampleRange for f64 {
    fn sample_range(rng: &mut impl RngCore, range: std::ops::Range<Self>) -> Self {
        let val = (rng.next_u64() as f64) / (u64::MAX as f64);
        range.start + val * (range.end - range.start)
    }
}

impl SampleRange for f32 {
    fn sample_range(rng: &mut impl RngCore, range: std::ops::Range<Self>) -> Self {
        let val = (rng.next_u64() as f32) / (u64::MAX as f32);
        range.start + val * (range.end - range.start)
    }
}

impl SampleRange for usize {
    fn sample_range(rng: &mut impl RngCore, range: std::ops::Range<Self>) -> Self {
        let val = rng.next_u64();
        range.start + (val as usize) % (range.end - range.start)
    }
}

/// Thread-local RNG
pub fn thread_rng() -> ThreadRng {
    ThreadRng
}

pub struct ThreadRng;

impl ThreadRng {
    pub fn gen<T: SampleUniform>(&mut self) -> T {
        RNG_STATE.with(|state| {
            let mut rng = RngStruct { state: state.get() };
            let val = rng.gen();
            state.set(rng.state);
            val
        })
    }

    pub fn gen_range<T: SampleRange>(&mut self, range: std::ops::Range<T>) -> T {
        RNG_STATE.with(|state| {
            let mut rng = RngStruct { state: state.get() };
            let val = rng.gen_range(range);
            state.set(rng.state);
            val
        })
    }
}

/// Shuffle trait
pub trait SliceRandom {
    type Item;
    fn shuffle(&mut self, rng: &mut impl RngCore);
}

impl<T> SliceRandom for [T] {
    type Item = T;

    fn shuffle(&mut self, rng: &mut impl RngCore) {
        let mut i = self.len();
        while i > 1 {
            i -= 1;
            let j = rng.next_u64() as usize % (i + 1);
            self.swap(i, j);
        }
    }
}

pub trait RngCore {
    fn next_u64(&mut self) -> u64;
}

impl RngCore for RngStruct {
    fn next_u64(&mut self) -> u64 {
        self.next_u64()
    }
}

impl RngCore for ThreadRng {
    fn next_u64(&mut self) -> u64 {
        RNG_STATE.with(|state| {
            let mut rng = RngStruct { state: state.get() };
            let val = rng.next_u64();
            state.set(rng.state);
            val
        })
    }
}

// Re-export for compatibility
pub trait Rng: RngCore {
    fn gen<T: SampleUniform>(&mut self) -> T where Self: Sized {
        T::sample_uniform(self)
    }

    fn gen_range<T: SampleRange>(&mut self, range: std::ops::Range<T>) -> T where Self: Sized {
        T::sample_range(self, range)
    }
}

impl<R: RngCore> Rng for R {}

// Box-Muller transform for normal distribution
pub struct Normal {
    mean: f64,
    std_dev: f64,
}

impl Normal {
    pub fn new(mean: f64, std_dev: f64) -> Result<Self, &'static str> {
        if std_dev <= 0.0 {
            return Err("Standard deviation must be positive");
        }
        Ok(Self { mean, std_dev })
    }

    pub fn sample<R: RngCore>(&self, rng: &mut R) -> f64 {
        // Box-Muller transform
        let u1: f64 = (rng.next_u64() as f64) / (u64::MAX as f64);
        let u2: f64 = (rng.next_u64() as f64) / (u64::MAX as f64);

        let z0 = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
        self.mean + self.std_dev * z0
    }
}

pub trait Distribution<T> {
    fn sample<R: RngCore>(&self, rng: &mut R) -> T;
}

impl Distribution<f64> for Normal {
    fn sample<R: RngCore>(&self, rng: &mut R) -> f64 {
        self.sample(rng)
    }
}

impl Distribution<f32> for Normal {
    fn sample<R: RngCore>(&self, rng: &mut R) -> f32 {
        self.sample(rng) as f32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rng_struct() {
        let mut rng = RngStruct::new();
        let v1: f64 = rng.gen();
        let v2: f64 = rng.gen();
        assert_ne!(v1, v2);
    }

    #[test]
    fn test_thread_rng() {
        let mut rng = thread_rng();
        let v: f64 = rng.gen();
        assert!(v >= 0.0 && v <= 1.0);
    }

    #[test]
    fn test_range() {
        let mut rng = RngStruct::new();
        let v = rng.gen_range(10..20);
        assert!(v >= 10 && v < 20);
    }

    #[test]
    fn test_shuffle() {
        let mut rng = RngStruct::new();
        let mut arr = [1, 2, 3, 4, 5];
        arr.shuffle(&mut rng);
        assert_eq!(arr.len(), 5);
    }

    #[test]
    fn test_normal_distribution() {
        let normal = Normal::new(0.0, 1.0).unwrap();
        let mut rng = RngStruct::new();
        let _sample: f64 = normal.sample(&mut rng);
    }
}
