use avila_primitives::u256::U256;
use avila_primitives::u512::U512;

/// Soma modular segura para valores de 256 bits.
#[inline]
pub fn mod_add(a: U256, b: U256, modulus: U256) -> U256 {
    if modulus.is_zero() {
        return U256::zero();
    }

    let (sum, carry) = a.overflowing_add(b);
    reduce_once(sum, carry, modulus)
}

/// Subtração modular (a - b) mod m.
#[inline]
pub fn mod_sub(a: U256, b: U256, modulus: U256) -> U256 {
    if modulus.is_zero() {
        return U256::zero();
    }

    let (diff, borrow) = a.overflowing_sub(b);
    if borrow {
        let (res, overflow) = diff.overflowing_add(modulus);
        reduce_once(res, overflow, modulus)
    } else {
        reduce_once(diff, false, modulus)
    }
}

/// Multiplicação modular completa.
#[inline]
pub fn mod_mul(a: U256, b: U256, modulus: U256) -> U256 {
    if modulus.is_zero() {
        return U256::zero();
    }

    let wide = a.wide_mul(b);
    reduce_wide(wide, modulus)
}

/// Exponenciação modular rápida via square-and-multiply.
#[inline]
pub fn mod_pow(base: U256, exponent: U256, modulus: U256) -> U256 {
    if modulus.is_zero() {
        return U256::zero();
    }
    if modulus.is_one() {
        return U256::zero();
    }

    let mut result = U256::one();
    let mut base = mod_reduce(base, modulus);
    let mut exp = exponent;

    for _ in 0..256 {
        if exp.is_zero() {
            break;
        }
        if !exp.is_even() {
            result = mod_mul(result, base, modulus);
        }
        exp = exp.wrapping_shr(1);
        if exp.is_zero() {
            break;
        }
        base = mod_mul(base, base, modulus);
    }

    result
}

/// Inverso modular via algoritmo binário estendido.
#[inline]
pub fn mod_inverse(value: U256, modulus: U256) -> Option<U256> {
    if modulus.is_zero() || value.is_zero() {
        return None;
    }

    let mut u = mod_reduce(value, modulus);
    let mut v = modulus;
    let mut x1 = U256::one();
    let mut x2 = U256::zero();

    while u != U256::one() && v != U256::one() {
        while u.is_even() {
            u = u.wrapping_shr(1);
            if x1.is_even() {
                x1 = x1.wrapping_shr(1);
            } else {
                x1 = x1.wrapping_add(modulus);
                x1 = x1.wrapping_shr(1);
            }
        }

        while v.is_even() {
            v = v.wrapping_shr(1);
            if x2.is_even() {
                x2 = x2.wrapping_shr(1);
            } else {
                x2 = x2.wrapping_add(modulus);
                x2 = x2.wrapping_shr(1);
            }
        }

        if u >= v {
            u = mod_sub(u, v, modulus);
            x1 = mod_sub(x1, x2, modulus);
        } else {
            v = mod_sub(v, u, modulus);
            x2 = mod_sub(x2, x1, modulus);
        }
    }

    if u == U256::one() {
        Some(mod_reduce(x1, modulus))
    } else if v == U256::one() {
        Some(mod_reduce(x2, modulus))
    } else {
        None
    }
}

/// Reduz um valor `U256` ao intervalo `[0, modulus)` assumindo `modulus > 0`.
#[inline]
pub fn mod_reduce(value: U256, modulus: U256) -> U256 {
    if modulus.is_zero() {
        return U256::zero();
    }

    let mut out = value;
    while out >= modulus {
        out = out.wrapping_sub(modulus);
    }
    out
}

fn reduce_once(value: U256, carry: bool, modulus: U256) -> U256 {
    let mut out = value;
    if carry || out >= modulus {
        out = out.wrapping_sub(modulus);
    }
    if out >= modulus {
        out = out.wrapping_sub(modulus);
    }
    out
}

pub(crate) fn reduce_wide(value: U512, modulus: U256) -> U256 {
    if modulus.is_zero() {
        return U256::zero();
    }

    let mut rem = U256::zero();
    for &limb in value.limbs().iter().rev() {
        rem = rem.wrapping_shl(64);
        rem = rem.wrapping_add(U256::from_u64(limb));
        while rem >= modulus {
            rem = rem.wrapping_sub(modulus);
        }
    }
    rem
}

#[cfg(test)]
mod tests {
    use super::*;

    fn to_u256(x: u128) -> U256 {
        U256::from(x)
    }

    fn to_u128(val: U256) -> u128 {
        let limbs = val.into_limbs();
        assert_eq!(limbs[2], 0);
        assert_eq!(limbs[3], 0);
        (limbs[1] as u128) << 64 | (limbs[0] as u128)
    }

    #[test]
    fn mod_add_matches_u128() {
        let modulus = 101u128;
        for a in 0..200u128 {
            for b in 0..200u128 {
                let expected = ((a % modulus) + (b % modulus)) % modulus;
                let res = mod_add(to_u256(a), to_u256(b), to_u256(modulus));
                assert_eq!(to_u128(res), expected);
            }
        }
    }

    #[test]
    fn mod_sub_matches_u128() {
        let modulus = 97u128;
        for a in 0..150u128 {
            for b in 0..150u128 {
                let expected = ((a % modulus) + modulus - (b % modulus)) % modulus;
                let res = mod_sub(to_u256(a), to_u256(b), to_u256(modulus));
                assert_eq!(to_u128(res), expected);
            }
        }
    }

    #[test]
    fn mod_mul_matches_u128() {
        let modulus = 331u128;
        for a in 0..200u128 {
            for b in 0..200u128 {
                let expected = ((a % modulus) * (b % modulus)) % modulus;
                let res = mod_mul(to_u256(a), to_u256(b), to_u256(modulus));
                assert_eq!(to_u128(res), expected);
            }
        }
    }

    #[test]
    fn mod_pow_matches_u128() {
        let modulus = 137u128;
        for base in 0..50u128 {
            for exp in 0..50u128 {
                let mut expected = 1u128;
                let mut b = base % modulus;
                let mut e = exp;
                while e > 0 {
                    if e & 1 == 1 {
                        expected = (expected * b) % modulus;
                    }
                    b = (b * b) % modulus;
                    e >>= 1;
                }
                let res = mod_pow(to_u256(base), to_u256(exp), to_u256(modulus));
                assert_eq!(to_u128(res), expected);
            }
        }
    }

    #[test]
    fn mod_inverse_matches_u128() {
        let modulus = 251u128; // primo
        for a in 1..modulus {
            let inv_u128 = (1..modulus).find(|x| (a * x) % modulus == 1).unwrap();
            let inv = mod_inverse(to_u256(a), to_u256(modulus)).unwrap();
            assert_eq!(to_u128(inv), inv_u128);
        }
    }
}
