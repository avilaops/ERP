//! Eigenvalue and eigenvector computations

use crate::tensor::{Matrix, Vector};
use nalgebra::DMatrix;

/// Calcula autovalores de uma matriz quadrada
///
/// Retorna vetor com autovalores (podem ser complexos, retornamos parte real)
///
/// # Example
/// ```
/// use avila_math::linalg::eigenvalues;
/// use avila_math::tensor::Matrix;
///
/// let m = Matrix::from_data([2, 2], vec![
///     2.0, 1.0,
///     1.0, 2.0
/// ]).unwrap();
///
/// let eigenvals = eigenvalues(&m).unwrap();
/// assert_eq!(eigenvals.len(), 2);
/// ```
pub fn eigenvalues(matrix: &Matrix) -> Result<Vec<f64>, String> {
    if matrix.shape[0] != matrix.shape[1] {
        return Err("Matrix must be square to compute eigenvalues".to_string());
    }

    let n = matrix.shape[0];

    let mut data = Vec::with_capacity(n * n);
    for i in 0..n {
        for j in 0..n {
            data.push(matrix.get([i, j]).unwrap());
        }
    }

    let dmatrix = DMatrix::from_row_slice(n, n, &data);
    let eigen = dmatrix.symmetric_eigen();

    Ok(eigen.eigenvalues.iter().copied().collect())
}

/// Calcula autovalores e autovetores de uma matriz simétrica
///
/// Retorna (autovalores, autovetores) onde autovetores é uma matriz
/// com cada coluna sendo um autovetor.
pub fn eigenvectors(matrix: &Matrix) -> Result<(Vec<f64>, Matrix), String> {
    if matrix.shape[0] != matrix.shape[1] {
        return Err("Matrix must be square to compute eigenvectors".to_string());
    }

    let n = matrix.shape[0];

    let mut data = Vec::with_capacity(n * n);
    for i in 0..n {
        for j in 0..n {
            data.push(matrix.get([i, j]).unwrap());
        }
    }

    let dmatrix = DMatrix::from_row_slice(n, n, &data);
    let eigen = dmatrix.symmetric_eigen();

    let eigenvals: Vec<f64> = eigen.eigenvalues.iter().copied().collect();

    let eigenvecs_data: Vec<f64> = eigen.eigenvectors.iter().copied().collect();
    let eigenvecs = Matrix::from_data([n, n], eigenvecs_data)?;

    Ok((eigenvals, eigenvecs))
}

/// Power iteration para encontrar o maior autovalor e autovetor
///
/// Método iterativo eficiente para matrizes grandes quando só precisamos
/// do maior autovalor.
///
/// # Arguments
/// * `matrix` - Matriz quadrada
/// * `max_iterations` - Número máximo de iterações
/// * `tolerance` - Tolerância para convergência
pub fn power_iteration(
    matrix: &Matrix,
    max_iterations: usize,
    tolerance: f64,
) -> Result<(f64, Vector), String> {
    if matrix.shape[0] != matrix.shape[1] {
        return Err("Matrix must be square".to_string());
    }

    let n = matrix.shape[0];

    // Inicializa vetor aleatório
    let mut v = Vector::from_data([n], vec![1.0; n])?;
    v = v.normalize();

    let mut lambda = 0.0;

    for _ in 0..max_iterations {
        // v_new = A * v
        let v_new = matrix.matvec(&v)?;

        // Normaliza
        let v_new_normalized = v_new.normalize();

        // Calcula autovalor: λ = v^T * A * v
        let av = matrix.matvec(&v_new_normalized)?;
        let lambda_new = v_new_normalized.dot(&av)?;

        // Verifica convergência
        if (lambda_new - lambda).abs() < tolerance {
            return Ok((lambda_new, v_new_normalized));
        }

        lambda = lambda_new;
        v = v_new_normalized;
    }

    Ok((lambda, v))
}

/// Calcula o maior autovalor (espectral radius)
pub fn spectral_radius(matrix: &Matrix) -> Result<f64, String> {
    let eigenvals = eigenvalues(matrix)?;
    Ok(eigenvals
        .iter()
        .map(|x| x.abs())
        .fold(f64::NEG_INFINITY, f64::max))
}

/// Verifica se a matriz é definida positiva
///
/// Uma matriz é definida positiva se todos os autovalores são > 0
pub fn is_positive_definite(matrix: &Matrix) -> Result<bool, String> {
    let eigenvals = eigenvalues(matrix)?;
    Ok(eigenvals.iter().all(|&x| x > 0.0))
}

/// Verifica se a matriz é semi-definida positiva
pub fn is_positive_semidefinite(matrix: &Matrix) -> Result<bool, String> {
    let eigenvals = eigenvalues(matrix)?;
    Ok(eigenvals.iter().all(|&x| x >= -1e-10)) // Pequena tolerância para erros numéricos
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_eigenvalues_identity() {
        let m = Matrix::identity(3);
        let eigenvals = eigenvalues(&m).unwrap();

        // Matriz identidade tem todos autovalores = 1
        for &val in &eigenvals {
            assert!((val - 1.0).abs() < 1e-10);
        }
    }

    #[test]
    fn test_eigenvalues_symmetric() {
        let m = Matrix::from_data([2, 2], vec![2.0, 1.0, 1.0, 2.0]).unwrap();

        let eigenvals = eigenvalues(&m).unwrap();
        assert_eq!(eigenvals.len(), 2);

        // Autovalores de [2,1; 1,2] são 3 e 1
        let mut sorted = eigenvals.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert!((sorted[0] - 1.0).abs() < 1e-10);
        assert!((sorted[1] - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_eigenvectors() {
        let m = Matrix::from_data([2, 2], vec![2.0, 0.0, 0.0, 3.0]).unwrap();

        let result = eigenvectors(&m);
        assert!(result.is_ok());

        let (eigenvals, eigenvecs) = result.unwrap();
        assert_eq!(eigenvals.len(), 2);
        assert_eq!(eigenvecs.shape(), &[2, 2]);
    }

    #[test]
    fn test_power_iteration() {
        let m = Matrix::from_data([2, 2], vec![2.0, 1.0, 1.0, 2.0]).unwrap();

        let result = power_iteration(&m, 100, 1e-10);
        assert!(result.is_ok());

        let (lambda, _v) = result.unwrap();
        // Maior autovalor é 3
        assert!((lambda - 3.0).abs() < 1e-6);
    }

    #[test]
    fn test_is_positive_definite() {
        let m = Matrix::from_data([2, 2], vec![2.0, 1.0, 1.0, 2.0]).unwrap();

        assert!(is_positive_definite(&m).unwrap());
    }
}
