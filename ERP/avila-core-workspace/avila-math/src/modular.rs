//! Aritmética modular para U256
//!
//! Operações (a op b) mod m

use avila_primitives::U256;

/// Adição modular: (a + b) mod m
pub fn add_mod(a: &U256, b: &U256, m: &U256) -> U256 {
    // Primeiro reduz a e b se necessário
    let a_red = if a >= m {
        let mut temp = *a;
        while temp >= *m {
            temp = temp.wrapping_sub(m);
        }
        temp
    } else {
        *a
    };

    let b_red = if b >= m {
        let mut temp = *b;
        while temp >= *m {
            temp = temp.wrapping_sub(m);
        }
        temp
    } else {
        *b
    };

    // Adiciona com detecção de overflow
    let sum = a_red.wrapping_add(&b_red);

    // Se houve wraparound (sum < a_red), então temos overflow
    // Nesse caso, sum = (a_red + b_red) - 2^256
    // Queremos (a_red + b_red) mod m = ((a_red + b_red) - 2^256 + 2^256) mod m
    //                                 = (sum + (2^256 mod m)) mod m
    // Mas se não houve overflow, apenas reduzimos normalmente

    if sum < a_red {
        // Houve overflow: sum já contém (a_red + b_red) mod 2^256
        // Precisamos ajustar para mod m
        // Como 2^256 ≡ r (mod m), temos:
        // (a_red + b_red) = sum + 2^256 ≡ sum + r (mod m)
        // Mas isso complica. Melhor abordagem: prevenir overflow

        // Se a_red + b_red vai dar overflow, subtrai m primeiro de um deles
        let a_minus_m = a_red.wrapping_sub(m);
        let partial = a_minus_m.wrapping_add(&b_red);

        // Agora partial = (a_red - m) + b_red = a_red + b_red - m
        // Se partial >= m, subtrai m novamente
        let mut result = partial;
        while result >= *m {
            result = result.wrapping_sub(m);
        }
        result
    } else {
        // Sem overflow: apenas reduz se >= m
        let mut result = sum;
        while result >= *m {
            result = result.wrapping_sub(m);
        }
        result
    }
}

/// Subtração modular: (a - b) mod m
pub fn sub_mod(a: &U256, b: &U256, m: &U256) -> U256 {
    if a >= b {
        a.wrapping_sub(b)
    } else {
        // a < b: retorna m - (b - a)
        let diff = b.wrapping_sub(a);
        m.wrapping_sub(&diff)
    }
}

/// Multiplicação modular ingênua: (a × b) mod m
///
/// Usa multiplicação completa em U512 e redução
pub fn mul_mod_naive(a: &U256, b: &U256, m: &U256) -> U256 {
    // Implementação simplificada - versão completa requer U512
    // Por agora: schoolbook multiplication com redução iterativa

    let mut result = U256::ZERO;
    let mut temp_a = *a;

    for i in 0..256 {
        if b.limbs[i / 64] & (1u64 << (i % 64)) != 0 {
            result = add_mod(&result, &temp_a, m);
        }
        temp_a = add_mod(&temp_a, &temp_a, m); // double
    }

    result
}

