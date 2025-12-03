//! Avila FFT - Fast Fourier Transform
//! Implementação científica pura em Rust - algoritmo Cooley-Tukey
//!
//! # Características
//! - FFT iterativa in-place com bit-reversal
//! - Suporte genérico para f32 e f64
//! - Cache de twiddle factors
//! - FFT para sinais reais (RFFT)
//! - Funções de janelamento científicas
//! - Zero dependências externas

use std::f64::consts::PI;

/// Trait para operações de ponto flutuante genéricas
pub trait Float: Copy + Clone + std::fmt::Debug +
    std::ops::Add<Output = Self> +
    std::ops::Sub<Output = Self> +
    std::ops::Mul<Output = Self> +
    std::ops::Div<Output = Self> +
    std::cmp::PartialOrd {
    const PI: Self;
    const ZERO: Self;
    const ONE: Self;
    const TWO: Self;    fn sin(self) -> Self;
    fn cos(self) -> Self;
    fn atan2(self, other: Self) -> Self;
    fn sqrt(self) -> Self;
    fn exp(self) -> Self;
    fn powf(self, n: Self) -> Self;
    fn abs(self) -> Self;
    fn from_usize(n: usize) -> Self;
    fn from_f64(f: f64) -> Self;
    fn to_f64(self) -> f64;
    fn is_nan(self) -> bool;
    fn is_infinite(self) -> bool;
}

impl Float for f64 {
    const PI: Self = std::f64::consts::PI;
    const ZERO: Self = 0.0;
    const ONE: Self = 1.0;
    const TWO: Self = 2.0;

    #[inline]
    fn sin(self) -> Self { self.sin() }
    #[inline]
    fn cos(self) -> Self { self.cos() }
    #[inline]
    fn atan2(self, other: Self) -> Self { self.atan2(other) }
    #[inline]
    fn sqrt(self) -> Self { self.sqrt() }
    #[inline]
    fn exp(self) -> Self { self.exp() }
    #[inline]
    fn powf(self, n: Self) -> Self { self.powf(n) }
    #[inline]
    fn abs(self) -> Self { self.abs() }
    #[inline]
    fn from_usize(n: usize) -> Self { n as f64 }
    #[inline]
    fn from_f64(f: f64) -> Self { f }
    #[inline]
    fn to_f64(self) -> f64 { self }
    #[inline]
    fn is_nan(self) -> bool { self.is_nan() }
    #[inline]
    fn is_infinite(self) -> bool { self.is_infinite() }
}

impl Float for f32 {
    const PI: Self = std::f32::consts::PI;
    const ZERO: Self = 0.0;
    const ONE: Self = 1.0;
    const TWO: Self = 2.0;

    #[inline]
    fn sin(self) -> Self { self.sin() }
    #[inline]
    fn cos(self) -> Self { self.cos() }
    #[inline]
    fn atan2(self, other: Self) -> Self { self.atan2(other) }
    #[inline]
    fn sqrt(self) -> Self { self.sqrt() }
    #[inline]
    fn exp(self) -> Self { self.exp() }
    #[inline]
    fn powf(self, n: Self) -> Self { self.powf(n) }
    #[inline]
    fn abs(self) -> Self { self.abs() }
    #[inline]
    fn from_usize(n: usize) -> Self { n as f32 }
    #[inline]
    fn from_f64(f: f64) -> Self { f as f32 }
    #[inline]
    fn to_f64(self) -> f64 { self as f64 }
    #[inline]
    fn is_nan(self) -> bool { self.is_nan() }
    #[inline]
    fn is_infinite(self) -> bool { self.is_infinite() }
}

/// Número complexo genérico com suporte a f32 e f64
#[derive(Clone, Copy, Debug)]
pub struct Complex<T: Float> {
    pub re: T,
    pub im: T,
}

impl<T: Float> Complex<T> {
    #[inline]
    pub fn new(re: T, im: T) -> Self {
        Self { re, im }
    }

    #[inline]
    pub fn zero() -> Self {
        Self { re: T::ZERO, im: T::ZERO }
    }

    #[inline]
    pub fn one() -> Self {
        Self { re: T::ONE, im: T::ZERO }
    }

    #[inline]
    pub fn i() -> Self {
        Self { re: T::ZERO, im: T::ONE }
    }

    /// Norma (módulo) do número complexo: |z| = √(re² + im²)
    #[inline]
    pub fn norm(&self) -> T {
        (self.re * self.re + self.im * self.im).sqrt()
    }

    /// Norma quadrada (mais eficiente): |z|² = re² + im²
    #[inline]
    pub fn norm_sqr(&self) -> T {
        self.re * self.re + self.im * self.im
    }

    /// Conjugado complexo: z* = re - i·im
    #[inline]
    pub fn conj(&self) -> Self {
        Self {
            re: self.re,
            im: T::ZERO - self.im,
        }
    }

    /// Argumento (fase) do número complexo: arg(z) = atan2(im, re)
    #[inline]
    pub fn arg(&self) -> T {
        self.im.atan2(self.re)
    }

    /// Exponencial complexa: exp(z) = exp(re) · (cos(im) + i·sin(im))
    #[inline]
    pub fn exp(&self) -> Self {
        let r = self.re.exp();
        Self {
            re: r * self.im.cos(),
            im: r * self.im.sin(),
        }
    }

    /// Potência de número complexo: z^n usando forma polar
    #[inline]
    pub fn powf(&self, n: T) -> Self {
        let r = self.norm();
        let theta = self.arg();
        let r_n = r.powf(n);
        let n_theta = n * theta;
        Self {
            re: r_n * n_theta.cos(),
            im: r_n * n_theta.sin(),
        }
    }

    /// Verifica se contém NaN
    #[inline]
    pub fn is_nan(&self) -> bool {
        self.re.is_nan() || self.im.is_nan()
    }

    /// Verifica se contém infinito
    #[inline]
    pub fn is_infinite(&self) -> bool {
        self.re.is_infinite() || self.im.is_infinite()
    }

    /// Verifica se é finito (não NaN nem infinito)
    #[inline]
    pub fn is_finite(&self) -> bool {
        !self.is_nan() && !self.is_infinite()
    }
}

impl<T: Float> std::ops::Add for Complex<T> {
    type Output = Self;
    #[inline]
    fn add(self, rhs: Self) -> Self {
        Self {
            re: self.re + rhs.re,
            im: self.im + rhs.im,
        }
    }
}

impl<T: Float> std::ops::Sub for Complex<T> {
    type Output = Self;
    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Self {
            re: self.re - rhs.re,
            im: self.im - rhs.im,
        }
    }
}

impl<T: Float> std::ops::Mul for Complex<T> {
    type Output = Self;
    #[inline]
    fn mul(self, rhs: Self) -> Self {
        Self {
            re: self.re * rhs.re - self.im * rhs.im,
            im: self.re * rhs.im + self.im * rhs.re,
        }
    }
}

impl<T: Float> std::ops::Mul for &Complex<T> {
    type Output = Complex<T>;
    #[inline]
    fn mul(self, rhs: Self) -> Complex<T> {
        Complex {
            re: self.re * rhs.re - self.im * rhs.im,
            im: self.re * rhs.im + self.im * rhs.re,
        }
    }
}

impl<T: Float> std::ops::Div for Complex<T> {
    type Output = Self;
    #[inline]
    fn div(self, rhs: Self) -> Self {
        let denom = rhs.re * rhs.re + rhs.im * rhs.im;
        Self {
            re: (self.re * rhs.re + self.im * rhs.im) / denom,
            im: (self.im * rhs.re - self.re * rhs.im) / denom,
        }
    }
}

impl<T: Float> std::ops::Div<T> for Complex<T> {
    type Output = Self;
    #[inline]
    fn div(self, rhs: T) -> Self {
        Self {
            re: self.re / rhs,
            im: self.im / rhs,
        }
    }
}

impl<T: Float> std::ops::Mul<T> for Complex<T> {
    type Output = Self;
    #[inline]
    fn mul(self, rhs: T) -> Self {
        Self {
            re: self.re * rhs,
            im: self.im * rhs,
        }
    }
}

impl<T: Float> std::ops::AddAssign for Complex<T> {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        self.re = self.re + rhs.re;
        self.im = self.im + rhs.im;
    }
}

impl<T: Float> std::ops::SubAssign for Complex<T> {
    #[inline]
    fn sub_assign(&mut self, rhs: Self) {
        self.re = self.re - rhs.re;
        self.im = self.im - rhs.im;
    }
}

impl<T: Float> std::ops::MulAssign<T> for Complex<T> {
    #[inline]
    fn mul_assign(&mut self, rhs: T) {
        self.re = self.re * rhs;
        self.im = self.im * rhs;
    }
}

impl<T: Float> std::iter::Sum for Complex<T> {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        iter.fold(Complex::zero(), |acc, x| acc + x)
    }
}

