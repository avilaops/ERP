// Teste de r = 2^256 - m

use avila_primitives::U256;

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

    // Calcula r = 2^256 - m usando wraparound
    let r = U256::ZERO.wrapping_sub(&m);

    println!("r = 2^256 - m:");
    println!("  Calculado: {:016x} {:016x} {:016x} {:016x}",
        r.limbs[3], r.limbs[2], r.limbs[1], r.limbs[0]);
    println!("  Esperado:  0000000000000000 0000000000000000 0000000000000000 00000001000003d1");

    // Para secp256k1: p = FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
    // 2^256 - p = 1000003D1
    let expected = U256 {
        limbs: [0x00000001000003D1, 0, 0, 0]
    };

    println!("  Correto: {}", r == expected);

    // Verifica manualmente:
    // 0 - FFFFFFFEFFFFFC2F com borrow dá:
    // 10000000000000000 - FFFFFFFEFFFFFC2F = 1000003D1
    // Parece correto!
}
