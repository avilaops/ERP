/// Convolução 4D para Redes Neurais e Processamento Espaço-Temporal
///
/// Implementa operações de convolução 4D otimizadas para:
/// - Dados espaço-temporais (x, y, z, t)
/// - Redes neurais convolucionais 4D
/// - Processamento de vídeos 3D + tempo
/// - Simulações físicas 4D
///
/// Formato de tensores: [batch, channels, dim1, dim2, dim3, dim4]
use crate::tensor::Tensor;
// Parallel processing using avila-parallel (sequential for now)
// use avila_parallel::prelude::*;

pub type Tensor4D = Tensor<4>;
pub type Tensor5D = Tensor<5>;
pub type Tensor6D = Tensor<6>;

/// Configuração de convolução 4D
#[derive(Debug, Clone, Copy)]
pub struct Conv4DConfig {
    /// Stride em cada dimensão [s1, s2, s3, s4]
    pub stride: [usize; 4],
    /// Padding em cada dimensão [p1, p2, p3, p4]
    pub padding: [usize; 4],
    /// Dilation em cada dimensão [d1, d2, d3, d4]
    pub dilation: [usize; 4],
    /// Grupos de convolução (para grouped convolution)
    pub groups: usize,
}

impl Default for Conv4DConfig {
    fn default() -> Self {
        Self {
            stride: [1, 1, 1, 1],
            padding: [0, 0, 0, 0],
            dilation: [1, 1, 1, 1],
            groups: 1,
        }
    }
}

impl Conv4DConfig {
    pub fn with_stride(mut self, stride: [usize; 4]) -> Self {
        self.stride = stride;
        self
    }

    pub fn with_padding(mut self, padding: [usize; 4]) -> Self {
        self.padding = padding;
        self
    }

    pub fn with_dilation(mut self, dilation: [usize; 4]) -> Self {
        self.dilation = dilation;
        self
    }

    pub fn with_groups(mut self, groups: usize) -> Self {
        self.groups = groups;
        self
    }

    /// Calcula as dimensões de saída
    pub fn output_size(&self, input_size: [usize; 4], kernel_size: [usize; 4]) -> [usize; 4] {
        [
            (input_size[0] + 2 * self.padding[0] - self.dilation[0] * (kernel_size[0] - 1) - 1)
                / self.stride[0]
                + 1,
            (input_size[1] + 2 * self.padding[1] - self.dilation[1] * (kernel_size[1] - 1) - 1)
                / self.stride[1]
                + 1,
            (input_size[2] + 2 * self.padding[2] - self.dilation[2] * (kernel_size[2] - 1) - 1)
                / self.stride[2]
                + 1,
            (input_size[3] + 2 * self.padding[3] - self.dilation[3] * (kernel_size[3] - 1) - 1)
                / self.stride[3]
                + 1,
        ]
    }
}

/// Layer de Convolução 4D
///
/// Formato:
/// - Input: [batch, in_channels, d1, d2, d3, d4]
/// - Kernel: [out_channels, in_channels/groups, k1, k2, k3, k4]
/// - Bias: [out_channels]
/// - Output: [batch, out_channels, o1, o2, o3, o4]
pub struct Conv4DLayer {
    /// Pesos do kernel
    pub weights: Tensor6D,
    /// Bias (opcional)
    pub bias: Option<Tensor<1>>,
    /// Configuração
    pub config: Conv4DConfig,
}

impl Conv4DLayer {
    /// Cria nova camada de convolução 4D
    ///
    /// # Arguments
    /// * `in_channels` - Número de canais de entrada
    /// * `out_channels` - Número de canais de saída
    /// * `kernel_size` - Tamanho do kernel [k1, k2, k3, k4]
    /// * `config` - Configuração de convolução
    pub fn new(
        in_channels: usize,
        out_channels: usize,
        kernel_size: [usize; 4],
        config: Conv4DConfig,
    ) -> Self {
        let channels_per_group = in_channels / config.groups;
        let weights = Tensor6D::zeros([
            out_channels,
            channels_per_group,
            kernel_size[0],
            kernel_size[1],
            kernel_size[2],
            kernel_size[3],
        ]);

        Self {
            weights,
            bias: None,
            config,
        }
    }