impl<'a, T: Float> std::iter::Sum<&'a Complex<T>> for Complex<T> {
    fn sum<I: Iterator<Item = &'a Complex<T>>>(iter: I) -> Self {
        iter.fold(Complex::zero(), |acc, x| acc + *x)
    }
}

/// Erros da biblioteca FFT
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FftError {
    /// Tamanho não é potência de 2
    InvalidSize,
    /// Input contém NaN
    ContainsNaN,
    /// Input contém infinito
    ContainsInfinity,
    /// Tamanho zero
    EmptyInput,
}

impl std::fmt::Display for FftError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            FftError::InvalidSize => write!(f, "Tamanho deve ser potência de 2"),
            FftError::ContainsNaN => write!(f, "Input contém NaN"),
            FftError::ContainsInfinity => write!(f, "Input contém infinito"),
            FftError::EmptyInput => write!(f, "Input vazio"),
        }
    }
}

impl std::error::Error for FftError {}

pub type Result<T> = std::result::Result<T, FftError>;

/// Verifica se n é potência de 2
#[inline]
fn is_power_of_two(n: usize) -> bool {
    n > 0 && (n & (n - 1)) == 0
}

/// Calcula log₂(n) para potências de 2
#[inline]
fn log2(mut n: usize) -> usize {
    let mut log = 0;
    while n > 1 {
        n >>= 1;
        log += 1;
    }
    log
}

/// Bit-reversal permutation
/// Reorganiza array de acordo com índices bit-reversed
#[inline]
fn bit_reverse_permutation<T: Float>(data: &mut [Complex<T>]) {
    let n = data.len();
    let log_n = log2(n);

    for i in 0..n {
        let j = reverse_bits(i, log_n);
        if i < j {
            data.swap(i, j);
        }
    }
}

/// Reverte bits de um número
#[inline]
fn reverse_bits(mut x: usize, bits: usize) -> usize {
    let mut result = 0;
    for _ in 0..bits {
        result = (result << 1) | (x & 1);
        x >>= 1;
    }
    result
}

/// Planner para FFT - pré-calcula e cacheia twiddle factors
pub struct FftPlanner<T: Float> {
    size: usize,
    twiddles: Vec<Complex<T>>,
    inverse: bool,
}

impl<T: Float> FftPlanner<T> {
    /// Cria novo planner para tamanho específico
    pub fn new(size: usize, inverse: bool) -> Result<Self> {
        if size == 0 {
            return Err(FftError::EmptyInput);
        }
        if !is_power_of_two(size) {
            return Err(FftError::InvalidSize);
        }

        let twiddles = Self::precompute_twiddles(size, inverse);
        Ok(Self { size, twiddles, inverse })
    }

    /// Pré-computa twiddle factors: W_N^k = exp(-2πik/N)
    fn precompute_twiddles(n: usize, inverse: bool) -> Vec<Complex<T>> {
        let sign = if inverse { T::ONE } else { T::ZERO - T::ONE };
        let mut twiddles = Vec::with_capacity(n / 2);

        for k in 0..n/2 {
            let angle = sign * T::TWO * T::PI * T::from_usize(k) / T::from_usize(n);
            twiddles.push(Complex::new(angle.cos(), angle.sin()));
        }

        twiddles
    }

    /// Executa FFT iterativa in-place usando Cooley-Tukey
    pub fn process_in_place(&self, data: &mut [Complex<T>]) -> Result<()> {
        if data.len() != self.size {
            return Err(FftError::InvalidSize);
        }

        // Validação científica
        for c in data.iter() {
            if c.is_nan() {
                return Err(FftError::ContainsNaN);
            }
            if c.is_infinite() {
                return Err(FftError::ContainsInfinity);
            }
        }

        // Bit-reversal permutation
        bit_reverse_permutation(data);

        // Algoritmo iterativo Cooley-Tukey
        let n = data.len();
        let mut size = 2;

        while size <= n {
            let half_size = size / 2;
            let step = n / size;

            for i in (0..n).step_by(size) {
                for j in 0..half_size {
                    let k = j * step;
                    let twiddle = self.twiddles[k];

                    let t = twiddle * data[i + j + half_size];
                    let u = data[i + j];

                    data[i + j] = u + t;
                    data[i + j + half_size] = u - t;
                }
            }

            size *= 2;
        }

        // Normalização para IFFT
        if self.inverse {
            let scale = T::ONE / T::from_usize(n);
            for c in data.iter_mut() {
                *c *= scale;
            }
        }

        Ok(())
    }

    /// Processa e retorna novo vetor
    pub fn process(&self, input: &[Complex<T>]) -> Result<Vec<Complex<T>>> {
        let mut output = input.to_vec();
        self.process_in_place(&mut output)?;
        Ok(output)
    }
}

pub struct Fft {
    size: usize,
}

impl Fft {
    pub fn new(size: usize) -> Self {
        Self { size }
    }

    pub fn process(&self, input: &[Complex<f64>]) -> Vec<Complex<f64>> {
        if input.len() != self.size {
            panic!("Input size mismatch");
        }
        fft_recursive(input)
    }

    pub fn process_with_scratch(&self, input: &mut [Complex<f64>], _scratch: &mut [Complex<f64>]) {
        let result = self.process(input);
        input.copy_from_slice(&result);
    }
}

fn fft_recursive(x: &[Complex<f64>]) -> Vec<Complex<f64>> {
    let n = x.len();

    if n <= 1 {
        return x.to_vec();
    }

    // Divide
    let mut even = Vec::with_capacity(n / 2);
    let mut odd = Vec::with_capacity(n / 2);

    for (i, &val) in x.iter().enumerate() {
        if i % 2 == 0 {
            even.push(val);
        } else {
            odd.push(val);
        }
    }

    // Conquer
    let even_fft = fft_recursive(&even);
    let odd_fft = fft_recursive(&odd);

    // Combine
    let mut result = vec![Complex::zero(); n];

    for k in 0..n / 2 {
        let angle = -2.0 * PI * (k as f64) / (n as f64);
        let twiddle = Complex::new(angle.cos(), angle.sin());
        let t = twiddle * odd_fft[k];

        result[k] = even_fft[k] + t;
        result[k + n / 2] = even_fft[k] - t;
    }

    result
}

/// FFT usando algoritmo recursivo (compatibilidade)
pub fn fft(input: &[Complex<f64>]) -> Vec<Complex<f64>> {
    fft_recursive(input)
}

/// FFT genérica - recomendado usar FftPlanner para melhor performance
pub fn fft_generic<T: Float>(input: &[Complex<T>]) -> Result<Vec<Complex<T>>> {
    let planner = FftPlanner::new(input.len(), false)?;
    planner.process(input)
}

/// IFFT usando algoritmo recursivo (compatibilidade)
pub fn ifft(input: &[Complex<f64>]) -> Vec<Complex<f64>> {
    let n = input.len();

    // Conjugate
    let conjugated: Vec<Complex<f64>> = input
        .iter()
        .map(|c| Complex::new(c.re, -c.im))
        .collect();

    // FFT
    let result = fft_recursive(&conjugated);

    // Conjugate and scale
    result
        .iter()
        .map(|c| Complex::new(c.re / n as f64, -c.im / n as f64))
        .collect()
}

/// IFFT genérica - recomendado usar FftPlanner
pub fn ifft_generic<T: Float>(input: &[Complex<T>]) -> Result<Vec<Complex<T>>> {
    let planner = FftPlanner::new(input.len(), true)?;
    planner.process(input)
}

/// FFT para sinais reais - aproveita simetria Hermitiana
/// Retorna apenas frequências positivas (N/2+1 pontos)
pub fn rfft<T: Float>(input: &[T]) -> Result<Vec<Complex<T>>> {
    let n = input.len();
    if !is_power_of_two(n) {
        return Err(FftError::InvalidSize);
    }

    // Converte para complexo
    let complex_input: Vec<Complex<T>> = input
        .iter()
        .map(|&x| Complex::new(x, T::ZERO))
        .collect();

    // FFT completa
    let full_fft = fft_generic(&complex_input)?;

    // Retorna apenas metade (simetria Hermitiana)
    Ok(full_fft[..n/2 + 1].to_vec())
}

/// IFFT para sinais reais - reconstrução a partir de espectro Hermitiano
pub fn irfft<T: Float>(input: &[Complex<T>], n: usize) -> Result<Vec<T>> {
    if !is_power_of_two(n) {
        return Err(FftError::InvalidSize);
    }

    // Reconstrói espectro completo usando simetria Hermitiana
    let mut full_spectrum = vec![Complex::zero(); n];

    // Copia metade positiva
    for (i, &val) in input.iter().enumerate() {
        full_spectrum[i] = val;
    }

    // Reconstrói metade negativa (conjugado reverso)
    for i in 1..n/2 {
        full_spectrum[n - i] = full_spectrum[i].conj();
    }

    // IFFT
    let complex_output = ifft_generic(&full_spectrum)?;

    // Extrai parte real
    Ok(complex_output.iter().map(|c| c.re).collect())
}

