//! Operações especializadas ARM NEON
//!
//! Equivalentes SIMD para arquitetura ARM (aarch64).
//! Usa intrinsics NEON para operações de 128-bit.

#[cfg(target_arch = "aarch64")]
use core::arch::aarch64::*;

/// XOR de 128-bit usando NEON (2x u64)
///
/// Equivalente ARM do AVX2 xor256 (mas só 128-bit).
///
/// # Safety
/// Requer CPU com suporte a NEON (padrão em aarch64).
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn xor128_neon(a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let vb = vld1q_u64(b.as_ptr());
    let result = veorq_u64(va, vb);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// AND de 128-bit usando NEON
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn and128_neon(a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let vb = vld1q_u64(b.as_ptr());
    let result = vandq_u64(va, vb);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// OR de 128-bit usando NEON
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn or128_neon(a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let vb = vld1q_u64(b.as_ptr());
    let result = vorrq_u64(va, vb);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// Adição de 128-bit usando NEON (sem carry propagation)
///
/// Adiciona 2x u64 em paralelo, mas não propaga carry entre lanes.
/// Para full add com carry, use scalar ops.
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn add128_neon_no_carry(a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let vb = vld1q_u64(b.as_ptr());
    let result = vaddq_u64(va, vb);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// Subtração de 128-bit usando NEON (sem borrow propagation)
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn sub128_neon_no_borrow(a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let vb = vld1q_u64(b.as_ptr());
    let result = vsubq_u64(va, vb);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// Comparação de igualdade 128-bit usando NEON
///
/// Retorna máscara: 0xFFFFFFFFFFFFFFFF em cada lane onde a[i] == b[i].
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn eq128_neon(a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let vb = vld1q_u64(b.as_ptr());
    let result = vceqq_u64(va, vb);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// Comparação less than 128-bit usando NEON
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn lt128_neon(a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let vb = vld1q_u64(b.as_ptr());
    let result = vcltq_u64(va, vb);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// Comparação greater than 128-bit usando NEON
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn gt128_neon(a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let vb = vld1q_u64(b.as_ptr());
    let result = vcgtq_u64(va, vb);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// Shift left 128-bit por imediato
///
/// Shifts cada lane individualmente (não há shift across lanes).
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn shl128_neon<const N: i32>(a: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let result = vshlq_n_u64::<N>(va);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// Shift right 128-bit por imediato
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn shr128_neon<const N: i32>(a: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let result = vshrq_n_u64::<N>(va);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// Min de 128-bit usando NEON
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn min128_neon(a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let vb = vld1q_u64(b.as_ptr());
    let result = vminq_u64(va, vb);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// Max de 128-bit usando NEON
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn max128_neon(a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
    let va = vld1q_u64(a.as_ptr());
    let vb = vld1q_u64(b.as_ptr());
    let result = vmaxq_u64(va, vb);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// Blend condicional 128-bit
///
/// Se mask[i] == 0xFF...FF, usa a[i], senão usa b[i].
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn blend128_neon(mask: &[u64; 2], a: &[u64; 2], b: &[u64; 2]) -> [u64; 2] {
    let vmask = vld1q_u64(mask.as_ptr());
    let va = vld1q_u64(a.as_ptr());
    let vb = vld1q_u64(b.as_ptr());

    // result = (a & mask) | (b & ~mask)
    let result = vbslq_u64(vmask, va, vb);

    let mut out = [0u64; 2];
    vst1q_u64(out.as_mut_ptr(), result);
    out
}

/// XOR de 256-bit usando NEON (2x 128-bit ops)
///
/// Para equivalência com AVX2, processa 256-bit em duas operações.
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn xor256_neon(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    let lo = xor128_neon(&[a[0], a[1]], &[b[0], b[1]]);
    let hi = xor128_neon(&[a[2], a[3]], &[b[2], b[3]]);

    [lo[0], lo[1], hi[0], hi[1]]
}

/// AND de 256-bit usando NEON
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn and256_neon(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    let lo = and128_neon(&[a[0], a[1]], &[b[0], b[1]]);
    let hi = and128_neon(&[a[2], a[3]], &[b[2], b[3]]);

    [lo[0], lo[1], hi[0], hi[1]]
}

/// OR de 256-bit usando NEON
#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn or256_neon(a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    let lo = or128_neon(&[a[0], a[1]], &[b[0], b[1]]);
    let hi = or128_neon(&[a[2], a[3]], &[b[2], b[3]]);

    [lo[0], lo[1], hi[0], hi[1]]
}

/// Crypto extensions: AES round
///
/// ARM Crypto Extensions para AES (se disponível).
#[cfg(all(target_arch = "aarch64", target_feature = "crypto"))]
#[inline]
pub unsafe fn aes_encrypt_neon(state: &[u8; 16], key: &[u8; 16]) -> [u8; 16] {
    let vstate = vld1q_u8(state.as_ptr());
    let vkey = vld1q_u8(key.as_ptr());

    // AES encrypt round
    let result = vaeseq_u8(vstate, vkey);

    let mut out = [0u8; 16];
    vst1q_u8(out.as_mut_ptr(), result);
    out
}

/// SHA256 extensions (se disponível)
#[cfg(all(target_arch = "aarch64", target_feature = "sha2"))]
#[inline]
pub unsafe fn sha256_schedule_neon(w: &[u32; 4]) -> [u32; 4] {
    let vw = vld1q_u32(w.as_ptr());
    let result = vsha256su0q_u32(vw, vw);

    let mut out = [0u32; 4];
    vst1q_u32(out.as_mut_ptr(), result);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn test_xor128_neon() {
        unsafe {
            let a = [0x1234567890ABCDEF, 0xFEDCBA0987654321];
            let b = [0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF];
            let result = xor128_neon(&a, &b);

            assert_eq!(result[0], a[0] ^ b[0]);
            assert_eq!(result[1], a[1] ^ b[1]);
        }
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn test_add128_neon() {
        unsafe {
            let a = [1, 2];
            let b = [3, 4];
            let result = add128_neon_no_carry(&a, &b);

            assert_eq!(result[0], 4);
            assert_eq!(result[1], 6);
        }
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn test_xor256_neon() {
        unsafe {
            let a = [1, 2, 3, 4];
            let b = [5, 6, 7, 8];
            let result = xor256_neon(&a, &b);

            assert_eq!(result[0], 1 ^ 5);
            assert_eq!(result[1], 2 ^ 6);
            assert_eq!(result[2], 3 ^ 7);
            assert_eq!(result[3], 4 ^ 8);
        }
    }
}