    /// Adiciona bias à camada
    pub fn with_bias(mut self, out_channels: usize) -> Self {
        self.bias = Some(Tensor::<1>::zeros([out_channels]));
        self
    }

    /// Inicializa pesos com Xavier/Glorot
    pub fn init_xavier(&mut self) {
        let fan_in = self.weights.shape[1]
            * self.weights.shape[2]
            * self.weights.shape[3]
            * self.weights.shape[4]
            * self.weights.shape[5];
        let fan_out = self.weights.shape[0]
            * self.weights.shape[2]
            * self.weights.shape[3]
            * self.weights.shape[4]
            * self.weights.shape[5];
        let scale = (2.0 / (fan_in + fan_out) as f64).sqrt();

        // Inicializa com distribuição uniforme [-scale, scale]
        for i in 0..self.weights.data.len() {
            self.weights.data[i] = (avila_rand::random::<f64>() * 2.0 - 1.0) * scale;
        }
    }

    /// Inicializa pesos com He initialization (para ReLU)
    pub fn init_he(&mut self) {
        let fan_in = self.weights.shape[1]
            * self.weights.shape[2]
            * self.weights.shape[3]
            * self.weights.shape[4]
            * self.weights.shape[5];
        let scale = (2.0 / fan_in as f64).sqrt();

        for i in 0..self.weights.data.len() {
            self.weights.data[i] = avila_rand::random::<f64>() * scale;
        }
    }

    /// Forward pass - aplica convolução 4D
    pub fn forward(&self, input: &Tensor6D) -> Result<Tensor6D, String> {
        conv4d(input, &self.weights, self.bias.as_ref(), &self.config)
    }