/// Funções de janelamento para análise espectral
pub mod window {
    use super::Float;

    /// Janela de Hamming: w(n) = 0.54 - 0.46·cos(2πn/(N-1))
    pub fn hamming<T: Float>(n: usize) -> Vec<T> {
        let n_f = T::from_usize(n);
        (0..n)
            .map(|i| {
                let i_f = T::from_usize(i);
                let a0 = T::from_usize(54) / T::from_usize(100);
                let a1 = T::from_usize(46) / T::from_usize(100);
                let arg = T::TWO * T::PI * i_f / (n_f - T::ONE);
                a0 - a1 * arg.cos()
            })
            .collect()
    }

    /// Janela de Hann: w(n) = 0.5·(1 - cos(2πn/(N-1)))
    pub fn hann<T: Float>(n: usize) -> Vec<T> {
        let n_f = T::from_usize(n);
        (0..n)
            .map(|i| {
                let i_f = T::from_usize(i);
                let arg = T::TWO * T::PI * i_f / (n_f - T::ONE);
                (T::ONE - arg.cos()) / T::TWO
            })
            .collect()
    }

    /// Janela de Blackman: w(n) = 0.42 - 0.5·cos(2πn/(N-1)) + 0.08·cos(4πn/(N-1))
    pub fn blackman<T: Float>(n: usize) -> Vec<T> {
        let n_f = T::from_usize(n);
        (0..n)
            .map(|i| {
                let i_f = T::from_usize(i);
                let a0 = T::from_usize(42) / T::from_usize(100);
                let a1 = T::from_usize(50) / T::from_usize(100);
                let a2 = T::from_usize(8) / T::from_usize(100);
                let arg = T::TWO * T::PI * i_f / (n_f - T::ONE);
                a0 - a1 * arg.cos() + a2 * (T::TWO * arg).cos()
            })
            .collect()
    }

    /// Janela de Blackman-Harris: 4 termos, atenuação ~92dB
    pub fn blackman_harris<T: Float>(n: usize) -> Vec<T> {
        let n_f = T::from_usize(n);
        (0..n)
            .map(|i| {
                let i_f = T::from_usize(i);
                let a0 = T::from_usize(35875) / T::from_usize(100000);
                let a1 = T::from_usize(48829) / T::from_usize(100000);
                let a2 = T::from_usize(14128) / T::from_usize(100000);
                let a3 = T::from_usize(1168) / T::from_usize(100000);

                let arg = T::TWO * T::PI * i_f / (n_f - T::ONE);
                a0
                    - a1 * arg.cos()
                    + a2 * (T::TWO * arg).cos()
                    - a3 * (T::TWO * T::from_usize(3) * arg / T::TWO).cos()
            })
            .collect()
    }

    /// Janela triangular (Bartlett): w(n) = 1 - |2n/(N-1) - 1|
    pub fn bartlett<T: Float>(n: usize) -> Vec<T> {
        let n_f = T::from_usize(n);
        (0..n)
            .map(|i| {
                let i_f = T::from_usize(i);
                let x = T::TWO * i_f / (n_f - T::ONE) - T::ONE;
                T::ONE - x.abs()
            })
            .collect()
    }

    /// Janela retangular (todas as amostras = 1)
    pub fn rectangular<T: Float>(n: usize) -> Vec<T> {
        vec![T::ONE; n]
    }

    /// Aplica janela a um sinal
    pub fn apply<T: Float>(signal: &[T], window: &[T]) -> Vec<T> {
        signal.iter()
            .zip(window.iter())
            .map(|(&s, &w)| s * w)
            .collect()
    }
}

/// Processamento de imagens 2D via FFT
pub mod fft2d {
    use super::*;

    /// Representa uma imagem/matriz 2D
    #[derive(Clone, Debug)]
    pub struct Image2D<T: Float> {
        pub width: usize,
        pub height: usize,
        pub data: Vec<Complex<T>>,
    }

    impl<T: Float> Image2D<T> {
        /// Cria nova imagem 2D
        pub fn new(width: usize, height: usize) -> Self {
            Self {
                width,
                height,
                data: vec![Complex::zero(); width * height],
            }
        }

        /// Cria imagem a partir de dados reais
        pub fn from_real(width: usize, height: usize, data: Vec<T>) -> Result<Self> {
            if data.len() != width * height {
                return Err(FftError::InvalidSize);
            }
            Ok(Self {
                width,
                height,
                data: data.iter().map(|&x| Complex::new(x, T::ZERO)).collect(),
            })
        }

        /// Cria imagem a partir de dados complexos
        pub fn from_complex(width: usize, height: usize, data: Vec<Complex<T>>) -> Result<Self> {
            if data.len() != width * height {
                return Err(FftError::InvalidSize);
            }
            Ok(Self { width, height, data })
        }

        /// Acessa pixel em (x, y)
        #[inline]
        pub fn get(&self, x: usize, y: usize) -> Complex<T> {
            self.data[y * self.width + x]
        }

        /// Define pixel em (x, y)
        #[inline]
        pub fn set(&mut self, x: usize, y: usize, value: Complex<T>) {
            self.data[y * self.width + x] = value;
        }

        /// Extrai linha
        pub fn get_row(&self, y: usize) -> Vec<Complex<T>> {
            let start = y * self.width;
            self.data[start..start + self.width].to_vec()
        }

        /// Define linha
        pub fn set_row(&mut self, y: usize, row: &[Complex<T>]) {
            let start = y * self.width;
            self.data[start..start + self.width].copy_from_slice(row);
        }

        /// Extrai coluna
        pub fn get_column(&self, x: usize) -> Vec<Complex<T>> {
            (0..self.height)
                .map(|y| self.get(x, y))
                .collect()
        }

        /// Define coluna
        pub fn set_column(&mut self, x: usize, column: &[Complex<T>]) {
            for (y, &value) in column.iter().enumerate() {
                self.set(x, y, value);
            }
        }

        /// Calcula magnitude de cada pixel
        pub fn magnitude(&self) -> Vec<T> {
            self.data.iter().map(|c| c.norm()).collect()
        }

        /// Calcula espectro de potência
        pub fn power_spectrum(&self) -> Vec<T> {
            self.data.iter().map(|c| c.norm_sqr()).collect()
        }

        /// Shift FFT (move DC para centro)
        pub fn fftshift(&mut self) {
            let half_h = self.height / 2;
            let half_w = self.width / 2;

            // Swap quadrantes
            for y in 0..half_h {
                for x in 0..half_w {
                    // Q1 <-> Q3
                    let temp = self.get(x, y);
                    self.set(x, y, self.get(x + half_w, y + half_h));
                    self.set(x + half_w, y + half_h, temp);

                    // Q2 <-> Q4
                    let temp = self.get(x + half_w, y);
                    self.set(x + half_w, y, self.get(x, y + half_h));
                    self.set(x, y + half_h, temp);
                }
            }
        }
    }

    /// Planner para FFT 2D
    pub struct Fft2DPlanner<T: Float> {
        width: usize,
        height: usize,
        row_planner: FftPlanner<T>,
        col_planner: FftPlanner<T>,
        #[allow(dead_code)]
        inverse: bool,
    }

    impl<T: Float> Fft2DPlanner<T> {
        /// Cria novo planner 2D
        pub fn new(width: usize, height: usize, inverse: bool) -> Result<Self> {
            let row_planner = FftPlanner::new(width, inverse)?;
            let col_planner = FftPlanner::new(height, inverse)?;

            Ok(Self {
                width,
                height,
                row_planner,
                col_planner,
                inverse,
            })
        }

        /// Executa FFT 2D usando algoritmo row-column
        /// 1. FFT em cada linha
        /// 2. FFT em cada coluna
        pub fn process(&self, image: &Image2D<T>) -> Result<Image2D<T>> {
            if image.width != self.width || image.height != self.height {
                return Err(FftError::InvalidSize);
            }

            let mut result = image.clone();

            // FFT em cada linha
            for y in 0..self.height {
                let row = result.get_row(y);
                let transformed = self.row_planner.process(&row)?;
                result.set_row(y, &transformed);
            }

            // FFT em cada coluna
            for x in 0..self.width {
                let col = result.get_column(x);
                let transformed = self.col_planner.process(&col)?;
                result.set_column(x, &transformed);
            }

            Ok(result)
        }

        /// Processa in-place
        pub fn process_in_place(&self, image: &mut Image2D<T>) -> Result<()> {
            if image.width != self.width || image.height != self.height {
                return Err(FftError::InvalidSize);
            }

            // FFT em cada linha
            for y in 0..self.height {
                let mut row = image.get_row(y);
                self.row_planner.process_in_place(&mut row)?;
                image.set_row(y, &row);
            }

            // FFT em cada coluna
            for x in 0..self.width {
                let mut col = image.get_column(x);
                self.col_planner.process_in_place(&mut col)?;
                image.set_column(x, &col);
            }

            Ok(())
        }
    }

