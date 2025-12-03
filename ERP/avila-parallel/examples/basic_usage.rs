//! Basic usage examples of avila-parallel

use avila_parallel::prelude::*;
use avila_parallel::ThreadPool;

fn main() {
    println!("=== avila-parallel Examples ===\n");

    // Example 1: Parallel map
    println!("1. Parallel Map:");
    let numbers: Vec<i32> = (1..=10).collect();
    let squares: Vec<i32> = numbers
        .par_iter()
        .map(|&x| x * x)
        .collect();
    println!("   Numbers: {:?}", numbers);
    println!("   Squares: {:?}\n", squares);

    // Example 2: Parallel filter
    println!("2. Parallel Filter:");
    let evens: Vec<i32> = numbers
        .par_iter()
        .filter(|&&x| x % 2 == 0)
        .cloned()
        .collect();
    println!("   Even numbers: {:?}\n", evens);

    // Example 3: Parallel sum
    println!("3. Parallel Sum:");
    let sum: i32 = numbers.par_iter().cloned().sum();
    println!("   Sum of 1..10: {}\n", sum);

    // Example 4: Parallel reduce
    println!("4. Parallel Reduce:");
    let product = numbers
        .par_iter()
        .cloned()
        .reduce(|a, b| a * b);
    println!("   Product: {:?}\n", product);

    // Example 5: Parallel all/any
    println!("5. Parallel All/Any:");
    let all_positive = numbers.par_iter().all(|&x| x > 0);
    let has_five = numbers.par_iter().any(|&x| x == 5);
    println!("   All positive: {}", all_positive);
    println!("   Has five: {}\n", has_five);

    // Example 6: Mutable iteration
    println!("6. Mutable Parallel Iteration:");
    let mut data = vec![1, 2, 3, 4, 5];
    println!("   Before: {:?}", data);
    data.par_iter_mut().for_each(|x| *x *= 2);
    println!("   After doubling: {:?}\n", data);

    // Example 7: Thread pool
    println!("7. Thread Pool:");
    let pool = ThreadPool::new(4);
    println!("   Created pool with {} workers", pool.size());

    for i in 0..8 {
        pool.execute(move || {
            println!("   Task {} executing", i);
        });
    }

    pool.wait();
    println!("   All tasks completed\n");

    // Example 8: Complex chain
    println!("8. Complex Operation Chain:");
    let result: i32 = (1..=100)
        .collect::<Vec<_>>()
        .par_iter()
        .filter(|&&x| x % 3 == 0)
        .cloned()
        .map(|x| x * 2)
        .sum();
    println!("   Sum of (multiples of 3) * 2 in 1..100: {}\n", result);

    // Example 9: Find any
    println!("9. Find Any:");
    let large_vec: Vec<i32> = (1..=1000).collect();
    let found = large_vec
        .par_iter()
        .find_any(|&&x| x > 500 && x % 7 == 0);
    println!("   First multiple of 7 > 500: {:?}\n", found);

    // Example 10: Fold
    println!("10. Parallel Fold:");
    let vec = vec![1, 2, 3, 4, 5];
    let results: Vec<i32> = vec
        .par_iter()
        .fold(|| 0, |acc, &x| acc + x)
        .collect();
    println!("   Folded result: {:?}", results);

    println!("\n=== Examples Complete ===");
}
