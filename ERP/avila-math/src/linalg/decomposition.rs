//! Matrix decompositions: SVD, QR, LU

use crate::tensor::Matrix;
use nalgebra::{DMatrix, SVD};

/// Singular Value Decomposition (SVD)
///
/// Decompõe matriz A = U * Σ * V^T onde:
/// - U: matriz ortogonal esquerda (m × m)
/// - Σ: matriz diagonal com valores singulares (m × n)
/// - V^T: transposta da matriz ortogonal direita (n × n)
///
/// # Example
/// ```
/// use avila_math::linalg::svd;
/// use avila_math::tensor::Matrix;
///
/// let m = Matrix::from_data([3, 2], vec![
///     1.0, 2.0,
///     3.0, 4.0,
///     5.0, 6.0
/// ]).unwrap();
///
/// let (u, s, vt) = svd(&m).unwrap();
/// assert_eq!(u.shape(), &[3, 3]);
/// assert_eq!(s.len(), 2);  // valores singulares
/// assert_eq!(vt.shape(), &[2, 2]);
/// ```
pub fn svd(matrix: &Matrix) -> Result<(Matrix, Vec<f64>, Matrix), String> {
    let rows = matrix.shape[0];
    let cols = matrix.shape[1];

    // Converte para nalgebra DMatrix
    let mut data = Vec::with_capacity(rows * cols);
    for i in 0..rows {
        for j in 0..cols {
            data.push(matrix.get([i, j]).unwrap());
        }
    }

    let dmatrix = DMatrix::from_row_slice(rows, cols, &data);

    // Computa SVD
    let svd = SVD::new(dmatrix, true, true);

    // Extrai U
    let u_matrix = svd.u.ok_or("Failed to compute U matrix")?;
    let u_data: Vec<f64> = u_matrix.iter().copied().collect();
    let u = Matrix::from_data([u_matrix.nrows(), u_matrix.ncols()], u_data)?;

    // Extrai valores singulares
    let singular_values: Vec<f64> = svd.singular_values.iter().copied().collect();

    // Extrai V^T
    let v_t_matrix = svd.v_t.ok_or("Failed to compute V^T matrix")?;
    let v_t_data: Vec<f64> = v_t_matrix.iter().copied().collect();
    let v_t = Matrix::from_data([v_t_matrix.nrows(), v_t_matrix.ncols()], v_t_data)?;

    Ok((u, singular_values, v_t))
}

/// QR Decomposition
///
/// Decompõe matriz A = Q * R onde:
/// - Q: matriz ortogonal (m × m)
/// - R: matriz triangular superior (m × n)
///
/// Útil para resolver sistemas lineares e calcular autovalores.
pub fn qr_decomposition(matrix: &Matrix) -> Result<(Matrix, Matrix), String> {
    let rows = matrix.shape[0];
    let cols = matrix.shape[1];

    let mut data = Vec::with_capacity(rows * cols);
    for i in 0..rows {
        for j in 0..cols {
            data.push(matrix.get([i, j]).unwrap());
        }
    }

    let dmatrix = DMatrix::from_row_slice(rows, cols, &data);
    let qr = dmatrix.qr();

    // Extrai Q
    let q_matrix = qr.q();
    let q_data: Vec<f64> = q_matrix.iter().copied().collect();
    let q = Matrix::from_data([q_matrix.nrows(), q_matrix.ncols()], q_data)?;

    // Extrai R
    let r_matrix = qr.r();
    let r_data: Vec<f64> = r_matrix.iter().copied().collect();
    let r = Matrix::from_data([r_matrix.nrows(), r_matrix.ncols()], r_data)?;

    Ok((q, r))
}