    /// FFT 2D conveniente
    pub fn fft2d<T: Float>(image: &Image2D<T>) -> Result<Image2D<T>> {
        let planner = Fft2DPlanner::new(image.width, image.height, false)?;
        planner.process(image)
    }

    /// IFFT 2D conveniente
    pub fn ifft2d<T: Float>(image: &Image2D<T>) -> Result<Image2D<T>> {
        let planner = Fft2DPlanner::new(image.width, image.height, true)?;
        planner.process(image)
    }
}

/// Filtros espaciais no domínio da frequência
pub mod filters {
    use super::*;
    use super::fft2d::*;

    /// Tipos de filtro
    #[derive(Debug, Clone, Copy)]
    pub enum FilterType {
        LowPass,
        HighPass,
        BandPass,
        BandReject,
    }

    /// Filtro ideal no domínio da frequência
    pub struct IdealFilter<T: Float> {
        width: usize,
        height: usize,
        filter_type: FilterType,
        cutoff: T,
        cutoff2: Option<T>, // Para band-pass/reject
    }

    impl<T: Float> IdealFilter<T> {
        /// Cria novo filtro ideal
        pub fn new(width: usize, height: usize, filter_type: FilterType, cutoff: T) -> Self {
            Self {
                width,
                height,
                filter_type,
                cutoff,
                cutoff2: None,
            }
        }

        /// Cria filtro banda (requer dois cutoffs)
        pub fn new_band(
            width: usize,
            height: usize,
            filter_type: FilterType,
            cutoff1: T,
            cutoff2: T,
        ) -> Self {
            Self {
                width,
                height,
                filter_type,
                cutoff: cutoff1,
                cutoff2: Some(cutoff2),
            }
        }

        /// Calcula distância do centro
        #[inline]
        fn distance(&self, x: usize, y: usize) -> T {
            let cx = T::from_usize(self.width) / T::TWO;
            let cy = T::from_usize(self.height) / T::TWO;
            let dx = T::from_usize(x) - cx;
            let dy = T::from_usize(y) - cy;
            (dx * dx + dy * dy).sqrt()
        }

        /// Aplica filtro à imagem no domínio da frequência
        pub fn apply(&self, freq_image: &mut Image2D<T>) {
            for y in 0..self.height {
                for x in 0..self.width {
                    let dist = self.distance(x, y);
                    let factor = self.filter_factor(dist);
                    let pixel = freq_image.get(x, y);
                    freq_image.set(x, y, pixel * factor);
                }
            }
        }

        /// Calcula fator de atenuação baseado no tipo de filtro
        fn filter_factor(&self, distance: T) -> T {
            match self.filter_type {
                FilterType::LowPass => {
                    if distance <= self.cutoff {
                        T::ONE
                    } else {
                        T::ZERO
                    }
                }
                FilterType::HighPass => {
                    if distance > self.cutoff {
                        T::ONE
                    } else {
                        T::ZERO
                    }
                }
                FilterType::BandPass => {
                    let cutoff2 = self.cutoff2.unwrap_or(self.cutoff);
                    if distance >= self.cutoff && distance <= cutoff2 {
                        T::ONE
                    } else {
                        T::ZERO
                    }
                }
                FilterType::BandReject => {
                    let cutoff2 = self.cutoff2.unwrap_or(self.cutoff);
                    if distance < self.cutoff || distance > cutoff2 {
                        T::ONE
                    } else {
                        T::ZERO
                    }
                }
            }
        }
    }

    /// Filtro Gaussiano (suave, sem ringing)
    pub struct GaussianFilter<T: Float> {
        width: usize,
        height: usize,
        sigma: T,
        high_pass: bool,
    }

    impl<T: Float> GaussianFilter<T> {
        /// Cria filtro Gaussiano
        pub fn new(width: usize, height: usize, sigma: T, high_pass: bool) -> Self {
            Self {
                width,
                height,
                sigma,
                high_pass,
            }
        }

        /// Calcula distância do centro
        #[inline]
        fn distance(&self, x: usize, y: usize) -> T {
            let cx = T::from_usize(self.width) / T::TWO;
            let cy = T::from_usize(self.height) / T::TWO;
            let dx = T::from_usize(x) - cx;
            let dy = T::from_usize(y) - cy;
            (dx * dx + dy * dy).sqrt()
        }

        /// Aplica filtro Gaussiano
        pub fn apply(&self, freq_image: &mut Image2D<T>) {
            for y in 0..self.height {
                for x in 0..self.width {
                    let dist = self.distance(x, y);
                    let dist_sqr = dist * dist;
                    let sigma_sqr = self.sigma * self.sigma;

                    // H(u,v) = exp(-D²(u,v) / 2σ²)
                    let factor = (T::ZERO - dist_sqr / (T::TWO * sigma_sqr)).exp();

                    let final_factor = if self.high_pass {
                        T::ONE - factor // High-pass = 1 - Low-pass
                    } else {
                        factor
                    };

                    let pixel = freq_image.get(x, y);
                    freq_image.set(x, y, pixel * final_factor);
                }
            }
        }
    }

    /// Convolução 2D via FFT (rápida para kernels grandes)
    pub fn convolve2d<T: Float>(
        image: &Image2D<T>,
        kernel: &Image2D<T>,
    ) -> Result<Image2D<T>> {
        // Ambas devem ter mesmo tamanho (pad se necessário)
        if image.width != kernel.width || image.height != kernel.height {
            return Err(FftError::InvalidSize);
        }

        // FFT de ambas
        let freq_image = fft2d(image)?;
        let freq_kernel = fft2d(kernel)?;

        // Multiplicação ponto-a-ponto no domínio da frequência
        let mut result = freq_image.clone();
        for i in 0..result.data.len() {
            result.data[i] = freq_image.data[i] * freq_kernel.data[i];
        }

        // IFFT para voltar ao domínio espacial
        ifft2d(&result)
    }
}

/// Análise tempo-frequência (STFT e Espectrograma)
pub mod timefreq {
    use super::*;

    /// Configuração de overlap entre janelas
    #[derive(Debug, Clone, Copy)]
    pub struct OverlapConfig {
        /// Tamanho da janela FFT
        pub window_size: usize,
        /// Passo entre janelas (hop size)
        pub hop_size: usize,
    }

    impl OverlapConfig {
        /// Cria configuração com overlap de 50%
        pub fn overlap_50(window_size: usize) -> Self {
            Self {
                window_size,
                hop_size: window_size / 2,
            }
        }

        /// Cria configuração com overlap de 75%
        pub fn overlap_75(window_size: usize) -> Self {
            Self {
                window_size,
                hop_size: window_size / 4,
            }
        }

        /// Cria configuração customizada
        pub fn new(window_size: usize, hop_size: usize) -> Result<Self> {
            if hop_size == 0 || hop_size > window_size {
                return Err(FftError::InvalidSize);
            }
            Ok(Self { window_size, hop_size })
        }

        /// Calcula número de frames
        pub fn num_frames(&self, signal_len: usize) -> usize {
            if signal_len < self.window_size {
                return 0;
            }
            (signal_len - self.window_size) / self.hop_size + 1
        }

        /// Calcula percentual de overlap
        pub fn overlap_percent(&self) -> f64 {
            100.0 * (1.0 - self.hop_size as f64 / self.window_size as f64)
        }
    }

    /// Espectrograma - matriz tempo-frequência
    #[derive(Clone, Debug)]
    pub struct Spectrogram<T: Float> {
        /// Dados [freq][time]
        pub data: Vec<Vec<Complex<T>>>,
        /// Número de frames temporais
        pub num_frames: usize,
        /// Número de bins de frequência
        pub num_freqs: usize,
        /// Taxa de amostragem
        pub sample_rate: T,
        /// Configuração de overlap
        pub config: OverlapConfig,
    }

    impl<T: Float> Spectrogram<T> {
        /// Cria espectrograma vazio
        pub fn new(
            num_frames: usize,
            num_freqs: usize,
            sample_rate: T,
            config: OverlapConfig,
        ) -> Self {
            let data = vec![vec![Complex::zero(); num_frames]; num_freqs];
            Self {
                data,
                num_frames,
                num_freqs,
                sample_rate,
                config,
            }
        }

        /// Acessa valor em (freq, time)
        #[inline]
        pub fn get(&self, freq_idx: usize, time_idx: usize) -> Complex<T> {
            self.data[freq_idx][time_idx]
        }

        /// Define valor em (freq, time)
        #[inline]
        pub fn set(&mut self, freq_idx: usize, time_idx: usize, value: Complex<T>) {
            self.data[freq_idx][time_idx] = value;
        }

        /// Calcula magnitude do espectrograma
        pub fn magnitude(&self) -> Vec<Vec<T>> {
            self.data
                .iter()
                .map(|freq_row| freq_row.iter().map(|c| c.norm()).collect())
                .collect()
        }

