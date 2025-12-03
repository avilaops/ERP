// Debug mul_mod para secp256k1

use avila_primitives::U256;
use avila_math::modular::{add_mod, mul_mod};

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

    println!("Verificando: y² = x³ + 7 (mod p)");
    println!();

    // y²
    let y_squared = mul_mod(&gy, &gy, &p);
    println!("y² mod p = {:016x} {:016x} {:016x} {:016x}",
        y_squared.limbs[3], y_squared.limbs[2], y_squared.limbs[1], y_squared.limbs[0]);

    // x²
    let x_squared = mul_mod(&gx, &gx, &p);
    println!("x² mod p = {:016x} {:016x} {:016x} {:016x}",
        x_squared.limbs[3], x_squared.limbs[2], x_squared.limbs[1], x_squared.limbs[0]);

    // x³
    let x_cubed = mul_mod(&x_squared, &gx, &p);
    println!("x³ mod p = {:016x} {:016x} {:016x} {:016x}",
        x_cubed.limbs[3], x_cubed.limbs[2], x_cubed.limbs[1], x_cubed.limbs[0]);

    // 7
    let seven = U256::from_u64(7);
    println!("7        = {:016x} {:016x} {:016x} {:016x}",
        seven.limbs[3], seven.limbs[2], seven.limbs[1], seven.limbs[0]);

    // x³ + 7
    let rhs = add_mod(&x_cubed, &seven, &p);
    println!("x³+7     = {:016x} {:016x} {:016x} {:016x}",
        rhs.limbs[3], rhs.limbs[2], rhs.limbs[1], rhs.limbs[0]);

    println!();
    if y_squared == rhs {
        println!("✓ CORRETO: y² ≡ x³ + 7 (mod p)");
    } else {
        println!("✗ ERRO: y² ≠ x³ + 7 (mod p)");
        println!();

        // Mostra diferença
        if y_squared > rhs {
            let diff = y_squared.wrapping_sub(&rhs);
            println!("Diferença (y² - (x³+7)): {:016x} {:016x} {:016x} {:016x}",
                diff.limbs[3], diff.limbs[2], diff.limbs[1], diff.limbs[0]);
        } else {
            let diff = rhs.wrapping_sub(&y_squared);
            println!("Diferença ((x³+7) - y²): {:016x} {:016x} {:016x} {:016x}",
                diff.limbs[3], diff.limbs[2], diff.limbs[1], diff.limbs[0]);
        }
    }
}