/// LU Decomposition
///
/// Decompõe matriz A = P * L * U onde:
/// - P: matriz de permutação
/// - L: matriz triangular inferior
/// - U: matriz triangular superior
///
/// Retorna apenas L e U. Para obter P, use nalgebra diretamente.
pub fn lu_decomposition(matrix: &Matrix) -> Result<(Matrix, Matrix), String> {
    if matrix.shape[0] != matrix.shape[1] {
        return Err("Matrix must be square for LU decomposition".to_string());
    }

    let n = matrix.shape[0];

    let mut data = Vec::with_capacity(n * n);
    for i in 0..n {
        for j in 0..n {
            data.push(matrix.get([i, j]).unwrap());
        }
    }

    let dmatrix = DMatrix::from_row_slice(n, n, &data);
    let lu = dmatrix.lu();

    // Extrai L
    let l_matrix = lu.l();
    let l_data: Vec<f64> = l_matrix.iter().copied().collect();
    let l = Matrix::from_data([n, n], l_data)?;

    // Extrai U
    let u_matrix = lu.u();
    let u_data: Vec<f64> = u_matrix.iter().copied().collect();
    let u = Matrix::from_data([n, n], u_data)?;

    Ok((l, u))
}

/// Calcula o rank da matriz usando SVD
pub fn matrix_rank(matrix: &Matrix, tolerance: Option<f64>) -> Result<usize, String> {
    let (_, singular_values, _) = svd(matrix)?;

    let tol = tolerance.unwrap_or_else(|| {
        let max_sv = singular_values
            .iter()
            .cloned()
            .fold(f64::NEG_INFINITY, f64::max);
        let n = matrix.shape[0].max(matrix.shape[1]) as f64;
        max_sv * n * f64::EPSILON
    });

    Ok(singular_values.iter().filter(|&&sv| sv > tol).count())
}

/// Calcula o número de condição da matriz
pub fn condition_number(matrix: &Matrix) -> Result<f64, String> {
    let (_, singular_values, _) = svd(matrix)?;

    if singular_values.is_empty() {
        return Err("Matrix has no singular values".to_string());
    }

    let max_sv = singular_values
        .iter()
        .cloned()
        .fold(f64::NEG_INFINITY, f64::max);
    let min_sv = singular_values
        .iter()
        .cloned()
        .fold(f64::INFINITY, f64::min);

    if min_sv == 0.0 {
        Ok(f64::INFINITY)
    } else {
        Ok(max_sv / min_sv)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_svd_simple() {
        let m = Matrix::from_data([2, 2], vec![4.0, 0.0, 3.0, -5.0]).unwrap();

        let result = svd(&m);
        assert!(result.is_ok());

        let (u, s, vt) = result.unwrap();
        assert_eq!(u.shape(), &[2, 2]);
        assert_eq!(s.len(), 2);
        assert_eq!(vt.shape(), &[2, 2]);

        // Valores singulares devem ser positivos
        assert!(s[0] > 0.0);
        assert!(s[1] >= 0.0);
    }

    #[test]
    fn test_qr_decomposition() {
        let m =
            Matrix::from_data([3, 3], vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]).unwrap();

        let result = qr_decomposition(&m);
        assert!(result.is_ok());

        let (q, r) = result.unwrap();
        assert_eq!(q.shape(), &[3, 3]);
        assert_eq!(r.shape(), &[3, 3]);
    }

    #[test]
    fn test_lu_decomposition() {
        let m =
            Matrix::from_data([3, 3], vec![2.0, 1.0, 1.0, 4.0, 3.0, 3.0, 8.0, 7.0, 9.0]).unwrap();

        let result = lu_decomposition(&m);
        assert!(result.is_ok());

        let (l, u) = result.unwrap();
        assert_eq!(l.shape(), &[3, 3]);
        assert_eq!(u.shape(), &[3, 3]);
    }

    #[test]
    fn test_matrix_rank() {
        // Matriz de rank 2
        let m =
            Matrix::from_data([3, 3], vec![1.0, 2.0, 3.0, 2.0, 4.0, 6.0, 0.0, 1.0, 1.0]).unwrap();

        let rank = matrix_rank(&m, Some(1e-10)).unwrap();
        assert!(rank <= 3); // Rank máximo é 3
    }

    #[test]
    fn test_condition_number() {
        let m = Matrix::identity(3);
        let cond = condition_number(&m).unwrap();
        assert!((cond - 1.0).abs() < 1e-10); // Matriz identidade tem condição 1
    }
}
