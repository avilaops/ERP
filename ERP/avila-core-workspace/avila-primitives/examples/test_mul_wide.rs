// Teste de mul_wide

use avila_primitives::U256;

fn main() {
    // Teste simples: 2 × 3 = 6
    let two = U256::from_u64(2);
    let three = U256::from_u64(3);

    let (low, high) = two.mul_wide(&three);

    println!("2 × 3:");
    println!("  low:  {:?}", low);
    println!("  high: {:?}", high);
    println!("  Esperado: low = 6, high = 0");
    println!();

    // Teste maior: (2^64) × (2^64) = 2^128
    let val = U256 { limbs: [0, 1, 0, 0] }; // 2^64

    let (low2, high2) = val.mul_wide(&val);

    println!("2^64 × 2^64 = 2^128:");
    println!("  low:  {:016x} {:016x} {:016x} {:016x}",
        low2.limbs[3], low2.limbs[2], low2.limbs[1], low2.limbs[0]);
    println!("  high: {:016x} {:016x} {:016x} {:016x}",
        high2.limbs[3], high2.limbs[2], high2.limbs[1], high2.limbs[0]);
    println!("  Esperado: low = 0, high = 1 (na posição limbs[0])");
    println!();

    // Teste com Gx do secp256k1
    let gx = U256 {
        limbs: [
            0x59F2815B16F81798,
            0x029BFCDB2DCE28D9,
            0x55A06295CE870B07,
            0x79BE667EF9DCBBAC,
        ],
    };

    println!("Gx × Gx:");
    let (low3, high3) = gx.mul_wide(&gx);
    println!("  low:  {:016x} {:016x} {:016x} {:016x}",
        low3.limbs[3], low3.limbs[2], low3.limbs[1], low3.limbs[0]);
    println!("  high: {:016x} {:016x} {:016x} {:016x}",
        high3.limbs[3], high3.limbs[2], high3.limbs[1], high3.limbs[0]);
}
