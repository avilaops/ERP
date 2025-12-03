// Teste simples de reduce_wide

use avila_primitives::U256;
use avila_math::modular::mul_mod;

fn main() {
    // Teste muito simples: 2 × 3 = 6
    let two = U256::from_u64(2);
    let three = U256::from_u64(3);
    let p = U256::from_u64(100);
    
    let result = mul_mod(&two, &three, &p);
    println!("2 × 3 mod 100 = {:?}", result);
    println!("Esperado: 6");
    println!("Correto: {}\n", result == U256::from_u64(6));
    
    // Teste que força uso de high: (2^100) × (2^100) mod pequeno
    // Mas esse é difícil de calcular manualmente...
    
    // Melhor: teste com valores conhecidos
    // 256 × 256 mod 100 = 65536 mod 100 = 536 mod 100 = 36
    let v256 = U256::from_u64(256);
    let result2 = mul_mod(&v256, &v256, &p);
    println!("256 × 256 mod 100 = {:?}", result2);
    println!("Esperado: 36 (porque 65536 mod 100 = 36)");
    println!("Correto: {}\n", result2 == U256::from_u64(36));
    
    // Teste com valores maiores que geram high != 0
    // 2^128 × 2^128 = 2^256, que vai para high
    let val = U256 { limbs: [0, 0, 1, 0] }; // 2^128
    let result3 = mul_mod(&val, &val, &p);
    // 2^256 mod 100: precisamos calcular 2^256 mod 100
    // 2^10 = 1024 ≡ 24 (mod 100)
    // 2^20 ≡ 24^2 = 576 ≡ 76 (mod 100)
    // 2^40 ≡ 76^2 = 5776 ≡ 76 (mod 100)
    // 2^80 ≡ 76^2 = 5776 ≡ 76 (mod 100)
    // 2^160 ≡ 76 (mod 100)
    // 2^256 = 2^160 × 2^96 ≡ 76 × 2^96 (mod 100)
    // 2^96 = 2^80 × 2^16 ≡ 76 × 65536 (mod 100)
    // 65536 mod 100 = 36
    // 76 × 36 = 2736 ≡ 36 (mod 100)
    println!("2^128 × 2^128 mod 100 = 2^256 mod 100 = {:?}", result3);
    println!("Esperado: 36");
    println!("Correto: {}", result3 == U256::from_u64(36));
}
