// Teste de mul_mod_naive

use avila_primitives::U256;
use avila_math::modular::mul_mod_naive;

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

    // Teste: (p-1) × (p-1) mod p = 1
    let p_minus_1 = p.wrapping_sub(&U256::ONE);
    let result = mul_mod_naive(&p_minus_1, &p_minus_1, &p);

    println!("(p-1) × (p-1) mod p usando mul_mod_naive:");
    println!("  Resultado: {:016x} {:016x} {:016x} {:016x}",
        result.limbs[3], result.limbs[2], result.limbs[1], result.limbs[0]);
    println!("  Esperado:  0000000000000000 0000000000000000 0000000000000000 0000000000000001");
    println!("  Correto: {}", result == U256::ONE);
}