    /// Backward pass - calcula gradientes
    ///
    /// # Arguments
    /// * `input` - Tensor de entrada original [batch, in_channels, d1, d2, d3, d4]
    /// * `grad_output` - Gradiente da loss em relação à saída [batch, out_channels, o1, o2, o3, o4]
    ///
    /// # Returns
    /// * `grad_input` - Gradiente em relação à entrada
    /// * `grad_weights` - Gradiente em relação aos pesos
    /// * `grad_bias` - Gradiente em relação ao bias (se existir)
    pub fn backward(
        &self,
        input: &Tensor6D,
        grad_output: &Tensor6D,
    ) -> Result<(Tensor6D, Tensor6D, Option<Tensor<1>>), String> {
        let batch = input.shape[0];
        let in_channels = input.shape[1];
        let input_size = [
            input.shape[2],
            input.shape[3],
            input.shape[4],
            input.shape[5],
        ];

        let out_channels = grad_output.shape[1];
        let output_size = [
            grad_output.shape[2],
            grad_output.shape[3],
            grad_output.shape[4],
            grad_output.shape[5],
        ];

        let kernel_size = [
            self.weights.shape[2],
            self.weights.shape[3],
            self.weights.shape[4],
            self.weights.shape[5],
        ];

        // Gradiente em relação à entrada
        let mut grad_input = Tensor6D::zeros(input.shape);

        // Gradiente em relação aos pesos
        let mut grad_weights = Tensor6D::zeros(self.weights.shape);

        // Gradiente em relação ao bias
        let grad_bias = if self.bias.is_some() {
            Some(Tensor::<1>::zeros([out_channels]))
        } else {
            None
        };

        let channels_per_group = in_channels / self.config.groups;

        // Calcula gradientes em paralelo por batch
        let grad_results: Vec<_> = (0..batch)
            .into_iter()
            .map(|b| {
                conv4d_backward_single_batch(
                    input,
                    &self.weights,
                    grad_output,
                    b,
                    in_channels,
                    out_channels,
                    &input_size,
                    &kernel_size,
                    &output_size,
                    channels_per_group,
                    &self.config,
                )
            })
            .collect();

        // Acumula gradientes de todos os batches
        for (b, (grad_in_batch, grad_w_batch)) in grad_results.into_iter().enumerate() {
            // Acumula grad_input
            for ic in 0..in_channels {
                for i1 in 0..input_size[0] {
                    for i2 in 0..input_size[1] {
                        for i3 in 0..input_size[2] {
                            for i4 in 0..input_size[3] {
                                let idx = ic
                                    * input_size[0]
                                    * input_size[1]
                                    * input_size[2]
                                    * input_size[3]
                                    + i1 * input_size[1] * input_size[2] * input_size[3]
                                    + i2 * input_size[2] * input_size[3]
                                    + i3 * input_size[3]
                                    + i4;
                                let current = grad_input.get([b, ic, i1, i2, i3, i4]).unwrap();
                                grad_input
                                    .set([b, ic, i1, i2, i3, i4], current + grad_in_batch[idx])
                                    .unwrap();
                            }
                        }
                    }
                }
            }

            // Acumula grad_weights
            for oc in 0..out_channels {
                for ic in 0..channels_per_group {
                    for k1 in 0..kernel_size[0] {
                        for k2 in 0..kernel_size[1] {
                            for k3 in 0..kernel_size[2] {
                                for k4 in 0..kernel_size[3] {
                                    let idx = oc
                                        * channels_per_group
                                        * kernel_size[0]
                                        * kernel_size[1]
                                        * kernel_size[2]
                                        * kernel_size[3]
                                        + ic * kernel_size[0]
                                            * kernel_size[1]
                                            * kernel_size[2]
                                            * kernel_size[3]
                                        + k1 * kernel_size[1] * kernel_size[2] * kernel_size[3]
                                        + k2 * kernel_size[2] * kernel_size[3]
                                        + k3 * kernel_size[3]
                                        + k4;
                                    let current =
                                        grad_weights.get([oc, ic, k1, k2, k3, k4]).unwrap();
                                    grad_weights
                                        .set([oc, ic, k1, k2, k3, k4], current + grad_w_batch[idx])
                                        .unwrap();
                                }
                            }
                        }
                    }
                }
            }
        }

        // Calcula gradiente do bias (soma sobre batch e dimensões espaciais)
        if let Some(gb) = grad_bias.as_ref() {
            let mut new_grad_bias = gb.clone();
            for oc in 0..out_channels {
                let mut sum = 0.0;
                for b in 0..batch {
                    for o1 in 0..output_size[0] {
                        for o2 in 0..output_size[1] {
                            for o3 in 0..output_size[2] {
                                for o4 in 0..output_size[3] {
                                    sum += grad_output.get([b, oc, o1, o2, o3, o4]).unwrap();
                                }
                            }
                        }
                    }
                }
                new_grad_bias.set([oc], sum).unwrap();
            }
            return Ok((grad_input, grad_weights, Some(new_grad_bias)));
        }

        Ok((grad_input, grad_weights, grad_bias))
    }
}

