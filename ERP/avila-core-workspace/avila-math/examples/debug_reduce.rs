// Debug de reduce_wide

use avila_primitives::U256;
use avila_math::modular::mul_mod;

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

    println!("Testando (p-1) × (p-1) mod p com mul_mod:");
    let result = mul_mod(&p_minus_1, &p_minus_1, &p);
    println!("Resultado: {:016x} {:016x} {:016x} {:016x}",
        result.limbs[3], result.limbs[2], result.limbs[1], result.limbs[0]);
    println!("Esperado:  0000000000000000 0000000000000000 0000000000000000 0000000000000001");
    println!("Correto: {}", result == U256::ONE);

    // Agora verifica se 2^256 mod p está correto
    // Para secp256k1: p = 2^256 - 2^32 - 977
    // Então 2^256 ≡ 2^32 + 977 (mod p)
    // 977 = 0x3D1
    // 2^32 = 0x100000000
    // 2^32 + 977 = 0x1000003D1

    let expected_r = U256 {
        limbs: [0x00000001000003D1, 0, 0, 0]
    };

    println!("\n2^256 mod p esperado: {:016x} {:016x} {:016x} {:016x}",
        expected_r.limbs[3], expected_r.limbs[2], expected_r.limbs[1], expected_r.limbs[0]);
}
