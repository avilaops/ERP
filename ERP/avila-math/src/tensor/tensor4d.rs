/// Tensor de ordem 4 - Generalização de matrizes para 4 dimensões
/// Aplicações: relatividade geral, processamento de imagens, aprendizado de máquina
use crate::tensor::{Matrix, Tensor};

/// Tensor de ordem 3
pub type Tensor3D = Tensor<3>;

/// Tensor de ordem 4
pub type Tensor4D = Tensor<4>;

impl Tensor3D {
    /// Cria tensor 3D de dimensões especificadas
    pub fn new(dim0: usize, dim1: usize, dim2: usize) -> Self {
        Self::zeros([dim0, dim1, dim2])
    }

    /// Extrai uma fatia 2D (matriz) em uma dimensão específica
    pub fn slice_2d(&self, axis: usize, index: usize) -> Result<Matrix, String> {
        match axis {
            0 => {
                if index >= self.shape[0] {
                    return Err("Index out of bounds".to_string());
                }
                let mut data = vec![0.0; self.shape[1] * self.shape[2]];
                for i in 0..self.shape[1] {
                    for j in 0..self.shape[2] {
                        data[i * self.shape[2] + j] = self.get([index, i, j]).unwrap();
                    }
                }
                Matrix::from_data([self.shape[1], self.shape[2]], data)
            }
            1 => {
                if index >= self.shape[1] {
                    return Err("Index out of bounds".to_string());
                }
                let mut data = vec![0.0; self.shape[0] * self.shape[2]];
                for i in 0..self.shape[0] {
                    for j in 0..self.shape[2] {
                        data[i * self.shape[2] + j] = self.get([i, index, j]).unwrap();
                    }
                }
                Matrix::from_data([self.shape[0], self.shape[2]], data)
            }
            2 => {
                if index >= self.shape[2] {
                    return Err("Index out of bounds".to_string());
                }
                let mut data = vec![0.0; self.shape[0] * self.shape[1]];
                for i in 0..self.shape[0] {
                    for j in 0..self.shape[1] {
                        data[i * self.shape[1] + j] = self.get([i, j, index]).unwrap();
                    }
                }
                Matrix::from_data([self.shape[0], self.shape[1]], data)
            }
            _ => Err("Axis must be 0, 1, or 2".to_string()),
        }
    }

    /// Convolução 3D (útil para processamento de vídeo e dados volumétricos)
    pub fn convolve_3d(&self, kernel: &Tensor3D) -> Result<Self, String> {
        let (d0, d1, d2) = (self.shape[0], self.shape[1], self.shape[2]);
        let (k0, k1, k2) = (kernel.shape[0], kernel.shape[1], kernel.shape[2]);

        if k0 > d0 || k1 > d1 || k2 > d2 {
            return Err("Kernel too large for input".to_string());
        }

        let out_shape = [d0 - k0 + 1, d1 - k1 + 1, d2 - k2 + 1];
        let mut result = Self::zeros(out_shape);

        for i in 0..out_shape[0] {
            for j in 0..out_shape[1] {
                for k in 0..out_shape[2] {
                    let mut sum = 0.0;
                    for ki in 0..k0 {
                        for kj in 0..k1 {
                            for kk in 0..k2 {
                                sum += self.get([i + ki, j + kj, k + kk]).unwrap()
                                    * kernel.get([ki, kj, kk]).unwrap();
                            }
                        }
                    }
                    result.set([i, j, k], sum).unwrap();
                }
            }
        }

        Ok(result)
    }
}

impl Tensor4D {
    /// Cria tensor 4D de dimensões especificadas
    pub fn new(dim0: usize, dim1: usize, dim2: usize, dim3: usize) -> Self {
        Self::zeros([dim0, dim1, dim2, dim3])
    }

    /// Cria tensor 4D a partir de batch de imagens (batch, channels, height, width)
    pub fn from_images(batch_size: usize, channels: usize, height: usize, width: usize) -> Self {
        Self::zeros([batch_size, channels, height, width])
    }