/// Convolução 4D completa com suporte a batch e múltiplos canais
///
/// # Arguments
/// * `input` - Tensor de entrada [batch, in_channels, d1, d2, d3, d4]
/// * `kernel` - Kernel [out_channels, in_channels/groups, k1, k2, k3, k4]
/// * `bias` - Bias opcional [out_channels]
/// * `config` - Configuração de convolução
pub fn conv4d(
    input: &Tensor6D,
    kernel: &Tensor6D,
    bias: Option<&Tensor<1>>,
    config: &Conv4DConfig,
) -> Result<Tensor6D, String> {
    // Validações
    let batch = input.shape[0];
    let in_channels = input.shape[1];
    let input_size = [
        input.shape[2],
        input.shape[3],
        input.shape[4],
        input.shape[5],
    ];

    let out_channels = kernel.shape[0];
    let kernel_channels = kernel.shape[1];
    let kernel_size = [
        kernel.shape[2],
        kernel.shape[3],
        kernel.shape[4],
        kernel.shape[5],
    ];

    if !in_channels.is_multiple_of(config.groups) {
        return Err("in_channels deve ser divisível por groups".to_string());
    }

    if !out_channels.is_multiple_of(config.groups) {
        return Err("out_channels deve ser divisível por groups".to_string());
    }

    if kernel_channels != in_channels / config.groups {
        return Err(format!(
            "kernel channels ({}) deve ser igual a in_channels/groups ({})",
            kernel_channels,
            in_channels / config.groups
        ));
    }

    // Calcula dimensões de saída
    let output_size = config.output_size(input_size, kernel_size);

    // Cria tensor de saída
    let mut output = Tensor6D::zeros([
        batch,
        out_channels,
        output_size[0],
        output_size[1],
        output_size[2],
        output_size[3],
    ]);

    // Convolução paralela por batch
    let results: Vec<_> = (0..batch)
        .into_iter()
        .map(|b| {
            conv4d_single_batch(
                input,
                kernel,
                b,
                in_channels,
                out_channels,
                &input_size,
                &kernel_size,
                &output_size,
                config,
            )
        })
        .collect();

    // Copia resultados para o tensor de saída
    for (b, batch_data) in results.into_iter().enumerate() {
        for oc in 0..out_channels {
            for o1 in 0..output_size[0] {
                for o2 in 0..output_size[1] {
                    for o3 in 0..output_size[2] {
                        for o4 in 0..output_size[3] {
                            let idx = oc
                                * output_size[0]
                                * output_size[1]
                                * output_size[2]
                                * output_size[3]
                                + o1 * output_size[1] * output_size[2] * output_size[3]
                                + o2 * output_size[2] * output_size[3]
                                + o3 * output_size[3]
                                + o4;
                            output
                                .set(
                                    [b, oc, o1, o2, o3, o4],
                                    batch_data[idx] + bias.map_or(0.0, |b| b.get([oc]).unwrap()),
                                )
                                .unwrap();
                        }
                    }
                }
            }
        }
    }

    Ok(output)
}