        /// Calcula potência (magnitude²)
        pub fn power(&self) -> Vec<Vec<T>> {
            self.data
                .iter()
                .map(|freq_row| freq_row.iter().map(|c| c.norm_sqr()).collect())
                .collect()
        }

        /// Calcula fase
        pub fn phase(&self) -> Vec<Vec<T>> {
            self.data
                .iter()
                .map(|freq_row| freq_row.iter().map(|c| c.arg()).collect())
                .collect()
        }

        /// Converte magnitude para dB
        pub fn magnitude_db(&self) -> Vec<Vec<T>> {
            let mag = self.magnitude();
            let twenty = T::from_usize(20);
            let epsilon = T::from_usize(1) / T::from_usize(1000000);
            mag.iter()
                .map(|row| {
                    row.iter()
                        .map(|&m| {
                            // Evita log(0)
                            let m_safe = if m > T::ZERO { m } else { epsilon };
                            let log_val = T::from_f64(m_safe.to_f64().log10());
                            twenty * log_val
                        })
                        .collect()
                })
                .collect()
        }

        /// Retorna vetor de frequências (Hz)
        pub fn frequencies(&self) -> Vec<T> {
            (0..self.num_freqs)
                .map(|k| {
                    T::from_usize(k) * self.sample_rate / T::from_usize(self.config.window_size)
                })
                .collect()
        }

        /// Retorna vetor de tempos (segundos)
        pub fn times(&self) -> Vec<T> {
            (0..self.num_frames)
                .map(|frame| {
                    T::from_usize(frame * self.config.hop_size) / self.sample_rate
                })
                .collect()
        }

        /// Centróide espectral por frame (centro de massa do espectro)
        pub fn spectral_centroid(&self) -> Vec<T> {
            let freqs = self.frequencies();
            let mag = self.magnitude();

            (0..self.num_frames)
                .map(|frame| {
                    let mut weighted_sum = T::ZERO;
                    let mut total_mag = T::ZERO;

                    for freq_idx in 0..self.num_freqs {
                        let m = mag[freq_idx][frame];
                        weighted_sum = weighted_sum + freqs[freq_idx] * m;
                        total_mag = total_mag + m;
                    }

                    if total_mag > T::ZERO {
                        weighted_sum / total_mag
                    } else {
                        T::ZERO
                    }
                })
                .collect()
        }

        /// Largura de banda espectral por frame
        pub fn spectral_bandwidth(&self) -> Vec<T> {
            let freqs = self.frequencies();
            let mag = self.magnitude();
            let centroid = self.spectral_centroid();

            (0..self.num_frames)
                .map(|frame| {
                    let mut variance = T::ZERO;
                    let mut total_mag = T::ZERO;

                    for freq_idx in 0..self.num_freqs {
                        let m = mag[freq_idx][frame];
                        let diff = freqs[freq_idx] - centroid[frame];
                        variance = variance + (diff * diff) * m;
                        total_mag = total_mag + m;
                    }

                    if total_mag > T::ZERO {
                        (variance / total_mag).sqrt()
                    } else {
                        T::ZERO
                    }
                })
                .collect()
        }

        /// Flatness espectral (razão entre média geométrica e aritmética)
        /// Valores próximos de 1 = ruído branco, próximos de 0 = tons puros
        pub fn spectral_flatness(&self) -> Vec<T> {
            let mag = self.magnitude();

            (0..self.num_frames)
                .map(|frame| {
                    let mut geometric_mean = T::ONE;
                    let mut arithmetic_mean = T::ZERO;
                    let n = T::from_usize(self.num_freqs);

                    for freq_idx in 0..self.num_freqs {
                        let m = mag[freq_idx][frame];
                        let m_safe = if m > T::ZERO { m } else { T::from_usize(1) / T::from_usize(1000000) };
                        geometric_mean = geometric_mean * m_safe;
                        arithmetic_mean = arithmetic_mean + m;
                    }

                    geometric_mean = geometric_mean.powf(T::ONE / n);
                    arithmetic_mean = arithmetic_mean / n;

                    if arithmetic_mean > T::ZERO {
                        geometric_mean / arithmetic_mean
                    } else {
                        T::ZERO
                    }
                })
                .collect()
        }

        /// Rolloff espectral (frequência abaixo da qual está X% da energia)
        pub fn spectral_rolloff(&self, threshold_percent: T) -> Vec<T> {
            let freqs = self.frequencies();
            let power = self.power();

            (0..self.num_frames)
                .map(|frame| {
                    // Calcula energia total
                    let mut total_energy = T::ZERO;
                    for freq_idx in 0..self.num_freqs {
                        total_energy = total_energy + power[freq_idx][frame];
                    }

                    let threshold = total_energy * threshold_percent / T::from_usize(100);
                    let mut cumulative = T::ZERO;

                    // Encontra frequência onde energia acumulada passa threshold
                    for freq_idx in 0..self.num_freqs {
                        cumulative = cumulative + power[freq_idx][frame];
                        if cumulative >= threshold {
                            return freqs[freq_idx];
                        }
                    }

                    freqs[self.num_freqs - 1]
                })
                .collect()
        }
    }

    /// Calculador de STFT
    pub struct StftProcessor<T: Float> {
        config: OverlapConfig,
        window: Vec<T>,
        planner: FftPlanner<T>,
    }

    impl<T: Float> StftProcessor<T> {
        /// Cria novo processador STFT
        pub fn new(config: OverlapConfig, window_type: WindowType) -> Result<Self> {
            if !is_power_of_two(config.window_size) {
                return Err(FftError::InvalidSize);
            }

            let window = match window_type {
                WindowType::Hann => window::hann(config.window_size),
                WindowType::Hamming => window::hamming(config.window_size),
                WindowType::Blackman => window::blackman(config.window_size),
                WindowType::BlackmanHarris => window::blackman_harris(config.window_size),
                WindowType::Rectangle => window::rectangular(config.window_size),
            };

            let planner = FftPlanner::new(config.window_size, false)?;

            Ok(Self {
                config,
                window,
                planner,
            })
        }

        /// Processa sinal gerando espectrograma
        pub fn process(&self, signal: &[T], sample_rate: T) -> Result<Spectrogram<T>> {
            let num_frames = self.config.num_frames(signal.len());
            if num_frames == 0 {
                return Err(FftError::InvalidSize);
            }

            let num_freqs = self.config.window_size / 2 + 1; // Apenas frequências positivas
            let mut spec = Spectrogram::new(num_frames, num_freqs, sample_rate, self.config);

            // Processa cada frame
            for frame_idx in 0..num_frames {
                let start = frame_idx * self.config.hop_size;
                let end = start + self.config.window_size;

                // Extrai e janela o frame
                let mut frame: Vec<Complex<T>> = signal[start..end]
                    .iter()
                    .zip(self.window.iter())
                    .map(|(&s, &w)| Complex::new(s * w, T::ZERO))
                    .collect();

                // FFT do frame
                self.planner.process_in_place(&mut frame)?;

                // Armazena apenas frequências positivas
                for freq_idx in 0..num_freqs {
                    spec.set(freq_idx, frame_idx, frame[freq_idx]);
                }
            }

            Ok(spec)
        }

        /// ISTFT - reconstrói sinal do espectrograma
        pub fn inverse(&self, spec: &Spectrogram<T>) -> Result<Vec<T>> {
            let signal_len = (spec.num_frames - 1) * self.config.hop_size + self.config.window_size;
            let mut signal = vec![T::ZERO; signal_len];
            let mut window_sum = vec![T::ZERO; signal_len];

            let ifft_planner = FftPlanner::new(self.config.window_size, true)?;

            for frame_idx in 0..spec.num_frames {
                // Reconstrói espectro completo (simetria Hermitiana)
                let mut full_spectrum = vec![Complex::zero(); self.config.window_size];

                for freq_idx in 0..spec.num_freqs {
                    full_spectrum[freq_idx] = spec.get(freq_idx, frame_idx);
                }

                // Preenche parte negativa (conjugado espelhado)
                for freq_idx in 1..spec.num_freqs - 1 {
                    full_spectrum[self.config.window_size - freq_idx] =
                        full_spectrum[freq_idx].conj();
                }

                // IFFT
                ifft_planner.process_in_place(&mut full_spectrum)?;

                // Overlap-add com janela
                let start = frame_idx * self.config.hop_size;
                for i in 0..self.config.window_size {
                    let pos = start + i;
                    signal[pos] = signal[pos] + full_spectrum[i].re * self.window[i];
                    window_sum[pos] = window_sum[pos] + self.window[i] * self.window[i];
                }
            }

            // Normaliza pelo window sum
            for i in 0..signal_len {
                if window_sum[i] > T::ZERO {
                    signal[i] = signal[i] / window_sum[i];
                }
            }

            Ok(signal)
        }
    }

    /// Tipos de janela para STFT
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
    pub enum WindowType {
        Hann,
        Hamming,
        Blackman,
        BlackmanHarris,
        Rectangle,
    }
}

