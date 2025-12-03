//! Example: Using sparse matrices for large-scale computations
//!
//! Demonstrates CSR/CSC formats for efficient sparse linear algebra

use avila_linalg::{MatrixMxN, Vector, SparseMatrixCSR, SparseMatrixCSC};

fn main() {
    println!("=== Sparse Matrix Example ===\n");

    // Create a sparse 1000×1000 diagonal matrix
    println!("1. Creating sparse diagonal matrix (1000×1000)");
    let n = 1000;
    let mut dense = MatrixMxN::<f64>::zeros(n, n);
    for i in 0..n {
        dense.set(i, i, (i + 1) as f64);
    }

    // Convert to sparse
    let sparse_csr = SparseMatrixCSR::from_dense(&dense);

    println!("   Dense memory: {} bytes", n * n * 8);
    println!("   Sparse memory (approx): {} bytes", sparse_csr.nnz() * 16);
    println!("   Sparsity: {:.2}%", sparse_csr.sparsity() * 100.0);
    println!("   Non-zero elements: {}", sparse_csr.nnz());

    // Matrix-vector multiplication
    println!("\n2. Sparse matrix-vector multiplication");
    let x = Vector::from_vec(vec![1.0; n]);

    let start = std::time::Instant::now();
    let y = sparse_csr.matvec(&x).unwrap();
    let sparse_time = start.elapsed();

    println!("   Result[0]: {}", y.get(0).unwrap());
    println!("   Result[999]: {}", y.get(999).unwrap());
    println!("   Time: {:?}", sparse_time);

    // Compare with dense
    println!("\n3. Dense matrix-vector multiplication (for comparison)");
    let start = std::time::Instant::now();
    let y_dense = &dense * &x;
    let dense_time = start.elapsed();

    println!("   Time: {:?}", dense_time);
    println!("   Speedup: {:.2}x", dense_time.as_secs_f64() / sparse_time.as_secs_f64());

    // CSR to CSC conversion
    println!("\n4. Converting CSR to CSC");
    let sparse_csc = sparse_csr.transpose();
    println!("   CSC non-zeros: {}", sparse_csc.nnz());

    // Example with random sparse matrix
    println!("\n5. Random sparse matrix (5% density)");
    let m = 100;
    let mut random_dense = MatrixMxN::<f64>::zeros(m, m);
    for i in 0..m {
        for j in 0..m {
            if (i * 7 + j * 11) % 20 == 0 {
                random_dense.set(i, j, ((i + j) as f64) / 10.0);
            }
        }
    }

    let random_sparse = SparseMatrixCSR::from_dense(&random_dense);
    println!("   {}", random_sparse);
    println!("   Non-zeros: {}", random_sparse.nnz());
    println!("   Expected: ~{}", m * m / 20);

    // Convert back to dense
    println!("\n6. Converting back to dense");
    let reconstructed = random_sparse.to_dense();

    let mut max_error = 0.0;
    for i in 0..m {
        for j in 0..m {
            let orig = random_dense.get(i, j).unwrap();
            let recon = reconstructed.get(i, j).unwrap();
            let error = (orig - recon).abs();
            if error > max_error {
                max_error = error;
            }
        }
    }
    println!("   Max reconstruction error: {:.2e}", max_error);

    println!("\n=== Use Cases ===");
    println!("• Graph adjacency matrices");
    println!("• Finite element method");
    println!("• Text processing (TF-IDF)");
    println!("• Large-scale scientific computing");
    println!("• Neural network weight matrices");
}
