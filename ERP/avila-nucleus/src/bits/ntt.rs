//! Number Theoretic Transform (NTT)
//!
//! NTT é a versão modular da FFT, usado para multiplicação
//! rápida de polinômios em campos finitos.
//!
//! Essencial para criptografia pós-quântica (Kyber, Dilithium).

use super::modular::*;

/// Primitive root of unity para NTT
///
/// Para n = 2^k, precisamos de ω onde ω^n ≡ 1 (mod p)
/// e ω^(n/2) ≡ -1 (mod p).
#[derive(Debug, Clone, Copy)]
pub struct NttContext {
    /// Módulo primo: p = k * 2^n + 1
    pub modulus: u64,

    /// Root of unity: ω^n ≡ 1 (mod p)
    pub root: u64,

    /// Tamanho da transformada (potência de 2)
    pub size: usize,

    /// Inverso modular de size
    pub size_inv: u64,

    /// Montgomery reduction parameter
    pub mont_inv: u64,

    /// Roots tabeladas: ω^i para bit-reversal
    pub roots: [u64; 64],

    /// Inverse roots: ω^-i
    pub inv_roots: [u64; 64],
}

impl NttContext {
    /// Cria contexto NTT para tamanho específico
    ///
    /// # Exemplos de primos NTT-friendly:
    /// - p = 12289 = 3 * 2^12 + 1 (Kyber)
    /// - p = 7681 = 15 * 2^9 + 1
    /// - p = 3329 = 13 * 2^8 + 1
    #[inline]
    pub const fn new(modulus: u64, root: u64, size: usize) -> Self {
        let mont_inv = montgomery_inv_64(modulus);
        let size_inv = 1; // Será computado via inv_mod

        Self {
            modulus,
            root,
            size,
            size_inv,
            mont_inv,
            roots: [0u64; 64],
            inv_roots: [0u64; 64],
        }
    }

    /// Inicializa tabelas de roots (precisa ser chamado após construção)
    pub fn init_roots(&mut self) {
        let k = (self.size as u64).trailing_zeros();

        // Computa size_inv
        self.size_inv = inv_mod(self.size as u64, self.modulus).unwrap();

        // Tabela de ω^i
        let mut w = self.root;
        for i in 0..k {
            self.roots[i as usize] = w;
            w = mul_mod(w, w, self.modulus, self.mont_inv);
        }

        // Inverse root: ω^-1
        let inv_root = inv_mod(self.root, self.modulus).unwrap();
        let mut w_inv = inv_root;
        for i in 0..k {
            self.inv_roots[i as usize] = w_inv;
            w_inv = mul_mod(w_inv, w_inv, self.modulus, self.mont_inv);
        }
    }
}

/// Forward NTT (in-place)
///
/// Transforma array de coeficientes de polinômio para
/// avaliações em roots of unity.
///
/// a(x) → [a(ω^0), a(ω^1), ..., a(ω^(n-1))]
///
/// Complexidade: O(n log n)
#[inline]
pub fn ntt_forward(a: &mut [u64], ctx: &NttContext) {
    let n = a.len();
    debug_assert!(n == ctx.size);
    debug_assert!(n.is_power_of_two());

    // Bit-reversal permutation
    bit_reversal_permute(a);

    // Cooley-Tukey butterfly
    let mut m = 1;
    while m < n {
        let m2 = m * 2;

        for i in (0..n).step_by(m2) {
            let mut w = 1u64;

            for j in 0..m {
                let u = a[i + j];
                let t = mul_mod(a[i + j + m], w, ctx.modulus, ctx.mont_inv);

                a[i + j] = add_mod(u, t, ctx.modulus);
                a[i + j + m] = sub_mod(u, t, ctx.modulus);

                // w *= ω
                let root_idx = (m.trailing_zeros() + 1) as usize;
                if root_idx < 64 {
                    w = mul_mod(w, ctx.roots[root_idx], ctx.modulus, ctx.mont_inv);
                }
            }
        }

        m = m2;
    }
}

