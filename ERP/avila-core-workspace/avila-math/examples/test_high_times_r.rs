// Teste de mul_mod_naive com high × r

use avila_primitives::U256;
use avila_math::modular::mul_mod_naive;

fn main() {
    // p do secp256k1
    let m = U256 {
        limbs: [
            0xFFFFFFFEFFFFFC2F,
            0xFFFFFFFFFFFFFFFF,
            0xFFFFFFFFFFFFFFFF,
            0xFFFFFFFFFFFFFFFF,
        ],
    };

    // high from (p-1)²
    let high = U256 {
        limbs: [
            0xFFFFFFDFFFFF863,
            0xFFFFFFDFFFFF858,
            0xFFFFFFDFFFFF858,
            0xFFFFFFDFFFFF856,
        ],
    };

    // r = 2^256 - m
    let r = U256 {
        limbs: [0x00000001000003D1, 0, 0, 0],
    };

    println!("Calculando high × r mod m usando mul_mod_naive:");
    println!("high = {:016x} {:016x} {:016x} {:016x}",
        high.limbs[3], high.limbs[2], high.limbs[1], high.limbs[0]);
    println!("r    = {:016x} {:016x} {:016x} {:016x}",
        r.limbs[3], r.limbs[2], r.limbs[1], r.limbs[0]);
    println!("m    = {:016x} {:016x} {:016x} {:016x}",
        m.limbs[3], m.limbs[2], m.limbs[1], m.limbs[0]);
    println!();

    let result = mul_mod_naive(&high, &r, &m);

    println!("high × r mod m = {:016x} {:016x} {:016x} {:016x}",
        result.limbs[3], result.limbs[2], result.limbs[1], result.limbs[0]);

    // Para verificar: (p-1)² = p² - 2p + 1 ≡ 1 (mod p)
    // Então high × 2^256 + low ≡ 1 (mod p)
    // high × r + low ≡ 1 (mod p)
    // high × r ≡ 1 - low (mod p)

    let low = U256 {
        limbs: [
            0x000007A4000E9844,
            0x00000002000007A4,
            0x00000002000007A6,
            0x00000002000007A8,
        ],
    };

    // 1 - low mod m
    let one_minus_low = m.wrapping_sub(&low).wrapping_add(&U256::ONE);
    let mut one_minus_low_reduced = one_minus_low;
    while one_minus_low_reduced >= m {
        one_minus_low_reduced = one_minus_low_reduced.wrapping_sub(&m);
    }

    println!();
    println!("Esperado (1 - low mod m):");
    println!("  {:016x} {:016x} {:016x} {:016x}",
        one_minus_low_reduced.limbs[3], one_minus_low_reduced.limbs[2],
        one_minus_low_reduced.limbs[1], one_minus_low_reduced.limbs[0]);

    println!();
    println!("Correto: {}", result == one_minus_low_reduced);
}
