use arxis_quaternions::tensor::{Matrix, Tensor, Vector};
use arxis_quaternions::tensor4d::{image_ops, Tensor3D, Tensor4D};

fn main() {
    println!("=== Exemplos de Tensores Generalizados ===\n");

    // ========== ORDEM 0: ESCALAR ==========
    println!("--- Ordem 0: Escalar ---");
    let scalar: f64 = 42.0;
    println!("Escalar: {}", scalar);

    // ========== ORDEM 1: VETOR ==========
    println!("\n--- Ordem 1: Vetor ---");
    let v1 = Vector::from_slice(&[1.0, 2.0, 3.0, 4.0]);
    let v2 = Vector::from_slice(&[5.0, 6.0, 7.0, 8.0]);

    println!("v1 = {:?}", v1.data);
    println!("v2 = {:?}", v2.data);

    let dot = v1.dot(&v2).unwrap();
    println!("v1 · v2 = {}", dot);

    let norm = v1.norm();
    println!("|v1| = {:.4}", norm);

    // Produto vetorial (3D)
    let a = Vector::from_slice(&[1.0, 0.0, 0.0]);
    let b = Vector::from_slice(&[0.0, 1.0, 0.0]);
    let c = a.cross(&b).unwrap();
    println!(
        "\nProduto vetorial: {:?} × {:?} = {:?}",
        a.data, b.data, c.data
    );

    // ========== ORDEM 2: MATRIZ ==========
    println!("\n--- Ordem 2: Matriz ---");
    let m1 = Matrix::from_data([2, 3], vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]).unwrap();

    println!("Matriz 2×3:");
    for i in 0..2 {
        print!("  [");
        for j in 0..3 {
            print!("{:6.2}", m1.get([i, j]).unwrap());
        }
        println!(" ]");
    }

    // Multiplicação de matrizes
    let a = Matrix::from_data([2, 2], vec![1.0, 2.0, 3.0, 4.0]).unwrap();
    let b = Matrix::from_data([2, 2], vec![5.0, 6.0, 7.0, 8.0]).unwrap();
    let c = a.matmul(&b).unwrap();

    println!("\nMultiplicação de matrizes:");
    println!("A × B =");
    for i in 0..2 {
        print!("  [");
        for j in 0..2 {
            print!("{:6.2}", c.get([i, j]).unwrap());
        }
        println!(" ]");
    }

    // Matriz identidade e determinante
    let id = Matrix::identity(3);
    println!("\nMatriz identidade 3×3:");
    for i in 0..3 {
        print!("  [");
        for j in 0..3 {
            print!("{:6.2}", id.get([i, j]).unwrap());
        }
        println!(" ]");
    }

    let mat = Matrix::from_data([3, 3], vec![1.0, 2.0, 3.0, 0.0, 1.0, 4.0, 5.0, 6.0, 0.0]).unwrap();
    let det = mat.determinant().unwrap();
    println!("\nDeterminante da matriz: {}", det);
    println!("Traço da matriz: {}", mat.trace());

    // ========== ORDEM 3: TENSOR 3D ==========
    println!("\n--- Ordem 3: Tensor 3D ---");
    let mut t3 = Tensor3D::new(2, 3, 4);

    // Preenche com valores
    for i in 0..2 {
        for j in 0..3 {
            for k in 0..4 {
                t3.set([i, j, k], (i * 12 + j * 4 + k) as f64).unwrap();
            }
        }
    }

    println!("Tensor 3D de forma [2, 3, 4]");
    println!("Total de elementos: {}", t3.size());
    println!("Soma de elementos: {}", t3.sum());
    println!("Média: {:.4}", t3.mean());
    println!("Norma de Frobenius: {:.4}", t3.frobenius_norm());

    // Extrai fatia 2D
    let slice = t3.slice_2d(0, 0).unwrap();
    println!("\nFatia 2D (índice 0 na primeira dimensão):");
    for i in 0..slice.shape[0] {
        print!("  [");
        for j in 0..slice.shape[1] {
            print!("{:6.2}", slice.get([i, j]).unwrap());
        }
        println!(" ]");
    }

    // ========== ORDEM 4: TENSOR 4D ==========
    println!("\n--- Ordem 4: Tensor 4D ---");
    let t4 = Tensor4D::new(2, 3, 4, 5);
    println!("Tensor 4D de forma [2, 3, 4, 5]");
    println!("Total de elementos: {}", t4.size());
    println!("Rank: {}", t4.rank());

    // Operações tensoriais
    println!("\n--- Operações Tensoriais ---");

    let t_a: Tensor<3> = Tensor::filled([2, 2, 2], 3.0);
    let t_b: Tensor<3> = Tensor::filled([2, 2, 2], 2.0);

    let t_sum = t_a.add_elementwise(&t_b).unwrap();
    println!(
        "Soma elemento-por-elemento: primeiro elemento = {}",
        t_sum.get([0, 0, 0]).unwrap()
    );

    let t_scaled = t_a.scale(5.0);
    println!(
        "Tensor escalado por 5: primeiro elemento = {}",
        t_scaled.get([0, 0, 0]).unwrap()
    );

    let t_hadamard = t_a.hadamard(&t_b).unwrap();
    println!(
        "Produto de Hadamard: primeiro elemento = {}",
        t_hadamard.get([0, 0, 0]).unwrap()
    );

    // Reshape
    println!("\n--- Reshape de Tensores ---");
    let original: Tensor<2> = Matrix::from_data(
        [2, 6],
        vec![
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0,
        ],
    )
    .unwrap();

    let reshaped: Tensor<3> = original.reshape([3, 2, 2]).unwrap();
    println!("Original [2, 6] → Reshape [3, 2, 2]");
    println!("Elemento [1, 1, 0]: {}", reshaped.get([1, 1, 0]).unwrap());

    // ========== APLICAÇÕES EM PROCESSAMENTO DE IMAGENS ==========
    println!("\n--- Processamento de Imagens (Tensor 4D) ---");

    // Simula um batch de imagens: (batch=2, canais=3, altura=4, largura=4)
    let mut images = Tensor4D::from_images(2, 3, 4, 4);

    // Preenche com padrão
    for b in 0..2 {
        for c in 0..3 {
            for i in 0..4 {
                for j in 0..4 {
                    let value = ((b * 48 + c * 16 + i * 4 + j) % 256) as f64 / 255.0;
                    images.set([b, c, i, j], value).unwrap();
                }
            }
        }
    }

    println!("Batch de imagens: {:?}", images.shape());

    // Max pooling
    let pooled = images.max_pool_2d(2, 2).unwrap();
    println!("Após max pooling 2×2: {:?}", pooled.shape());

    // Average pooling
    let avg_pooled = images.avg_pool_2d(2, 2).unwrap();
    println!("Após average pooling 2×2: {:?}", avg_pooled.shape());

    // Ativações
    let with_relu = images.relu();
    println!("Após ReLU: mantém forma {:?}", with_relu.shape());

    let with_sigmoid = images.sigmoid();
    println!("Após Sigmoid: mantém forma {:?}", with_sigmoid.shape());

    // Batch normalization
    let normalized = images.batch_normalize(1e-5);
    println!("Após batch normalization: média ≈ {:.6}", normalized.mean());

    // ========== CONVOLUÇÃO 3D ==========
    println!("\n--- Convolução 3D ---");
    let input_3d = Tensor3D::new(5, 5, 5);
    let kernel_3d = Tensor3D::filled([3, 3, 3], 1.0 / 27.0); // kernel de média

    let convolved = input_3d.convolve_3d(&kernel_3d).unwrap();
    println!(
        "Convolução 3D: entrada {:?} → saída {:?}",
        input_3d.shape(),
        convolved.shape()
    );

    // ========== REDIMENSIONAMENTO DE IMAGEM ==========
    println!("\n--- Redimensionamento de Imagem ---");
    let mut small_img = Tensor3D::new(3, 4, 4); // 3 canais, 4×4
    for c in 0..3 {
        for i in 0..4 {
            for j in 0..4 {
                small_img.set([c, i, j], (i * 4 + j) as f64).unwrap();
            }
        }
    }

    let resized = image_ops::resize_nearest(&small_img, 8, 8);
    println!(
        "Imagem {:?} redimensionada para {:?}",
        small_img.shape(),
        resized.shape()
    );

    // ========== ESTATÍSTICAS ==========
    println!("\n--- Estatísticas de Tensores ---");
    let stats_tensor: Tensor<3> =
        Tensor::from_data([2, 2, 2], vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]).unwrap();

    println!("Tensor [2, 2, 2]:");
    println!("  Soma: {}", stats_tensor.sum());
    println!("  Média: {:.4}", stats_tensor.mean());
    println!("  Norma de Frobenius: {:.4}", stats_tensor.frobenius_norm());

    println!("\n=== Fim dos Exemplos de Tensores ===");
}