/// Inverse NTT (in-place)
///
/// Transforma avaliações de volta para coeficientes.
///
/// [a(ω^0), a(ω^1), ...] → a(x)
#[inline]
pub fn ntt_inverse(a: &mut [u64], ctx: &NttContext) {
    let n = a.len();
    debug_assert!(n == ctx.size);
    debug_assert!(n.is_power_of_two());

    // Bit-reversal
    bit_reversal_permute(a);

    // Gentleman-Sande butterfly (inverse)
    let mut m = n;
    while m > 1 {
        let m2 = m / 2;

        for i in (0..n).step_by(m) {
            let mut w = 1u64;

            for j in 0..m2 {
                let u = a[i + j];
                let v = a[i + j + m2];

                a[i + j] = add_mod(u, v, ctx.modulus);

                let diff = sub_mod(u, v, ctx.modulus);
                a[i + j + m2] = mul_mod(diff, w, ctx.modulus, ctx.mont_inv);

                // w *= ω^-1
                let root_idx = (m2.trailing_zeros() + 1) as usize;
                if root_idx < 64 {
                    w = mul_mod(w, ctx.inv_roots[root_idx], ctx.modulus, ctx.mont_inv);
                }
            }
        }

        m = m2;
    }

    // Divide por n
    for elem in a.iter_mut() {
        *elem = mul_mod(*elem, ctx.size_inv, ctx.modulus, ctx.mont_inv);
    }
}

/// Multiplicação de polinômios via NTT
///
/// c(x) = a(x) * b(x) mod (x^n - 1)
///
/// Passos:
/// 1. NTT(a) e NTT(b)
/// 2. Pointwise multiply
/// 3. INTT(result)
#[inline]
pub fn ntt_multiply(a: &[u64], b: &[u64], ctx: &NttContext) -> Vec<u64> {
    let n = a.len();
    debug_assert_eq!(n, b.len());
    debug_assert_eq!(n, ctx.size);

    // Forward NTT
    let mut a_ntt = a.to_vec();
    let mut b_ntt = b.to_vec();

    ntt_forward(&mut a_ntt, ctx);
    ntt_forward(&mut b_ntt, ctx);

    // Pointwise multiply
    let mut c_ntt = vec![0u64; n];
    for i in 0..n {
        c_ntt[i] = mul_mod(a_ntt[i], b_ntt[i], ctx.modulus, ctx.mont_inv);
    }

    // Inverse NTT
    ntt_inverse(&mut c_ntt, ctx);

    c_ntt
}

/// Bit-reversal permutation
///
/// Permuta array de acordo com índices bit-reversed.
/// Necessário para NTT in-place.
#[inline]
fn bit_reversal_permute(a: &mut [u64]) {
    let n = a.len();
    let bits = (n.trailing_zeros()) as usize;

    for i in 0..n {
        let j = bit_reverse(i, bits);
        if i < j {
            a.swap(i, j);
        }
    }
}

/// Reverse bits de x usando apenas os `bits` menos significativos
#[inline(always)]
const fn bit_reverse(mut x: usize, bits: usize) -> usize {
    let mut result = 0;
    for _ in 0..bits {
        result = (result << 1) | (x & 1);
        x >>= 1;
    }
    result
}

/// NTT context para Kyber (p = 3329, n = 256)
pub fn kyber_ntt_context() -> NttContext {
    // Kyber usa p = 3329 = 13 * 2^8 + 1
    // Root of unity: ω = 17 (ordem 256)
    let mut ctx = NttContext::new(3329, 17, 256);
    ctx.init_roots();
    ctx
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bit_reverse() {
        assert_eq!(bit_reverse(0b000, 3), 0b000);
        assert_eq!(bit_reverse(0b001, 3), 0b100);
        assert_eq!(bit_reverse(0b010, 3), 0b010);
        assert_eq!(bit_reverse(0b011, 3), 0b110);
        assert_eq!(bit_reverse(0b100, 3), 0b001);
    }

    #[test]
    fn test_ntt_small() {
        // Teste com p = 17, n = 4, ω = 4
        // 4^4 = 256 ≡ 1 (mod 17)
        let mut ctx = NttContext::new(17, 4, 4);
        ctx.init_roots();

        let mut a = [1, 2, 3, 4];
        let original = a.clone();

        ntt_forward(&mut a, &ctx);
        ntt_inverse(&mut a, &ctx);

        // Deve retornar ao original (com possível wrap modular)
        for i in 0..4 {
            assert_eq!(a[i] % 17, original[i] % 17);
        }
    }

    #[test]
    fn test_ntt_multiply_simple() {
        let mut ctx = NttContext::new(17, 4, 4);
        ctx.init_roots();

        // a(x) = 1 + 2x
        let a = [1, 2, 0, 0];

        // b(x) = 3 + 4x
        let b = [3, 4, 0, 0];

        // c(x) = (1 + 2x)(3 + 4x) = 3 + 10x + 8x^2
        let c = ntt_multiply(&a, &b, &ctx);

        assert_eq!(c[0], 3);
        assert_eq!(c[1], 10);
        assert_eq!(c[2], 8);
        assert_eq!(c[3], 0);
    }

    #[test]
    fn test_kyber_context() {
        let ctx = kyber_ntt_context();
        assert_eq!(ctx.modulus, 3329);
        assert_eq!(ctx.size, 256);
    }
}