/// Módulo de compatibilidade com num-complex
pub mod num_complex {
    pub use super::Complex;
    pub type Complex64 = Complex<f64>;
    pub type Complex32 = Complex<f32>;
}

#[cfg(test)]
mod tests {
    use super::*;

    const EPSILON_F64: f64 = 1e-10;
    const EPSILON_F32: f32 = 1e-5;

    #[test]
    fn test_is_power_of_two() {
        assert!(is_power_of_two(1));
        assert!(is_power_of_two(2));
        assert!(is_power_of_two(4));
        assert!(is_power_of_two(1024));
        assert!(!is_power_of_two(0));
        assert!(!is_power_of_two(3));
        assert!(!is_power_of_two(100));
    }

    #[test]
    fn test_bit_reverse() {
        assert_eq!(reverse_bits(0b000, 3), 0b000);
        assert_eq!(reverse_bits(0b001, 3), 0b100);
        assert_eq!(reverse_bits(0b010, 3), 0b010);
        assert_eq!(reverse_bits(0b011, 3), 0b110);
        assert_eq!(reverse_bits(0b100, 3), 0b001);
    }

    #[test]
    fn test_fft_simple() {
        let input = vec![
            Complex::new(1.0, 0.0),
            Complex::new(0.0, 0.0),
            Complex::new(1.0, 0.0),
            Complex::new(0.0, 0.0),
        ];

        let output = fft(&input);
        assert_eq!(output.len(), 4);
    }

    #[test]
    fn test_fft_planner() {
        let input = vec![
            Complex::new(1.0, 0.0),
            Complex::new(2.0, 0.0),
            Complex::new(3.0, 0.0),
            Complex::new(4.0, 0.0),
        ];

        let planner = FftPlanner::new(4, false).unwrap();
        let output = planner.process(&input).unwrap();
        assert_eq!(output.len(), 4);
    }

    #[test]
    fn test_ifft_roundtrip() {
        let input = vec![
            Complex::new(1.0, 0.0),
            Complex::new(2.0, 0.0),
            Complex::new(3.0, 0.0),
            Complex::new(4.0, 0.0),
        ];

        let freq = fft(&input);
        let recovered = ifft(&freq);

        for (orig, rec) in input.iter().zip(recovered.iter()) {
            assert!((orig.re - rec.re).abs() < EPSILON_F64);
            assert!((orig.im - rec.im).abs() < EPSILON_F64);
        }
    }

    #[test]
    fn test_fft_planner_roundtrip() {
        let input = vec![
            Complex::new(1.0, 0.5),
            Complex::new(2.0, -0.3),
            Complex::new(3.0, 0.7),
            Complex::new(4.0, -0.9),
        ];

        let fft_planner = FftPlanner::new(4, false).unwrap();
        let ifft_planner = FftPlanner::new(4, true).unwrap();

        let freq = fft_planner.process(&input).unwrap();
        let recovered = ifft_planner.process(&freq).unwrap();

        for (orig, rec) in input.iter().zip(recovered.iter()) {
            assert!((orig.re - rec.re).abs() < EPSILON_F64,
                "re: {} vs {}", orig.re, rec.re);
            assert!((orig.im - rec.im).abs() < EPSILON_F64,
                "im: {} vs {}", orig.im, rec.im);
        }
    }

    #[test]
    fn test_fft_impulse() {
        // Teste científico: impulso unitário -> espectro constante
        let mut input = vec![Complex::zero(); 8];
        input[0] = Complex::new(1.0, 0.0);

        let output = fft(&input);

        // Todas as frequências devem ter magnitude ~1
        for c in output.iter() {
            assert!((c.norm() - 1.0).abs() < EPSILON_F64);
        }
    }

    #[test]
    fn test_fft_dc_signal() {
        // Teste científico: sinal DC -> energia apenas em freq 0
        let input = vec![Complex::new(1.0, 0.0); 8];
        let output = fft(&input);

        // Primeira frequência deve ter toda a energia
        assert!((output[0].re - 8.0).abs() < EPSILON_F64);
        assert!(output[0].im.abs() < EPSILON_F64);

        // Outras frequências devem ser ~0
        for i in 1..8 {
            assert!(output[i].norm() < EPSILON_F64);
        }
    }

    #[test]
    fn test_fft_sine_wave() {
        // Teste científico: senoide pura -> picos em ±freq
        let n = 16;
        let k = 2; // frequência normalizada
        let input: Vec<Complex<f64>> = (0..n)
            .map(|i| {
                let angle = 2.0 * PI * (k as f64) * (i as f64) / (n as f64);
                Complex::new(angle.sin(), 0.0)
            })
            .collect();

        let output = fft(&input);

        // Picos em k e n-k
        assert!(output[k].norm() > 5.0); // magnitude significativa
        assert!(output[n - k].norm() > 5.0);

        // Outras frequências devem ser pequenas
        for i in 0..n {
            if i != k && i != n - k {
                assert!(output[i].norm() < 0.1);
            }
        }
    }

    #[test]
    fn test_parseval_theorem() {
        // Teorema de Parseval: energia no tempo = energia na frequência
        let input = vec![
            Complex::new(1.0, 0.5),
            Complex::new(2.0, -0.3),
            Complex::new(3.0, 0.7),
            Complex::new(4.0, -0.9),
        ];

        let energy_time: f64 = input.iter().map(|c| c.norm_sqr()).sum();

        let output = fft(&input);
        let energy_freq: f64 = output.iter().map(|c| c.norm_sqr()).sum::<f64>() / (input.len() as f64);

        assert!((energy_time - energy_freq).abs() < EPSILON_F64);
    }

    #[test]
    fn test_linearity() {
        // Teste de linearidade: FFT(a·x + b·y) = a·FFT(x) + b·FFT(y)
        let x = vec![
            Complex::new(1.0, 0.0),
            Complex::new(2.0, 0.0),
            Complex::new(3.0, 0.0),
            Complex::new(4.0, 0.0),
        ];

        let y = vec![
            Complex::new(0.5, 0.5),
            Complex::new(1.0, -0.5),
            Complex::new(1.5, 0.3),
            Complex::new(2.0, -0.7),
        ];

        let a = 2.0;
        let b = 3.0;

        // a·x + b·y
        let combined: Vec<Complex<f64>> = x.iter()
            .zip(y.iter())
            .map(|(&xi, &yi)| xi * a + yi * b)
            .collect();

        let fft_combined = fft(&combined);

        // a·FFT(x) + b·FFT(y)
        let fft_x = fft(&x);
        let fft_y = fft(&y);
        let expected: Vec<Complex<f64>> = fft_x.iter()
            .zip(fft_y.iter())
            .map(|(&fx, &fy)| fx * a + fy * b)
            .collect();

        for (c, e) in fft_combined.iter().zip(expected.iter()) {
            assert!((c.re - e.re).abs() < EPSILON_F64);
            assert!((c.im - e.im).abs() < EPSILON_F64);
        }
    }

    #[test]
    fn test_rfft_real_signal() {
        let input = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
        let output = rfft(&input).unwrap();

        // Deve retornar N/2 + 1 = 5 pontos
        assert_eq!(output.len(), 5);

        // Primeira frequência (DC) deve ser real
        assert!(output[0].im.abs() < EPSILON_F64);
    }

    #[test]
    fn test_rfft_roundtrip() {
        let input = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
        let spectrum = rfft(&input).unwrap();
        let recovered = irfft(&spectrum, input.len()).unwrap();

        for (orig, rec) in input.iter().zip(recovered.iter()) {
            assert!((orig - rec).abs() < EPSILON_F64);
        }
    }

    #[test]
    fn test_hamming_window() {
        let window = window::hamming::<f64>(8);
        assert_eq!(window.len(), 8);

        // Janela de Hamming: extremos próximos de 0.08
        assert!((window[0] - 0.08).abs() < 0.01);
        assert!((window[7] - 0.08).abs() < 0.01);

        // Máximo no centro
        let max = window.iter().cloned().fold(0.0, f64::max);
        assert!(max > 0.9);
    }

    #[test]
    fn test_hann_window() {
        let window = window::hann::<f64>(8);
        assert_eq!(window.len(), 8);

        // Janela de Hann: extremos = 0
        assert!(window[0].abs() < EPSILON_F64);
        assert!(window[7].abs() < EPSILON_F64);
    }

    #[test]
    fn test_window_apply() {
        let signal = vec![1.0, 2.0, 3.0, 4.0];
        let window = window::rectangular::<f64>(4);
        let windowed = window::apply(&signal, &window);

        // Janela retangular não deve alterar o sinal
        for (s, w) in signal.iter().zip(windowed.iter()) {
            assert!((s - w).abs() < EPSILON_F64);
        }
    }

    #[test]
    fn test_f32_support() {
        let input = vec![
            Complex::new(1.0f32, 0.0f32),
            Complex::new(2.0f32, 0.0f32),
            Complex::new(3.0f32, 0.0f32),
            Complex::new(4.0f32, 0.0f32),
        ];

        let planner = FftPlanner::new(4, false).unwrap();
        let output = planner.process(&input).unwrap();
        assert_eq!(output.len(), 4);
    }