    /// Extrai uma fatia 3D em uma dimensão específica
    pub fn slice_3d(&self, axis: usize, index: usize) -> Result<Tensor3D, String> {
        match axis {
            0 => {
                if index >= self.shape[0] {
                    return Err("Index out of bounds".to_string());
                }
                let mut data = vec![0.0; self.shape[1] * self.shape[2] * self.shape[3]];
                for i in 0..self.shape[1] {
                    for j in 0..self.shape[2] {
                        for k in 0..self.shape[3] {
                            data[i * self.shape[2] * self.shape[3] + j * self.shape[3] + k] =
                                self.get([index, i, j, k]).unwrap();
                        }
                    }
                }
                Tensor3D::from_data([self.shape[1], self.shape[2], self.shape[3]], data)
            }
            1 => {
                if index >= self.shape[1] {
                    return Err("Index out of bounds".to_string());
                }
                let mut data = vec![0.0; self.shape[0] * self.shape[2] * self.shape[3]];
                for i in 0..self.shape[0] {
                    for j in 0..self.shape[2] {
                        for k in 0..self.shape[3] {
                            data[i * self.shape[2] * self.shape[3] + j * self.shape[3] + k] =
                                self.get([i, index, j, k]).unwrap();
                        }
                    }
                }
                Tensor3D::from_data([self.shape[0], self.shape[2], self.shape[3]], data)
            }
            2 => {
                if index >= self.shape[2] {
                    return Err("Index out of bounds".to_string());
                }
                let mut data = vec![0.0; self.shape[0] * self.shape[1] * self.shape[3]];
                for i in 0..self.shape[0] {
                    for j in 0..self.shape[1] {
                        for k in 0..self.shape[3] {
                            data[i * self.shape[1] * self.shape[3] + j * self.shape[3] + k] =
                                self.get([i, j, index, k]).unwrap();
                        }
                    }
                }
                Tensor3D::from_data([self.shape[0], self.shape[1], self.shape[3]], data)
            }
            3 => {
                if index >= self.shape[3] {
                    return Err("Index out of bounds".to_string());
                }
                let mut data = vec![0.0; self.shape[0] * self.shape[1] * self.shape[2]];
                for i in 0..self.shape[0] {
                    for j in 0..self.shape[1] {
                        for k in 0..self.shape[2] {
                            data[i * self.shape[1] * self.shape[2] + j * self.shape[2] + k] =
                                self.get([i, j, k, index]).unwrap();
                        }
                    }
                }
                Tensor3D::from_data([self.shape[0], self.shape[1], self.shape[2]], data)
            }
            _ => Err("Axis must be 0, 1, 2, or 3".to_string()),
        }
    }

    /// Extrai uma única imagem do batch (para processamento de imagens)
    pub fn get_image(&self, batch_idx: usize) -> Result<Tensor3D, String> {
        self.slice_3d(0, batch_idx)
    }

    /// Contração sobre dois índices (generalização do traço de matriz)
    /// Soma sobre índices especificados
    pub fn contract(&self, axis1: usize, axis2: usize) -> Result<Matrix, String> {
        if axis1 >= 4 || axis2 >= 4 || axis1 == axis2 {
            return Err("Invalid axes for contraction".to_string());
        }

        if self.shape[axis1] != self.shape[axis2] {
            return Err("Contracted dimensions must match".to_string());
        }

        // Para simplificar, implementamos o caso específico mais comum
        // Contração de índices 0 e 1
        if axis1 == 0 && axis2 == 1 {
            let size = self.shape[0].min(self.shape[1]);
            let mut result = Matrix::zeros([self.shape[2], self.shape[3]]);

            for i in 0..size {
                for j in 0..self.shape[2] {
                    for k in 0..self.shape[3] {
                        let val = result.get([j, k]).unwrap();
                        result
                            .set([j, k], val + self.get([i, i, j, k]).unwrap())
                            .unwrap();
                    }
                }
            }
            Ok(result)
        } else {
            Err("Only contraction over axes 0 and 1 implemented".to_string())
        }
    }