/// Convolução 4D para um único item do batch (paralelizável)
#[allow(clippy::too_many_arguments)]
fn conv4d_single_batch(
    input: &Tensor6D,
    kernel: &Tensor6D,
    batch_idx: usize,
    in_channels: usize,
    out_channels: usize,
    input_size: &[usize; 4],
    kernel_size: &[usize; 4],
    output_size: &[usize; 4],
    config: &Conv4DConfig,
) -> Vec<f64> {
    let mut result =
        vec![0.0; out_channels * output_size[0] * output_size[1] * output_size[2] * output_size[3]];

    let channels_per_group = in_channels / config.groups;

    // Para cada canal de saída
    for oc in 0..out_channels {
        let group = oc / (out_channels / config.groups);
        let group_start = group * channels_per_group;
        let group_end = group_start + channels_per_group;

        // Para cada posição de saída
        for o1 in 0..output_size[0] {
            for o2 in 0..output_size[1] {
                for o3 in 0..output_size[2] {
                    for o4 in 0..output_size[3] {
                        let mut sum = 0.0;

                        // Para cada canal de entrada no grupo
                        for ic in group_start..group_end {
                            // Para cada posição do kernel
                            for k1 in 0..kernel_size[0] {
                                for k2 in 0..kernel_size[1] {
                                    for k3 in 0..kernel_size[2] {
                                        for k4 in 0..kernel_size[3] {
                                            // Calcula posição na entrada com stride e dilation
                                            let i1 =
                                                o1 * config.stride[0] + k1 * config.dilation[0];
                                            let i2 =
                                                o2 * config.stride[1] + k2 * config.dilation[1];
                                            let i3 =
                                                o3 * config.stride[2] + k3 * config.dilation[2];
                                            let i4 =
                                                o4 * config.stride[3] + k4 * config.dilation[3];

                                            // Aplica padding (assume zero-padding)
                                            if i1 >= config.padding[0]
                                                && i2 >= config.padding[1]
                                                && i3 >= config.padding[2]
                                                && i4 >= config.padding[3]
                                            {
                                                let i1 = i1 - config.padding[0];
                                                let i2 = i2 - config.padding[1];
                                                let i3 = i3 - config.padding[2];
                                                let i4 = i4 - config.padding[3];

                                                if i1 < input_size[0]
                                                    && i2 < input_size[1]
                                                    && i3 < input_size[2]
                                                    && i4 < input_size[3]
                                                {
                                                    let input_val = input
                                                        .get([batch_idx, ic, i1, i2, i3, i4])
                                                        .unwrap();
                                                    let kernel_val = kernel
                                                        .get([oc, ic - group_start, k1, k2, k3, k4])
                                                        .unwrap();
                                                    sum += input_val * kernel_val;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        let idx =
                            oc * output_size[0] * output_size[1] * output_size[2] * output_size[3]
                                + o1 * output_size[1] * output_size[2] * output_size[3]
                                + o2 * output_size[2] * output_size[3]
                                + o3 * output_size[3]
                                + o4;
                        result[idx] = sum;
                    }
                }
            }
        }
    }

    result
}

/// Backward pass para um único item do batch (paralelizável)
#[allow(clippy::too_many_arguments)]
fn conv4d_backward_single_batch(
    input: &Tensor6D,
    weights: &Tensor6D,
    grad_output: &Tensor6D,
    batch_idx: usize,
    in_channels: usize,
    out_channels: usize,
    input_size: &[usize; 4],
    kernel_size: &[usize; 4],
    output_size: &[usize; 4],
    channels_per_group: usize,
    config: &Conv4DConfig,
) -> (Vec<f64>, Vec<f64>) {
    let grad_input_size =
        in_channels * input_size[0] * input_size[1] * input_size[2] * input_size[3];
    let grad_weights_size = out_channels
        * channels_per_group
        * kernel_size[0]
        * kernel_size[1]
        * kernel_size[2]
        * kernel_size[3];

    let mut grad_input = vec![0.0; grad_input_size];
    let mut grad_weights = vec![0.0; grad_weights_size];

    // Para cada canal de saída
    for oc in 0..out_channels {
        let group = oc / (out_channels / config.groups);
        let group_start = group * channels_per_group;
        let group_end = group_start + channels_per_group;

        // Para cada posição de saída
        for o1 in 0..output_size[0] {
            for o2 in 0..output_size[1] {
                for o3 in 0..output_size[2] {
                    for o4 in 0..output_size[3] {
                        let grad_out_val =
                            grad_output.get([batch_idx, oc, o1, o2, o3, o4]).unwrap();

                        // Para cada canal de entrada no grupo
                        for ic in group_start..group_end {
                            // Para cada posição do kernel
                            for k1 in 0..kernel_size[0] {
                                for k2 in 0..kernel_size[1] {
                                    for k3 in 0..kernel_size[2] {
                                        for k4 in 0..kernel_size[3] {
                                            // Calcula posição na entrada
                                            let i1 =
                                                o1 * config.stride[0] + k1 * config.dilation[0];
                                            let i2 =
                                                o2 * config.stride[1] + k2 * config.dilation[1];
                                            let i3 =
                                                o3 * config.stride[2] + k3 * config.dilation[2];
                                            let i4 =
                                                o4 * config.stride[3] + k4 * config.dilation[3];

                                            // Verifica bounds com padding
                                            if i1 >= config.padding[0]
                                                && i2 >= config.padding[1]
                                                && i3 >= config.padding[2]
                                                && i4 >= config.padding[3]
                                            {
                                                let i1 = i1 - config.padding[0];
                                                let i2 = i2 - config.padding[1];
                                                let i3 = i3 - config.padding[2];
                                                let i4 = i4 - config.padding[3];

                                                if i1 < input_size[0]
                                                    && i2 < input_size[1]
                                                    && i3 < input_size[2]
                                                    && i4 < input_size[3]
                                                {
                                                    // Gradiente em relação à entrada
                                                    let weight_val = weights
                                                        .get([oc, ic - group_start, k1, k2, k3, k4])
                                                        .unwrap();
                                                    let grad_in_idx = ic
                                                        * input_size[0]
                                                        * input_size[1]
                                                        * input_size[2]
                                                        * input_size[3]
                                                        + i1 * input_size[1]
                                                            * input_size[2]
                                                            * input_size[3]
                                                        + i2 * input_size[2] * input_size[3]
                                                        + i3 * input_size[3]
                                                        + i4;
                                                    grad_input[grad_in_idx] +=
                                                        grad_out_val * weight_val;

                                                    // Gradiente em relação aos pesos
                                                    let input_val = input
                                                        .get([batch_idx, ic, i1, i2, i3, i4])
                                                        .unwrap();
                                                    let grad_w_idx = oc
                                                        * channels_per_group
                                                        * kernel_size[0]
                                                        * kernel_size[1]
                                                        * kernel_size[2]
                                                        * kernel_size[3]
                                                        + (ic - group_start)
                                                            * kernel_size[0]
                                                            * kernel_size[1]
                                                            * kernel_size[2]
                                                            * kernel_size[3]
                                                        + k1 * kernel_size[1]
                                                            * kernel_size[2]
                                                            * kernel_size[3]
                                                        + k2 * kernel_size[2] * kernel_size[3]
                                                        + k3 * kernel_size[3]
                                                        + k4;
                                                    grad_weights[grad_w_idx] +=
                                                        grad_out_val * input_val;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    (grad_input, grad_weights)
}

/// Max Pooling 4D
///
/// # Arguments
/// * `input` - Tensor de entrada [batch, channels, d1, d2, d3, d4]
/// * `kernel_size` - Tamanho do kernel [k1, k2, k3, k4]
/// * `stride` - Stride [s1, s2, s3, s4] (se None, usa kernel_size)
pub fn max_pool4d(
    input: &Tensor6D,
    kernel_size: [usize; 4],
    stride: Option<[usize; 4]>,
) -> Result<Tensor6D, String> {
    let stride = stride.unwrap_or(kernel_size);

    let batch = input.shape[0];
    let channels = input.shape[1];
    let input_size = [
        input.shape[2],
        input.shape[3],
        input.shape[4],
        input.shape[5],
    ];

    let output_size = [
        (input_size[0] - kernel_size[0]) / stride[0] + 1,
        (input_size[1] - kernel_size[1]) / stride[1] + 1,
        (input_size[2] - kernel_size[2]) / stride[2] + 1,
        (input_size[3] - kernel_size[3]) / stride[3] + 1,
    ];

    let mut output = Tensor6D::zeros([
        batch,
        channels,
        output_size[0],
        output_size[1],
        output_size[2],
        output_size[3],
    ]);

    for b in 0..batch {
        for c in 0..channels {
            for o1 in 0..output_size[0] {
                for o2 in 0..output_size[1] {
                    for o3 in 0..output_size[2] {
                        for o4 in 0..output_size[3] {
                            let mut max_val = f64::NEG_INFINITY;

                            for k1 in 0..kernel_size[0] {
                                for k2 in 0..kernel_size[1] {
                                    for k3 in 0..kernel_size[2] {
                                        for k4 in 0..kernel_size[3] {
                                            let i1 = o1 * stride[0] + k1;
                                            let i2 = o2 * stride[1] + k2;
                                            let i3 = o3 * stride[2] + k3;
                                            let i4 = o4 * stride[3] + k4;

                                            let val = input.get([b, c, i1, i2, i3, i4]).unwrap();
                                            if val > max_val {
                                                max_val = val;
                                            }
                                        }
                                    }
                                }
                            }

                            output.set([b, c, o1, o2, o3, o4], max_val).unwrap();
                        }
                    }
                }
            }
        }
    }

    Ok(output)
}

/// Average Pooling 4D
pub fn avg_pool4d(
    input: &Tensor6D,
    kernel_size: [usize; 4],
    stride: Option<[usize; 4]>,
) -> Result<Tensor6D, String> {
    let stride = stride.unwrap_or(kernel_size);

    let batch = input.shape[0];
    let channels = input.shape[1];
    let input_size = [
        input.shape[2],
        input.shape[3],
        input.shape[4],
        input.shape[5],
    ];

    let output_size = [
        (input_size[0] - kernel_size[0]) / stride[0] + 1,
        (input_size[1] - kernel_size[1]) / stride[1] + 1,
        (input_size[2] - kernel_size[2]) / stride[2] + 1,
        (input_size[3] - kernel_size[3]) / stride[3] + 1,
    ];

    let mut output = Tensor6D::zeros([
        batch,
        channels,
        output_size[0],
        output_size[1],
        output_size[2],
        output_size[3],
    ]);

    let kernel_vol = (kernel_size[0] * kernel_size[1] * kernel_size[2] * kernel_size[3]) as f64;

    for b in 0..batch {
        for c in 0..channels {
            for o1 in 0..output_size[0] {
                for o2 in 0..output_size[1] {
                    for o3 in 0..output_size[2] {
                        for o4 in 0..output_size[3] {
                            let mut sum = 0.0;

                            for k1 in 0..kernel_size[0] {
                                for k2 in 0..kernel_size[1] {
                                    for k3 in 0..kernel_size[2] {
                                        for k4 in 0..kernel_size[3] {
                                            let i1 = o1 * stride[0] + k1;
                                            let i2 = o2 * stride[1] + k2;
                                            let i3 = o3 * stride[2] + k3;
                                            let i4 = o4 * stride[3] + k4;

                                            sum += input.get([b, c, i1, i2, i3, i4]).unwrap();
                                        }
                                    }
                                }
                            }

                            output
                                .set([b, c, o1, o2, o3, o4], sum / kernel_vol)
                                .unwrap();
                        }
                    }
                }
            }
        }
    }

    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conv4d_config() {
        let config = Conv4DConfig::default()
            .with_stride([2, 2, 2, 2])
            .with_padding([1, 1, 1, 1]);

        let input_size = [10, 10, 10, 10];
        let kernel_size = [3, 3, 3, 3];
        let output_size = config.output_size(input_size, kernel_size);

        // (10 + 2*1 - 1*(3-1) - 1) / 2 + 1 = (10 + 2 - 2 - 1) / 2 + 1 = 9/2 + 1 = 5
        assert_eq!(output_size, [5, 5, 5, 5]);
    }

    #[test]
    fn test_conv4d_layer_creation() {
        let layer = Conv4DLayer::new(8, 16, [3, 3, 3, 3], Conv4DConfig::default()).with_bias(16);

        assert_eq!(layer.weights.shape, [16, 8, 3, 3, 3, 3]);
        assert!(layer.bias.is_some());
        assert_eq!(layer.bias.as_ref().unwrap().shape, [16]);
    }

    #[test]
    fn test_conv4d_simple() {
        // Input: [1 batch, 2 channels, 4x4x4x4]
        let input = Tensor6D::zeros([1, 2, 4, 4, 4, 4]);

        // Kernel: [3 out_channels, 2 in_channels, 2x2x2x2]
        let kernel = Tensor6D::zeros([3, 2, 2, 2, 2, 2]);

        let config = Conv4DConfig::default();
        let result = conv4d(&input, &kernel, None, &config);

        assert!(result.is_ok());
        let output = result.unwrap();

        // Sem padding, stride 1: output = input - kernel + 1 = 4 - 2 + 1 = 3
        assert_eq!(output.shape, [1, 3, 3, 3, 3, 3]);
    }

    #[test]
    fn test_max_pool4d() {
        let mut input = Tensor6D::zeros([1, 1, 4, 4, 4, 4]);

        // Coloca valor máximo em posição conhecida
        input.set([0, 0, 1, 1, 1, 1], 10.0).unwrap();

        let result = max_pool4d(&input, [2, 2, 2, 2], None);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.shape, [1, 1, 2, 2, 2, 2]);

        // O valor 10.0 deve aparecer no pooling
        let pooled_val = output.get([0, 0, 0, 0, 0, 0]).unwrap();
        assert_eq!(pooled_val, 10.0);
    }

    #[test]
    fn test_avg_pool4d() {
        let mut input = Tensor6D::zeros([1, 1, 4, 4, 4, 4]);

        // Preenche região com valores conhecidos
        for i in 0..2 {
            for j in 0..2 {
                for k in 0..2 {
                    for l in 0..2 {
                        input.set([0, 0, i, j, k, l], 2.0).unwrap();
                    }
                }
            }
        }

        let result = avg_pool4d(&input, [2, 2, 2, 2], None);
        assert!(result.is_ok());

        let output = result.unwrap();
        let avg_val = output.get([0, 0, 0, 0, 0, 0]).unwrap();

        // Média de 16 valores = 2.0
        assert!((avg_val - 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_grouped_convolution() {
        // Grouped convolution com 2 grupos
        let input = Tensor6D::zeros([1, 4, 4, 4, 4, 4]);
        let kernel = Tensor6D::zeros([4, 2, 2, 2, 2, 2]); // 4 out, 2 in per group

        let config = Conv4DConfig::default().with_groups(2);
        let result = conv4d(&input, &kernel, None, &config);

        assert!(result.is_ok());
    }
}

#[test]
fn test_conv4d_backward_pass() {
    let mut input = Tensor6D::zeros([1, 2, 4, 4, 4, 4]);
    for i in 0..input.data.len() {
        input.data[i] = (i as f64) * 0.01;
    }

    let mut layer = Conv4DLayer::new(2, 3, [2, 2, 2, 2], Conv4DConfig::default());
    layer.init_xavier();

    let output = layer.forward(&input).unwrap();
    assert_eq!(output.shape, [1, 3, 3, 3, 3, 3]);

    let mut grad_output = Tensor6D::zeros(output.shape);
    for i in 0..grad_output.data.len() {
        grad_output.data[i] = 0.1;
    }

    let result = layer.backward(&input, &grad_output);
    assert!(result.is_ok());

    let (grad_input, grad_weights, _) = result.unwrap();
    assert_eq!(grad_input.shape, input.shape);
    assert_eq!(grad_weights.shape, layer.weights.shape);

    let grad_input_sum: f64 = grad_input.data.iter().sum();
    let grad_weights_sum: f64 = grad_weights.data.iter().sum();
    assert!(grad_input_sum.abs() > 1e-10);
    assert!(grad_weights_sum.abs() > 1e-10);
}

#[test]
fn test_conv4d_backward_with_bias() {
    let input = Tensor6D::zeros([1, 1, 3, 3, 3, 3]);
    let mut layer = Conv4DLayer::new(1, 2, [2, 2, 2, 2], Conv4DConfig::default()).with_bias(2);
    layer.init_he();

    let output = layer.forward(&input).unwrap();
    let grad_output = Tensor6D::filled(output.shape, 0.5);

    let result = layer.backward(&input, &grad_output);
    assert!(result.is_ok());

    let (_, _, grad_bias) = result.unwrap();
    assert!(grad_bias.is_some());
    assert_eq!(grad_bias.unwrap().shape, [2]);
}