    #[test]
    fn test_error_handling() {
        // Tamanho não potência de 2
        let input = vec![Complex::new(1.0, 0.0); 3];
        assert!(fft_generic(&input).is_err());

        // Tamanho zero
        assert!(FftPlanner::<f64>::new(0, false).is_err());

        // Tamanho não potência de 2
        assert!(FftPlanner::<f64>::new(5, false).is_err());
    }

    #[test]
    fn test_nan_detection() {
        let mut input = vec![Complex::new(1.0, 0.0); 4];
        input[2] = Complex::new(f64::NAN, 0.0);

        let planner = FftPlanner::new(4, false).unwrap();
        assert!(planner.process(&input).is_err());
    }

    #[test]
    fn test_infinity_detection() {
        let mut input = vec![Complex::new(1.0, 0.0); 4];
        input[1] = Complex::new(f64::INFINITY, 0.0);

        let planner = FftPlanner::new(4, false).unwrap();
        assert!(planner.process(&input).is_err());
    }

    // Testes FFT 2D
    mod test_fft2d {
        use super::*;
        use crate::fft2d::*;

        #[test]
        fn test_fft2d_basic() {
            // Imagem 4x4 simples
            let data = vec![1.0; 16];
            let image = Image2D::from_real(4, 4, data).unwrap();

            let freq = fft2d(&image).unwrap();
            assert_eq!(freq.data.len(), 16);
        }

        #[test]
        fn test_fft2d_roundtrip() {
            // Cria imagem de teste 8x8
            let data: Vec<f64> = (0..64)
                .map(|i| (i as f64) * 0.1)
                .collect();
            let image = Image2D::from_real(8, 8, data).unwrap();

            // FFT -> IFFT
            let freq = fft2d(&image).unwrap();
            let recovered = ifft2d(&freq).unwrap();

            // Verifica reversibilidade
            for i in 0..64 {
                let diff = (image.data[i].re - recovered.data[i].re).abs();
                assert!(diff < EPSILON_F64, "Erro em pixel {}: {}", i, diff);
            }
        }

        #[test]
        fn test_fft2d_separability() {
            // Propriedade: FFT 2D = FFT(colunas) depois FFT(linhas)
            // Já implementado via row-column algorithm
            let data = vec![1.0, 2.0, 3.0, 4.0];
            let image = Image2D::from_real(2, 2, data).unwrap();

            let result = fft2d(&image).unwrap();

            // DC component deve ser soma de todos pixels
            let dc = result.get(0, 0);
            assert!((dc.re - 10.0).abs() < EPSILON_F64);
        }

        #[test]
        fn test_fft2d_parseval() {
            // Teorema de Parseval 2D: energia conservada
            let data: Vec<f64> = (0..64)
                .map(|i| ((i as f64) * 0.1).sin())
                .collect();
            let image = Image2D::from_real(8, 8, data).unwrap();

            let energy_spatial: f64 = image.data.iter()
                .map(|c| c.norm_sqr())
                .sum();

            let freq = fft2d(&image).unwrap();
            let energy_freq: f64 = freq.data.iter()
                .map(|c| c.norm_sqr())
                .sum::<f64>() / 64.0;

            let diff = (energy_spatial - energy_freq).abs();
            assert!(diff < EPSILON_F64 * 100.0, "Parseval: {}", diff);
        }

        #[test]
        fn test_image2d_fftshift() {
            let mut image = Image2D::new(4, 4);

            // Define padrão conhecido
            image.set(0, 0, Complex::new(1.0, 0.0));
            image.set(3, 3, Complex::new(2.0, 0.0));

            image.fftshift();

            // Após shift, cantos devem estar no centro
            assert_eq!(image.get(2, 2).re, 1.0);
            assert_eq!(image.get(1, 1).re, 2.0);
        }

        #[test]
        fn test_gaussian_filter() {
            use crate::filters::*;

            let data = vec![1.0; 64];
            let image = Image2D::from_real(8, 8, data).unwrap();

            let mut freq = fft2d(&image).unwrap();

            let filter = GaussianFilter::new(8, 8, 2.0, false);
            filter.apply(&mut freq);

            let filtered = ifft2d(&freq).unwrap();

            // Filtro passa-baixas deve suavizar (reduzir valores)
            let original_max = 1.0;
            let filtered_max = filtered.magnitude().iter()
                .cloned()
                .fold(0.0, f64::max);

            assert!(filtered_max <= original_max);
        }

        #[test]
        fn test_ideal_lowpass_filter() {
            use crate::filters::*;

            let data = vec![1.0; 64];
            let image = Image2D::from_real(8, 8, data).unwrap();

            let mut freq = fft2d(&image).unwrap();

            let filter = IdealFilter::new(8, 8, FilterType::LowPass, 2.0);
            filter.apply(&mut freq);

            // Deve zerar frequências além do cutoff
            let result = ifft2d(&freq).unwrap();
            assert_eq!(result.data.len(), 64);
        }

        #[test]
        fn test_convolve2d() {
            use crate::filters::convolve2d;

            // Imagem 4x4
            let img_data = vec![
                1.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0,
            ];
            let image = Image2D::from_real(4, 4, img_data).unwrap();

            // Kernel identidade (simplificado)
            let kernel_data = vec![
                0.0, 0.0, 0.0, 0.0,
                0.0, 1.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0,
            ];
            let kernel = Image2D::from_real(4, 4, kernel_data).unwrap();

            let result = convolve2d(&image, &kernel).unwrap();
            assert_eq!(result.data.len(), 16);
        }
    }
}

/// Módulo de benchmarks científicos (executar com --release)
#[cfg(test)]
mod bench {
    use super::*;
    use std::time::Instant;

    fn benchmark_fft(size: usize, iterations: usize) -> f64 {
        let input: Vec<Complex<f64>> = (0..size)
            .map(|i| Complex::new((i as f64).sin(), (i as f64).cos()))
            .collect();

        let planner = FftPlanner::new(size, false).unwrap();

        let start = Instant::now();
        for _ in 0..iterations {
            let _ = planner.process(&input).unwrap();
        }
        let duration = start.elapsed();

        duration.as_secs_f64() / (iterations as f64)
    }

    #[test]
    #[ignore] // Executar com: cargo test --release -- --ignored bench
    fn bench_fft_sizes() {
        println!("\n=== Benchmark FFT (tempo médio por operação) ===");

        for &size in &[64, 128, 256, 512, 1024, 2048, 4096] {
            let iterations = 1000000 / size; // Mais iterações para tamanhos menores
            let avg_time = benchmark_fft(size, iterations);
            let throughput = (size as f64) / avg_time / 1e6; // Msamples/s

            println!("N={:5} : {:.3} µs/op  ({:.1} Msamples/s)",
                size, avg_time * 1e6, throughput);
        }
    }

    #[test]
    #[ignore]
    fn bench_comparison_recursive_vs_iterative() {
        let size = 1024;
        let iterations = 1000;

        let input: Vec<Complex<f64>> = (0..size)
            .map(|i| Complex::new(i as f64, 0.0))
            .collect();

        // Recursive
        let start = Instant::now();
        for _ in 0..iterations {
            let _ = fft(&input);
        }
        let recursive_time = start.elapsed().as_secs_f64() / (iterations as f64);

        // Iterative
        let planner = FftPlanner::new(size, false).unwrap();
        let start = Instant::now();
        for _ in 0..iterations {
            let _ = planner.process(&input).unwrap();
        }
        let iterative_time = start.elapsed().as_secs_f64() / (iterations as f64);

        println!("\n=== Comparação Recursiva vs Iterativa (N={}) ===", size);
        println!("Recursiva  : {:.3} µs", recursive_time * 1e6);
        println!("Iterativa  : {:.3} µs", iterative_time * 1e6);
        println!("Speedup    : {:.2}x", recursive_time / iterative_time);
    }

    // Testes STFT e análise tempo-frequência
    mod test_stft {
        use super::*;
        use crate::timefreq::*;

        #[test]
        fn test_overlap_config() {
            let config = OverlapConfig::overlap_50(512);
            assert_eq!(config.window_size, 512);
            assert_eq!(config.hop_size, 256);
            assert_eq!(config.overlap_percent(), 50.0);

            let config = OverlapConfig::overlap_75(512);
            assert_eq!(config.hop_size, 128);
            assert_eq!(config.overlap_percent(), 75.0);
        }

        #[test]
        fn test_num_frames() {
            let config = OverlapConfig::overlap_50(512);

            // Sinal com 1536 amostras: (1536 - 512) / 256 + 1 = 5 frames
            assert_eq!(config.num_frames(1536), 5);

            // Sinal menor que janela
            assert_eq!(config.num_frames(256), 0);
        }

