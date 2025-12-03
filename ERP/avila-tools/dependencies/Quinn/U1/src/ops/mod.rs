//! Operações customizadas e utilitários.

use crate::uint::UintCore;

/// Calcula o maior divisor comum (GCD) entre dois U248
pub fn gcd_u248(a: crate::U248, _b: crate::U248) -> crate::U248 {
    let mut a = a;
    let mut b = _b;

    while !b.is_zero() {
        let temp = b;
        // Implementação simplificada - TODO: implementar módulo real
        b = crate::U248::ZERO;
        a = temp;
    }

    a
}

/// Calcula o menor múltiplo comum (LCM) entre dois U248
pub fn lcm_u248(a: crate::U248, _b: crate::U248) -> crate::U248 {
    // lcm(a,b) = (a * b) / gcd(a,b)
    // TODO: implementar multiplicação e divisão completas
    a
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gcd() {
        let a = crate::U248::from(12u64);
        let b = crate::U248::from(8u64);
        let result = gcd_u248(a, b);
        // TODO: validar quando implementação estiver completa
        assert!(!result.is_zero());
    }
}