    /// Produto tensorial (outer product) com outro tensor
    pub fn outer_product_4d(&self, other: &Self) -> Tensor<8> {
        let new_shape = [
            self.shape[0],
            self.shape[1],
            self.shape[2],
            self.shape[3],
            other.shape[0],
            other.shape[1],
            other.shape[2],
            other.shape[3],
        ];
        let mut result = Tensor::<8>::zeros(new_shape);

        for i0 in 0..self.shape[0] {
            for i1 in 0..self.shape[1] {
                for i2 in 0..self.shape[2] {
                    for i3 in 0..self.shape[3] {
                        for j0 in 0..other.shape[0] {
                            for j1 in 0..other.shape[1] {
                                for j2 in 0..other.shape[2] {
                                    for j3 in 0..other.shape[3] {
                                        let val = self.get([i0, i1, i2, i3]).unwrap()
                                            * other.get([j0, j1, j2, j3]).unwrap();
                                        result.set([i0, i1, i2, i3, j0, j1, j2, j3], val).unwrap();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        result
    }

    /// Max pooling 2D em imagens (para redes neurais convolucionais)
    /// Assume formato (batch, channels, height, width)
    pub fn max_pool_2d(&self, pool_size: usize, stride: usize) -> Result<Self, String> {
        let (batch, channels, height, width) =
            (self.shape[0], self.shape[1], self.shape[2], self.shape[3]);

        let out_h = (height - pool_size) / stride + 1;
        let out_w = (width - pool_size) / stride + 1;

        let mut result = Self::zeros([batch, channels, out_h, out_w]);

        for b in 0..batch {
            for c in 0..channels {
                for i in 0..out_h {
                    for j in 0..out_w {
                        let mut max_val = f64::NEG_INFINITY;
                        for ki in 0..pool_size {
                            for kj in 0..pool_size {
                                let val =
                                    self.get([b, c, i * stride + ki, j * stride + kj]).unwrap();
                                if val > max_val {
                                    max_val = val;
                                }
                            }
                        }
                        result.set([b, c, i, j], max_val).unwrap();
                    }
                }
            }
        }

        Ok(result)
    }

    /// Average pooling 2D
    pub fn avg_pool_2d(&self, pool_size: usize, stride: usize) -> Result<Self, String> {
        let (batch, channels, height, width) =
            (self.shape[0], self.shape[1], self.shape[2], self.shape[3]);

        let out_h = (height - pool_size) / stride + 1;
        let out_w = (width - pool_size) / stride + 1;

        let mut result = Self::zeros([batch, channels, out_h, out_w]);
        let pool_area = (pool_size * pool_size) as f64;

        for b in 0..batch {
            for c in 0..channels {
                for i in 0..out_h {
                    for j in 0..out_w {
                        let mut sum = 0.0;
                        for ki in 0..pool_size {
                            for kj in 0..pool_size {
                                sum += self.get([b, c, i * stride + ki, j * stride + kj]).unwrap();
                            }
                        }
                        result.set([b, c, i, j], sum / pool_area).unwrap();
                    }
                }
            }
        }

        Ok(result)
    }

    /// Batch normalization (normaliza sobre o batch)
    pub fn batch_normalize(&self, epsilon: f64) -> Self {
        let (batch, channels, height, width) =
            (self.shape[0], self.shape[1], self.shape[2], self.shape[3]);

        let mut result = self.clone();

        for c in 0..channels {
            for h in 0..height {
                for w in 0..width {
                    // Calcula média e variância sobre o batch
                    let mut sum = 0.0;
                    for b in 0..batch {
                        sum += self.get([b, c, h, w]).unwrap();
                    }
                    let mean = sum / batch as f64;

                    let mut var_sum = 0.0;
                    for b in 0..batch {
                        let diff = self.get([b, c, h, w]).unwrap() - mean;
                        var_sum += diff * diff;
                    }
                    let variance = var_sum / batch as f64;
                    let std = (variance + epsilon).sqrt();

                    // Normaliza
                    for b in 0..batch {
                        let val = self.get([b, c, h, w]).unwrap();
                        let normalized = (val - mean) / std;
                        result.set([b, c, h, w], normalized).unwrap();
                    }
                }
            }
        }

        result
    }

    /// Aplica função de ativação elemento por elemento
    pub fn relu(&self) -> Self {
        self.map(|x| x.max(0.0))
    }

    pub fn sigmoid(&self) -> Self {
        self.map(|x| 1.0 / (1.0 + (-x).exp()))
    }

    pub fn tanh(&self) -> Self {
        self.map(|x| x.tanh())
    }

    /// Dropout (para treinamento de redes neurais)
    pub fn dropout(&self, rate: f64, training: bool) -> Self {
        if !training || rate == 0.0 {
            return self.clone();
        }

        let scale = 1.0 / (1.0 - rate);
        self.map(|x| {
            if avila_rand::random::<f64>() > rate {
                x * scale
            } else {
                0.0
            }
        })
    }
}

/// Operações específicas para processamento de imagens
pub mod image_ops {
    use super::*;

    /// Convolução 2D para processamento de imagens
    /// input: (batch, in_channels, height, width)
    /// kernel: (out_channels, in_channels, kernel_h, kernel_w)
    pub fn conv2d(
        input: &Tensor4D,
        kernel: &Tensor4D,
        stride: usize,
        padding: usize,
    ) -> Result<Tensor4D, String> {
        let (batch, in_channels, in_h, in_w) = (
            input.shape[0],
            input.shape[1],
            input.shape[2],
            input.shape[3],
        );
        let (out_channels, k_in_channels, k_h, k_w) = (
            kernel.shape[0],
            kernel.shape[1],
            kernel.shape[2],
            kernel.shape[3],
        );

        if in_channels != k_in_channels {
            return Err("Input channels must match kernel input channels".to_string());
        }

        let out_h = (in_h + 2 * padding - k_h) / stride + 1;
        let out_w = (in_w + 2 * padding - k_w) / stride + 1;

        let mut result = Tensor4D::zeros([batch, out_channels, out_h, out_w]);

        for b in 0..batch {
            for oc in 0..out_channels {
                for i in 0..out_h {
                    for j in 0..out_w {
                        let mut sum = 0.0;
                        for ic in 0..in_channels {
                            for ki in 0..k_h {
                                for kj in 0..k_w {
                                    let in_i = i * stride + ki;
                                    let in_j = j * stride + kj;

                                    if in_i >= padding
                                        && in_i < in_h + padding
                                        && in_j >= padding
                                        && in_j < in_w + padding
                                    {
                                        let input_val = input
                                            .get([b, ic, in_i - padding, in_j - padding])
                                            .unwrap_or(0.0);
                                        let kernel_val = kernel.get([oc, ic, ki, kj]).unwrap();
                                        sum += input_val * kernel_val;
                                    }
                                }
                            }
                        }
                        result.set([b, oc, i, j], sum).unwrap();
                    }
                }
            }
        }

        Ok(result)
    }

    /// Redimensiona imagem (interpolação nearest neighbor)
    pub fn resize_nearest(input: &Tensor3D, new_height: usize, new_width: usize) -> Tensor3D {
        let (channels, old_h, old_w) = (input.shape[0], input.shape[1], input.shape[2]);
        let mut result = Tensor3D::zeros([channels, new_height, new_width]);

        let scale_h = old_h as f64 / new_height as f64;
        let scale_w = old_w as f64 / new_width as f64;

        for c in 0..channels {
            for i in 0..new_height {
                for j in 0..new_width {
                    let src_i = ((i as f64 * scale_h) as usize).min(old_h - 1);
                    let src_j = ((j as f64 * scale_w) as usize).min(old_w - 1);
                    let val = input.get([c, src_i, src_j]).unwrap();
                    result.set([c, i, j], val).unwrap();
                }
            }
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tensor3d_creation() {
        let t = Tensor3D::new(2, 3, 4);
        assert_eq!(t.shape(), &[2, 3, 4]);
        assert_eq!(t.size(), 24);
    }

    #[test]
    fn test_tensor4d_creation() {
        let t = Tensor4D::new(2, 3, 4, 5);
        assert_eq!(t.shape(), &[2, 3, 4, 5]);
        assert_eq!(t.size(), 120);
    }

    #[test]
    fn test_tensor4d_slice() {
        let mut t = Tensor4D::new(2, 3, 4, 5);
        t.set([0, 1, 2, 3], 42.0).unwrap();

        let slice = t.slice_3d(0, 0).unwrap();
        assert_eq!(slice.shape(), &[3, 4, 5]);
        assert_eq!(slice.get([1, 2, 3]).unwrap(), 42.0);
    }

    #[test]
    fn test_max_pool_2d() {
        let mut t = Tensor4D::new(1, 1, 4, 4);
        for i in 0..4 {
            for j in 0..4 {
                t.set([0, 0, i, j], (i * 4 + j) as f64).unwrap();
            }
        }

        let pooled = t.max_pool_2d(2, 2).unwrap();
        assert_eq!(pooled.shape(), &[1, 1, 2, 2]);
        assert_eq!(pooled.get([0, 0, 0, 0]).unwrap(), 5.0);
    }

    #[test]
    fn test_relu_activation() {
        let t = Tensor4D::from_data([1, 1, 2, 2], vec![-1.0, 2.0, -3.0, 4.0]).unwrap();
        let activated = t.relu();

        assert_eq!(activated.get([0, 0, 0, 0]).unwrap(), 0.0);
        assert_eq!(activated.get([0, 0, 0, 1]).unwrap(), 2.0);
        assert_eq!(activated.get([0, 0, 1, 0]).unwrap(), 0.0);
        assert_eq!(activated.get([0, 0, 1, 1]).unwrap(), 4.0);
    }
}
