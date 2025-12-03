//! Linear system solvers

use crate::tensor::{Matrix, Vector};
use nalgebra::DMatrix;

/// Resolve sistema linear Ax = b usando decomposição LU
///
/// # Example
/// ```
/// use avila_math::linalg::solve_linear_system;
/// use avila_math::tensor::{Matrix, Vector};
///
/// let a = Matrix::from_data([2, 2], vec![
///     2.0, 1.0,
///     1.0, 3.0
/// ]).unwrap();
///
/// let b = Vector::from_slice(&[5.0, 6.0]);
///
/// let x = solve_linear_system(&a, &b).unwrap();
/// assert_eq!(x.shape(), &[2]);
/// ```
pub fn solve_linear_system(a: &Matrix, b: &Vector) -> Result<Vector, String> {
    if a.shape[0] != a.shape[1] {
        return Err("Matrix A must be square".to_string());
    }

    if a.shape[0] != b.shape[0] {
        return Err("Matrix A rows must match vector b length".to_string());
    }

    let n = a.shape[0];

    // Converte para nalgebra
    let mut a_data = Vec::with_capacity(n * n);
    for i in 0..n {
        for j in 0..n {
            a_data.push(a.get([i, j]).unwrap());
        }
    }

    let a_matrix = DMatrix::from_row_slice(n, n, &a_data);
    let b_data: Vec<f64> = (0..n).map(|i| b.get([i]).unwrap()).collect();
    let b_vector = nalgebra::DVector::from_vec(b_data);

    // Resolve Ax = b
    let lu = a_matrix.lu();
    let x_vector = lu.solve(&b_vector).ok_or("Failed to solve system")?;

    let x_data: Vec<f64> = x_vector.iter().copied().collect();
    Vector::from_data([n], x_data)
}

/// Resolve sistema triangular superior Ux = b
///
/// Usa back substitution para eficiência O(n²)
pub fn solve_upper_triangular(u: &Matrix, b: &Vector) -> Result<Vector, String> {
    let n = u.shape[0];

    if u.shape[0] != u.shape[1] {
        return Err("Matrix must be square".to_string());
    }

    if n != b.shape[0] {
        return Err("Dimension mismatch".to_string());
    }

    let mut x = Vector::zeros([n]);

    // Back substitution
    for i in (0..n).rev() {
        let mut sum = b.get([i]).unwrap();

        for j in (i + 1)..n {
            sum -= u.get([i, j]).unwrap() * x.get([j]).unwrap();
        }

        let u_ii = u.get([i, i]).unwrap();
        if u_ii.abs() < 1e-15 {
            return Err("Matrix is singular".to_string());
        }

        x.set([i], sum / u_ii)?;
    }

    Ok(x)
}

/// Resolve sistema triangular inferior Lx = b
///
/// Usa forward substitution
pub fn solve_lower_triangular(l: &Matrix, b: &Vector) -> Result<Vector, String> {
    let n = l.shape[0];

    if l.shape[0] != l.shape[1] {
        return Err("Matrix must be square".to_string());
    }

    if n != b.shape[0] {
        return Err("Dimension mismatch".to_string());
    }

    let mut x = Vector::zeros([n]);

    // Forward substitution
    for i in 0..n {
        let mut sum = b.get([i]).unwrap();

        for j in 0..i {
            sum -= l.get([i, j]).unwrap() * x.get([j]).unwrap();
        }

        let l_ii = l.get([i, i]).unwrap();
        if l_ii.abs() < 1e-15 {
            return Err("Matrix is singular".to_string());
        }

        x.set([i], sum / l_ii)?;
    }

    Ok(x)
}

/// Wrapper unificado para resolver sistemas triangulares
pub fn solve_triangular(matrix: &Matrix, b: &Vector, upper: bool) -> Result<Vector, String> {
    if upper {
        solve_upper_triangular(matrix, b)
    } else {
        solve_lower_triangular(matrix, b)
    }
}

/// Resolve sistema usando mínimos quadrados (least squares)
///
/// Para sistemas sobredeterminados (mais equações que variáveis)
/// Minimiza ||Ax - b||²
pub fn solve_least_squares(a: &Matrix, b: &Vector) -> Result<Vector, String> {
    let m = a.shape[0]; // linhas
    let n = a.shape[1]; // colunas

    if m != b.shape[0] {
        return Err("Dimension mismatch".to_string());
    }

    // Converte para nalgebra
    let mut a_data = Vec::with_capacity(m * n);
    for i in 0..m {
        for j in 0..n {
            a_data.push(a.get([i, j]).unwrap());
        }
    }

    let a_matrix = DMatrix::from_row_slice(m, n, &a_data);
    let b_data: Vec<f64> = (0..m).map(|i| b.get([i]).unwrap()).collect();
    let b_vector = nalgebra::DVector::from_vec(b_data);

    // Resolve usando SVD
    let svd = a_matrix.svd(true, true);
    let x_vector = svd
        .solve(&b_vector, 1e-10)
        .map_err(|_| "Failed to solve least squares".to_string())?;

    let x_data: Vec<f64> = x_vector.iter().copied().collect();
    Vector::from_data([n], x_data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_solve_linear_system() {
        let a = Matrix::from_data([2, 2], vec![2.0, 1.0, 1.0, 3.0]).unwrap();
        let b = Vector::from_slice(&[5.0, 6.0]);

        let x = solve_linear_system(&a, &b).unwrap();

        // Verifica Ax = b
        let ax = a.matvec(&x).unwrap();
        assert!((ax.get([0]).unwrap() - 5.0).abs() < 1e-10);
        assert!((ax.get([1]).unwrap() - 6.0).abs() < 1e-10);
    }

    #[test]
    fn test_solve_upper_triangular() {
        let u =
            Matrix::from_data([3, 3], vec![2.0, 1.0, 1.0, 0.0, 3.0, 2.0, 0.0, 0.0, 4.0]).unwrap();

        let b = Vector::from_slice(&[6.0, 8.0, 4.0]);

        let x = solve_upper_triangular(&u, &b).unwrap();

        // Verifica Ux = b
        let ux = u.matvec(&x).unwrap();
        for i in 0..3 {
            assert!((ux.get([i]).unwrap() - b.get([i]).unwrap()).abs() < 1e-10);
        }
    }

    #[test]
    fn test_solve_least_squares() {
        // Sistema sobredeterminado 3×2
        let a = Matrix::from_data([3, 2], vec![1.0, 1.0, 2.0, 1.0, 3.0, 1.0]).unwrap();

        let b = Vector::from_slice(&[2.0, 3.0, 4.0]);

        let x = solve_least_squares(&a, &b).unwrap();
        assert_eq!(x.shape(), &[2]);
    }
}