/// Reduz um valor de 512 bits (high, low) módulo m
///
/// Implementação robusta sem recursão interna
fn reduce_wide(low: U256, high: U256, m: &U256) -> U256 {
    if high == U256::ZERO {
        // Caso rápido: apenas reduz low
        let mut result = low;
        while result >= *m {
            result = result.wrapping_sub(m);
        }
        return result;
    }

    // Algoritmo: processar high bit a bit
    // Para cada bit i de high, contribui com 2^(256+i) mod m
    
    // Primeiro, reduz low
    let mut result = low;
    while result >= *m {
        result = result.wrapping_sub(m);
    }
    
    // Calcula 2^256 mod m = (2^256 - m) quando m está próximo de 2^256
    // Para secp256k1 e outros primos grandes, 2^256 - m < m
    let r256 = U256::ZERO.wrapping_sub(m);
    
    // Processa cada bit de high usando double-and-add
    // Começamos com power = 2^256 mod m
    let mut power = r256;
    
    for i in 0..256 {
        let limb_idx = i / 64;
        let bit_idx = i % 64;
        
        // Se o bit i de high está setado
        if high.limbs[limb_idx] & (1u64 << bit_idx) != 0 {
            // Adiciona power ao resultado
            // result += power, mas com cuidado para overflow
            let temp_sum = result.wrapping_add(&power);
            
            if temp_sum < result {
                // Overflow: temp_sum = result + power - 2^256
                // Queremos (result + power) mod m
                // = (temp_sum + 2^256) mod m
                // = (temp_sum + (2^256 mod m)) mod m
                // = (temp_sum + r256) mod m
                result = temp_sum.wrapping_add(&r256);
                // Agora reduz
                while result >= *m {
                    result = result.wrapping_sub(m);
                }
            } else {
                result = temp_sum;
                // Reduz se necessário
                while result >= *m {
                    result = result.wrapping_sub(m);
                }
            }
        }
        
        // Dobra power para próximo bit: power = 2 × power mod m
        let temp_double = power.wrapping_add(&power);
        
        if temp_double < power {
            // Overflow no dobramento
            power = temp_double.wrapping_add(&r256);
            while power >= *m {
                power = power.wrapping_sub(m);
            }
        } else {
            power = temp_double;
            while power >= *m {
                power = power.wrapping_sub(m);
            }
        }
    }
    
    result
}/// Multiplicação modular usando mul_wide e redução iterativa
///
/// a × b pode gerar um valor de 512 bits, precisamos reduzir mod m
pub fn mul_mod(a: &U256, b: &U256, m: &U256) -> U256 {
    // Primeiro reduz a e b se necessário
    let a_red = if a >= m {
        let mut temp = *a;
        while temp >= *m {
            temp = temp.wrapping_sub(m);
        }
        temp
    } else {
        *a
    };

    let b_red = if b >= m {
        let mut temp = *b;
        while temp >= *m {
            temp = temp.wrapping_sub(m);
        }
        temp
    } else {
        *b
    };

    // Multiplicação completa: (low, high)
    let (product_low, product_high) = a_red.mul_wide(&b_red);

    // Reduz o resultado de 512 bits
    reduce_wide(product_low, product_high, m)
}

/// Exponenciação modular: base^exp mod m
///
/// Usa algoritmo square-and-multiply
pub fn pow_mod(base: &U256, exp: &U256, m: &U256) -> U256 {
    if m <= &U256::ONE {
        return U256::ZERO;
    }

    let mut result = U256::ONE;
    let mut base = mul_mod(base, &U256::ONE, m); // Reduz base módulo m
    let mut exp = *exp;

    // Itera sobre bits do expoente
    for i in 0..256 {
        let limb_idx = i / 64;
        let bit_idx = i % 64;

        if exp.limbs[limb_idx] & (1u64 << bit_idx) != 0 {
            result = mul_mod(&result, &base, m);
        }

        base = mul_mod(&base, &base, m);

        // Otimização: para quando exp é zero
        if exp.is_zero() {
            break;
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_mod() {
        let a = U256::from_u64(10);
        let b = U256::from_u64(5);
        let m = U256::from_u64(7);
        let result = add_mod(&a, &b, &m);
        assert_eq!(result, U256::from_u64(1)); // (10 + 5) % 7 = 1
    }

    #[test]
    fn test_sub_mod() {
        let a = U256::from_u64(3);
        let b = U256::from_u64(5);
        let m = U256::from_u64(7);
        let result = sub_mod(&a, &b, &m);
        assert_eq!(result, U256::from_u64(5)); // (3 - 5) % 7 = 5
    }

    #[test]
    fn test_pow_mod() {
        let base = U256::from_u64(2);
        let exp = U256::from_u64(10);
        let m = U256::from_u64(1000);
        let result = pow_mod(&base, &exp, &m);
        assert_eq!(result, U256::from_u64(24)); // 2^10 % 1000 = 1024 % 1000 = 24
    }
}
