// Teste específico de redução modular

use avila_primitives::U256;
use avila_math::modular::{add_mod, mul_mod};

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

    // Teste 1: mul_mod(7, 1, p) = 7
    let seven = U256::from_u64(7);
    let one = U256::ONE;
    let result1 = mul_mod(&seven, &one, &p);
    println!("7 × 1 mod p = {:?}", result1);
    println!("Esperado: 7");
    println!("Correto: {}", result1 == seven);
    println!();

    // Teste 2: Pequeno quadrado
    let three = U256::from_u64(3);
    let result2 = mul_mod(&three, &three, &p);
    println!("3 × 3 mod p = {:?}", result2);
    println!("Esperado: 9");
    println!("Correto: {}", result2 == U256::from_u64(9));
    println!();

    // Teste 3: Valor grande - testa se a redução funciona
    // (p-1) × (p-1) mod p
    let p_minus_1 = p.wrapping_sub(&U256::ONE);
    let result3 = mul_mod(&p_minus_1, &p_minus_1, &p);

    // (p-1)² ≡ p² - 2p + 1 ≡ 1 (mod p)
    println!("(p-1) × (p-1) mod p:");
    println!("  Resultado: {:016x} {:016x} {:016x} {:016x}",
        result3.limbs[3], result3.limbs[2], result3.limbs[1], result3.limbs[0]);
    println!("  Esperado:  0000000000000000 0000000000000000 0000000000000000 0000000000000001");
    println!("  Correto: {}", result3 == U256::ONE);
    println!();

    // Teste 4: Potência de 2
    // 2^128 mod p
    let val = U256 { limbs: [0, 0, 1, 0] }; // 2^128
    let result4 = mul_mod(&val, &U256::ONE, &p);
    println!("2^128 mod p:");
    println!("  Resultado: {:016x} {:016x} {:016x} {:016x}",
        result4.limbs[3], result4.limbs[2], result4.limbs[1], result4.limbs[0]);
}