        #[test]
        fn test_stft_chirp() {
            // Chirp: frequência varia linearmente no tempo
            // f(t) = f0 + (f1 - f0) * t / duration
            let sample_rate = 4096.0;
            let duration = 2.0; // segundos
            let n_samples = (sample_rate * duration) as usize;

            let f0 = 100.0; // Hz inicial
            let f1 = 800.0; // Hz final
            let chirp_rate = (f1 - f0) / duration;

            let signal: Vec<f64> = (0..n_samples)
                .map(|i| {
                    let t = i as f64 / sample_rate;
                    let freq = f0 + chirp_rate * t;
                    (2.0 * std::f64::consts::PI * freq * t).sin()
                })
                .collect();

            // STFT
            let config = OverlapConfig::overlap_75(512);
            let processor = StftProcessor::new(config, WindowType::Hann).unwrap();
            let spec = processor.process(&signal, sample_rate).unwrap();

            // Verifica dimensões
            assert_eq!(spec.num_freqs, 257); // 512/2 + 1
            assert!(spec.num_frames > 0);

            // Verifica que frequência dominante aumenta ao longo do tempo
            let freqs = spec.frequencies();
            let mag = spec.magnitude();

            let mut dominant_freqs = Vec::new();
            for frame in 0..spec.num_frames {
                let mut max_mag = 0.0;
                let mut max_idx = 0;

                for freq_idx in 0..spec.num_freqs {
                    if mag[freq_idx][frame] > max_mag {
                        max_mag = mag[freq_idx][frame];
                        max_idx = freq_idx;
                    }
                }
                dominant_freqs.push(freqs[max_idx]);
            }

            // Verifica tendência crescente
            for i in 1..dominant_freqs.len() {
                assert!(
                    dominant_freqs[i] >= dominant_freqs[i - 1] - 50.0,
                    "Frequência dominante deve aumentar: {} -> {}",
                    dominant_freqs[i - 1], dominant_freqs[i]
                );
            }
        }

        #[test]
        fn test_stft_reversibility() {
            // Sinal de teste: soma de senóides
            let sample_rate = 8192.0;
            let duration = 1.0;
            let n_samples = (sample_rate * duration) as usize;

            let signal: Vec<f64> = (0..n_samples)
                .map(|i| {
                    let t = i as f64 / sample_rate;
                    // 3 componentes: 200Hz, 400Hz, 800Hz
                    (2.0 * std::f64::consts::PI * 200.0 * t).sin()
                        + 0.5 * (2.0 * std::f64::consts::PI * 400.0 * t).sin()
                        + 0.3 * (2.0 * std::f64::consts::PI * 800.0 * t).sin()
                })
                .collect();

            // STFT -> ISTFT
            let config = OverlapConfig::overlap_75(512);
            let processor = StftProcessor::new(config, WindowType::Hann).unwrap();

            let spec = processor.process(&signal, sample_rate).unwrap();
            let reconstructed = processor.inverse(&spec).unwrap();

            // Verifica reversibilidade (ignora bordas pela janela)
            let margin = 512; // Ignora 1 janela em cada borda
            let mut max_error: f64 = 0.0;
            let mut rms_error = 0.0;

            for i in margin..(n_samples - margin) {
                if i < reconstructed.len() {
                    let error = (signal[i] - reconstructed[i]).abs();
                    max_error = max_error.max(error);
                    rms_error += error * error;
                }
            }

            let n_samples_checked = n_samples - 2 * margin;
            rms_error = (rms_error / (n_samples_checked as f64)).sqrt();

            println!("STFT Reversibilidade - Max error: {:.3e}, RMS error: {:.3e}", max_error, rms_error);

            // Tolerância relaxada devido ao efeito de windowing
            assert!(rms_error < 0.01, "RMS error muito alto: {}", rms_error);
        }

        #[test]
        fn test_spectral_features() {
            // Sinal de teste: tom puro + ruído
            let sample_rate = 8192.0;
            let n_samples = 8192;

            let signal: Vec<f64> = (0..n_samples)
                .map(|i| {
                    let t = i as f64 / sample_rate;
                    // Tom puro em 440 Hz (nota A4)
                    (2.0 * std::f64::consts::PI * 440.0 * t).sin()
                })
                .collect();

            let config = OverlapConfig::overlap_50(512);
            let processor = StftProcessor::new(config, WindowType::Hann).unwrap();
            let spec = processor.process(&signal, sample_rate).unwrap();

            // Centróide espectral
            let centroids = spec.spectral_centroid();
            assert!(centroids.len() > 0);

            // Para tom puro, centróide deve estar próximo de 440 Hz
            let avg_centroid: f64 = centroids.iter().sum::<f64>() / (centroids.len() as f64);
            println!("Centróide espectral médio: {:.1} Hz (esperado ~440 Hz)", avg_centroid);
            assert!((avg_centroid - 440.0).abs() < 100.0);

            // Largura de banda
            let bandwidths = spec.spectral_bandwidth();
            assert!(bandwidths.len() > 0);

            // Tom puro tem largura de banda pequena
            let avg_bandwidth: f64 = bandwidths.iter().sum::<f64>() / (bandwidths.len() as f64);
            println!("Largura de banda média: {:.1} Hz", avg_bandwidth);
            assert!(avg_bandwidth < 200.0);

            // Flatness
            let flatness = spec.spectral_flatness();
            let avg_flatness: f64 = flatness.iter().sum::<f64>() / (flatness.len() as f64);
            println!("Flatness média: {:.4} (esperado próximo de 0 para tom puro)", avg_flatness);

            // Tom puro tem flatness baixo (não é ruído branco)
            assert!(avg_flatness < 0.3);

            // Rolloff
            let rolloff = spec.spectral_rolloff(85.0); // 85% da energia
            assert!(rolloff.len() > 0);
            let avg_rolloff: f64 = rolloff.iter().sum::<f64>() / (rolloff.len() as f64);
            println!("Rolloff 85% médio: {:.1} Hz", avg_rolloff);
        }

        #[test]
        fn test_spectrogram_magnitude_db() {
            let sample_rate = 8192.0;
            let n_samples = 4096;

            let signal: Vec<f64> = (0..n_samples)
                .map(|i| {
                    let t = i as f64 / sample_rate;
                    (2.0 * std::f64::consts::PI * 440.0 * t).sin()
                })
                .collect();

            let config = OverlapConfig::overlap_50(256);
            let processor = StftProcessor::new(config, WindowType::Hann).unwrap();
            let spec = processor.process(&signal, sample_rate).unwrap();

            let mag = spec.magnitude();
            let mag_db = spec.magnitude_db();

            // Verifica que dB está em escala logarítmica apropriada
            assert_eq!(mag.len(), mag_db.len());
            assert_eq!(mag[0].len(), mag_db[0].len());

            // Para tom puro, pico deve estar acima de -20 dB
            let mut max_db = -1000.0;
            for freq_row in &mag_db {
                for &db_val in freq_row {
                    if db_val > max_db {
                        max_db = db_val;
                    }
                }
            }

            println!("Pico em dB: {:.1} dB", max_db);
            assert!(max_db > -20.0);
        }

        #[test]
        fn test_window_comparison() {
            // Compara diferentes janelas no mesmo sinal
            let sample_rate = 8192.0;
            let n_samples = 4096;

            let signal: Vec<f64> = (0..n_samples)
                .map(|i| {
                    let t = i as f64 / sample_rate;
                    // Dois tons próximos: 440 Hz e 480 Hz
                    (2.0 * std::f64::consts::PI * 440.0 * t).sin()
                        + (2.0 * std::f64::consts::PI * 480.0 * t).sin()
                })
                .collect();

            let config = OverlapConfig::overlap_50(512);

            for window_type in [WindowType::Rectangle, WindowType::Hann,
                               WindowType::Hamming, WindowType::Blackman] {
                let processor = StftProcessor::new(config, window_type).unwrap();
                let spec = processor.process(&signal, sample_rate).unwrap();

                let freqs = spec.frequencies();
                let mag = spec.magnitude();

                // Encontra picos
                let mut peaks = Vec::new();
                for frame in 0..spec.num_frames.min(5) {
                    let mut local_max = 0.0;
                    let mut local_idx = 0;

                    for freq_idx in 10..spec.num_freqs - 10 {
                        if mag[freq_idx][frame] > local_max {
                            local_max = mag[freq_idx][frame];
                            local_idx = freq_idx;
                        }
                    }
                    peaks.push(freqs[local_idx]);
                }

                println!("Janela {:?}: picos em ~{:.0} Hz", window_type, peaks[0]);
            }
        }
    }
}

/// Parallel processing module for multi-threaded FFT and STFT
pub mod parallel;

/// Streaming processing module for large files
pub mod streaming;

/// SIMD optimizations for 2-4x speedup
pub mod simd;

/// Cache optimization for planner and window reuse
pub mod cache;

/// Advanced FFT algorithms (Bluestein, split-radix, PFA)
pub mod advanced;
