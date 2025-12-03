// Teste rápido para debug de secp256k1

use avila_primitives::U256;

fn main() {
    // Constantes secp256k1
    let p = U256 {
        limbs: [
            0xFFFFFFFEFFFFFC2F,
            0xFFFFFFFFFFFFFFFF,
            0xFFFFFFFFFFFFFFFF,
            0xFFFFFFFFFFFFFFFF,
        ],
    };

    let gx = U256 {
        limbs: [
            0x59F2815B16F81798,
            0x029BFCDB2DCE28D9,
            0x55A06295CE870B07,
            0x79BE667EF9DCBBAC,
        ],
    };

    let gy = U256 {
        limbs: [
            0x9C47D08FFB10D4B8,
            0xFD17B448A6855419,
            0x5DA4FBFC0E1108A8,
            0x483ADA7726A3C465,
        ],
    };

    println!("P = {:?}", p);
    println!("Gx = {:?}", gx);
    println!("Gy = {:?}", gy);

    // Verifica equação: y² = x³ + 7 (mod p)

    // y²
    let (gy_low, gy_high) = gy.mul_wide(&gy);
    println!("\nGy² (full 512-bit):");
    println!("  low:  {:?}", gy_low);
    println!("  high: {:?}", gy_high);

    // Precisamos reduzir mod p
    // Como high != 0, precisamos de redução completa

    // Por agora vamos apenas verificar se y² < 2p
    println!("\nGy² comparado com P:");
    println!("  Gy² low >= P? {}", gy_low >= p);
}
