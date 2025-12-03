//! Avila Rand - Gerador de números aleatórios nativo
//! Substitui rand - 100% Rust std

use std::cell::RefCell;

thread_local! {
    static RNG: RefCell<Xoshiro256> = RefCell::new(Xoshiro256::new());
}

// Xoshiro256** - algoritmo rápido e de qualidade
struct Xoshiro256 {
    s: [u64; 4],
}

impl Xoshiro256 {
    fn new() -> Self {
        let seed = Self::seed_from_time();
        Self::from_seed(seed)
    }

    fn from_seed(seed: u64) -> Self {
        let mut s = [0u64; 4];
        s[0] = seed;
        s[1] = seed.wrapping_mul(0x9e3779b97f4a7c15);
        s[2] = seed.wrapping_mul(0xbf58476d1ce4e5b9);
        s[3] = seed.wrapping_mul(0x94d049bb133111eb);
        Self { s }
    }

    fn seed_from_time() -> u64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64
    }

    fn next(&mut self) -> u64 {
        let result = self.s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = self.s[1] << 17;

        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);

        result
    }
}

pub struct Rng;

impl Rng {
    pub fn new() -> Self {
        Self
    }

    pub fn gen<T: Rand>(&mut self) -> T {
        T::rand(self)
    }

    pub fn gen_range<T: RandRange>(&mut self, range: std::ops::Range<T>) -> T {
        T::rand_range(self, range)
    }

    fn next_u64(&mut self) -> u64 {
        RNG.with(|rng| rng.borrow_mut().next())
    }
}

impl Default for Rng {
    fn default() -> Self {
        Self::new()
    }
}

pub trait Rand: Sized {
    fn rand(rng: &mut Rng) -> Self;
}

pub trait RandRange: Sized {
    fn rand_range(rng: &mut Rng, range: std::ops::Range<Self>) -> Self;
}

impl Rand for u64 {
    fn rand(rng: &mut Rng) -> Self {
        rng.next_u64()
    }
}

impl Rand for u32 {
    fn rand(rng: &mut Rng) -> Self {
        rng.next_u64() as u32
    }
}

impl Rand for u16 {
    fn rand(rng: &mut Rng) -> Self {
        rng.next_u64() as u16
    }
}

impl Rand for u8 {
    fn rand(rng: &mut Rng) -> Self {
        rng.next_u64() as u8
    }
}

impl Rand for i64 {
    fn rand(rng: &mut Rng) -> Self {
        rng.next_u64() as i64
    }
}

impl Rand for i32 {
    fn rand(rng: &mut Rng) -> Self {
        rng.next_u64() as i32
    }
}

impl Rand for f64 {
    fn rand(rng: &mut Rng) -> Self {
        let bits = rng.next_u64();
        let float_bits = (bits >> 12) | 0x3FF0_0000_0000_0000;
        f64::from_bits(float_bits) - 1.0
    }
}

impl Rand for f32 {
    fn rand(rng: &mut Rng) -> Self {
        f64::rand(rng) as f32
    }
}

impl Rand for bool {
    fn rand(rng: &mut Rng) -> Self {
        (rng.next_u64() & 1) == 1
    }
}

impl RandRange for u64 {
    fn rand_range(rng: &mut Rng, range: std::ops::Range<Self>) -> Self {
        let span = range.end - range.start;
        range.start + (rng.next_u64() % span)
    }
}

impl RandRange for usize {
    fn rand_range(rng: &mut Rng, range: std::ops::Range<Self>) -> Self {
        let span = range.end - range.start;
        range.start + ((rng.next_u64() as usize) % span)
    }
}

impl RandRange for u32 {
    fn rand_range(rng: &mut Rng, range: std::ops::Range<Self>) -> Self {
        let span = range.end - range.start;
        range.start + ((rng.next_u64() as u32) % span)
    }
}

impl RandRange for i32 {
    fn rand_range(rng: &mut Rng, range: std::ops::Range<Self>) -> Self {
        let span = (range.end - range.start) as u32;
        range.start + ((rng.next_u64() as u32) % span) as i32
    }
}

impl RandRange for f64 {
    fn rand_range(rng: &mut Rng, range: std::ops::Range<Self>) -> Self {
        let span = range.end - range.start;
        range.start + f64::rand(rng) * span
    }
}

// Funções globais
pub fn random<T: Rand>() -> T {
    Rng::new().gen()
}

pub fn random_range<T: RandRange>(range: std::ops::Range<T>) -> T {
    Rng::new().gen_range(range)
}

pub fn shuffle<T>(slice: &mut [T]) {
    let mut rng = Rng::new();
    for i in (1..slice.len()).rev() {
        let j = rng.gen_range(0..i + 1);
        slice.swap(i, j);
    }
}

pub fn seed(seed: u64) {
    RNG.with(|rng| {
        *rng.borrow_mut() = Xoshiro256::from_seed(seed);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_types() {
        let mut rng = Rng::new();
        let _u: u64 = rng.gen();
        let _f: f64 = rng.gen();
        let _b: bool = rng.gen();
    }

    #[test]
    fn test_range() {
        let mut rng = Rng::new();
        for _ in 0..100 {
            let val = rng.gen_range(10..20);
            assert!(val >= 10 && val < 20);
        }
    }

    #[test]
    fn test_global_functions() {
        let _v: u32 = random();
        let v = random_range(5..15);
        assert!(v >= 5 && v < 15);
    }

    #[test]
    fn test_shuffle() {
        let mut arr = [1, 2, 3, 4, 5];
        shuffle(&mut arr);
        assert_eq!(arr.len(), 5);
    }

    #[test]
    fn test_seed_determinism() {
        seed(12345);
        let mut rng = Rng::new();
        let v1: u64 = rng.gen();

        seed(12345);
        let mut rng2 = Rng::new();
        let v2: u64 = rng2.gen();

        assert_eq!(v1, v2);
    }
}
