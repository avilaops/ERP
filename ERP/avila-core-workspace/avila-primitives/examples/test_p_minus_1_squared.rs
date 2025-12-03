// Teste de (p-1) × (p-1)

use avila_primitives::U256;

fn main() {
    // p do secp256k1
    let p = U256 {
        limbs: [
            0xFFFFFFFEFFFFFC2F,
            0xFFFFFFFFFFFFFFFF,
            0xFFFFFFFFFFFFFFFF,
            0xFFFFFFFFFFFFFFFF,
        ],
    };

    let p_minus_1 = p.wrapping_sub(&U256::ONE);

    println!("p-1 = {:016x} {:016x} {:016x} {:016x}",
        p_minus_1.limbs[3], p_minus_1.limbs[2], p_minus_1.limbs[1], p_minus_1.limbs[0]);

    let (low, high) = p_minus_1.mul_wide(&p_minus_1);

    println!("\n(p-1) × (p-1) = high × 2^256 + low");
    println!("low:  {:016x} {:016x} {:016x} {:016x}",
        low.limbs[3], low.limbs[2], low.limbs[1], low.limbs[0]);
    println!("high: {:016x} {:016x} {:016x} {:016x}",
        high.limbs[3], high.limbs[2], high.limbs[1], high.limbs[0]);

    // (p-1)^2 = p^2 - 2p + 1
    // mod p: 0 - 2p + 1 ≡ 1 (mod p)
    // Então esperamos resultado = 1
}
