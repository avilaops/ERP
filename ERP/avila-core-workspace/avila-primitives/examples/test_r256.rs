// Teste de 2^256 mod p

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

    // Calcula 2^256 mod m por dobramentos
    let mut val = U256::ONE;
    for i in 0..256 {
        // Dobra val
        let doubled = val.wrapping_add(&val);
        val = if doubled >= m {
            doubled.wrapping_sub(&m)
        } else if doubled < val {
            // Overflow!
            println!("OVERFLOW na iteração {}", i);
            doubled
        } else {
            doubled
        };
    }

    println!("2^256 mod p calculado: {:016x} {:016x} {:016x} {:016x}",
        val.limbs[3], val.limbs[2], val.limbs[1], val.limbs[0]);
    println!("2^256 mod p esperado:  0000000000000000 0000000000000000 0000000000000000 00000001000003d1");

    let expected = U256 {
        limbs: [0x00000001000003D1, 0, 0, 0]
    };

    println!("Correto: {}", val == expected);
}
