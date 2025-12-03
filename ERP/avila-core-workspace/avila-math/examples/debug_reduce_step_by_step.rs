// Debug detalhado de reduce_wide

use avila_primitives::U256;
use avila_math::modular::{add_mod, mul_mod_naive};

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

    let p_minus_1 = m.wrapping_sub(&U256::ONE);

    // mul_wide de (p-1) × (p-1)
    let (low, high) = p_minus_1.mul_wide(&p_minus_1);

    println!("(p-1) × (p-1) em 512 bits:");
    println!("low:  {:016x} {:016x} {:016x} {:016x}",
        low.limbs[3], low.limbs[2], low.limbs[1], low.limbs[0]);
    println!("high: {:016x} {:016x} {:016x} {:016x}\n",
        high.limbs[3], high.limbs[2], high.limbs[1], high.limbs[0]);

    // Calcula r = 2^256 - m
    let r = U256::ZERO.wrapping_sub(&m);
    println!("r = 2^256 mod m:");
    println!("  {:016x} {:016x} {:016x} {:016x}\n",
        r.limbs[3], r.limbs[2], r.limbs[1], r.limbs[0]);

    // high × r mod m
    let high_times_r = mul_mod_naive(&high, &r, &m);
    println!("high × r mod m:");
    println!("  {:016x} {:016x} {:016x} {:016x}\n",
        high_times_r.limbs[3], high_times_r.limbs[2], high_times_r.limbs[1], high_times_r.limbs[0]);

    // low mod m
    let mut low_red = low;
    while low_red >= m {
        low_red = low_red.wrapping_sub(&m);
    }
    println!("low mod m:");
    println!("  {:016x} {:016x} {:016x} {:016x}\n",
        low_red.limbs[3], low_red.limbs[2], low_red.limbs[1], low_red.limbs[0]);

    // (high × r) + low mod m
    let final_result = add_mod(&high_times_r, &low_red, &m);
    println!("(high × r + low) mod m:");
    println!("  {:016x} {:016x} {:016x} {:016x}",
        final_result.limbs[3], final_result.limbs[2], final_result.limbs[1], final_result.limbs[0]);
    println!("Esperado: 0000000000000000 0000000000000000 0000000000000000 0000000000000001");
    println!("Correto: {}", final_result == U256::ONE);
}
