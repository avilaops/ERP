/// Big Data + Machine Learning Example for Arxis
/// Demonstra processamento de grandes volumes de dados 3D/4D com ML
use ndarray::{Array1, Array2};
use polars::prelude::*;
use rayon::prelude::*;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 Arxis - Big Data & ML Example\n");

    // 1. Big Data: Processar grandes datasets com Polars
    big_data_processing()?;

    // 2. Machine Learning: Clustering de dados 4D
    ml_clustering_4d()?;

    // 3. Parallel Processing: Análise de tensores em paralelo
    parallel_tensor_analysis()?;

    Ok(())
}

/// Processar grandes volumes de dados com Polars (Apache Arrow)
fn big_data_processing() -> Result<(), Box<dyn std::error::Error>> {
    println!("📊 Big Data Processing com Polars\n");

    // Criar DataFrame com dados sintéticos de ondas gravitacionais
    let n_samples = 1_000_000;
    let timestamps: Vec<f64> = (0..n_samples).map(|i| i as f64 * 0.001).collect();
    let strain_h: Vec<f64> = timestamps
        .iter()
        .map(|&t| {
            // Simular sinal GW com ruído
            let signal = (2.0 * std::f64::consts::PI * 100.0 * t).sin() * 1e-21;
            let noise = rand::random::<f64>() * 1e-23;
            signal + noise
        })
        .collect();

    let df = df! {
        "time" => timestamps,
        "strain" => strain_h,
    }?;

    println!("✅ Dataset criado: {} linhas", df.height());
    println!("📈 Primeiras 5 linhas:\n{}\n", df.head(Some(5)));

    // Lazy evaluation para query eficiente
    let result = df
        .lazy()
        .filter(col("strain").abs().gt(lit(5e-22))) // Detectar eventos
        .select([
            col("time"),
            col("strain"),
            col("strain").abs().alias("abs_strain"),
        ])
        .collect()?;

    println!(
        "🔍 Eventos detectados: {} (strain > 5e-22)",
        result.height()
    );

    Ok(())
}

/// Machine Learning: Clustering K-means em dados 4D
fn ml_clustering_4d() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n🤖 Machine Learning: K-Means Clustering 4D\n");

    // Gerar dados 4D sintéticos (ex: posição + tempo em espaço-tempo)
    let n_points = 1000;
    let mut data = Vec::new();

    for _ in 0..n_points {
        let x = rand::random::<f64>() * 10.0;
        let y = rand::random::<f64>() * 10.0;
        let z = rand::random::<f64>() * 10.0;
        let t = rand::random::<f64>() * 10.0;
        data.push(vec![x, y, z, t]);
    }

    // Converter para ndarray
    let flat_data: Vec<f64> = data.iter().flat_map(|v| v.iter().copied()).collect();
    let data_matrix = Array2::from_shape_vec((n_points, 4), flat_data)?;

    println!("✅ Matriz de dados 4D criada: {:?}", data_matrix.dim());

    // Implementação simples de K-means (3 clusters)
    let n_clusters = 3;
    println!("🎯 Executando K-Means com {} clusters...", n_clusters);

    // Inicializar centroides aleatórios
    let mut centroids = Array2::<f64>::zeros((n_clusters, 4));
    for i in 0..n_clusters {
        for j in 0..4 {
            centroids[[i, j]] = rand::random::<f64>() * 10.0;
        }
    }

    // Iterações de K-means (simplificado)
    for iteration in 0..10 {
        // Atribuir pontos aos clusters mais próximos
        let mut cluster_assignments = vec![0; n_points];

        for (idx, point) in data_matrix.rows().into_iter().enumerate() {
            let mut min_dist = f64::MAX;
            let mut best_cluster = 0;

            for (c_idx, centroid) in centroids.rows().into_iter().enumerate() {
                let dist: f64 = point
                    .iter()
                    .zip(centroid.iter())
                    .map(|(a, b)| (a - b).powi(2))
                    .sum::<f64>()
                    .sqrt();

                if dist < min_dist {
                    min_dist = dist;
                    best_cluster = c_idx;
                }
            }
            cluster_assignments[idx] = best_cluster;
        }

        // Atualizar centroides
        for c_idx in 0..n_clusters {
            let cluster_points: Vec<_> = cluster_assignments
                .iter()
                .enumerate()
                .filter(|(_, &c)| c == c_idx)
                .map(|(i, _)| i)
                .collect();

            if !cluster_points.is_empty() {
                for dim in 0..4 {
                    let mean: f64 = cluster_points
                        .iter()
                        .map(|&i| data_matrix[[i, dim]])
                        .sum::<f64>()
                        / cluster_points.len() as f64;
                    centroids[[c_idx, dim]] = mean;
                }
            }
        }

        if iteration % 3 == 0 {
            println!("  Iteração {}: convergindo...", iteration + 1);
        }
    }

    println!("✅ K-Means concluído!");
    println!("📍 Centroides finais:");
    for (i, centroid) in centroids.rows().into_iter().enumerate() {
        println!(
            "  Cluster {}: [{:.2}, {:.2}, {:.2}, {:.2}]",
            i, centroid[0], centroid[1], centroid[2], centroid[3]
        );
    }

    Ok(())
}

/// Processamento paralelo de tensores com Rayon
fn parallel_tensor_analysis() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n⚡ Processamento Paralelo de Tensores\n");

    // Gerar 10,000 tensores 4x4 (métrica espaço-tempo)
    let n_tensors = 10_000;
    println!("🔢 Gerando {} tensores 4x4...", n_tensors);

    let tensors: Vec<Array2<f64>> = (0..n_tensors)
        .into_par_iter() // Paralelizar com Rayon
        .map(|_| {
            let mut tensor = Array2::<f64>::zeros((4, 4));
            // Métrica de Minkowski com perturbação
            tensor[[0, 0]] = -1.0 + rand::random::<f64>() * 0.01;
            tensor[[1, 1]] = 1.0 + rand::random::<f64>() * 0.01;
            tensor[[2, 2]] = 1.0 + rand::random::<f64>() * 0.01;
            tensor[[3, 3]] = 1.0 + rand::random::<f64>() * 0.01;
            tensor
        })
        .collect();

    println!("✅ Tensores gerados!");

    // Calcular determinante de todos os tensores em paralelo
    println!("📐 Calculando determinantes em paralelo...");
    let determinants: Vec<f64> = tensors
        .par_iter()
        .map(|tensor| {
            // Determinante simplificado (diagonal apenas)
            tensor[[0, 0]] * tensor[[1, 1]] * tensor[[2, 2]] * tensor[[3, 3]]
        })
        .collect();

    let mean_det = determinants.iter().sum::<f64>() / determinants.len() as f64;
    let std_det = (determinants
        .iter()
        .map(|d| (d - mean_det).powi(2))
        .sum::<f64>()
        / determinants.len() as f64)
        .sqrt();

    println!("📊 Estatísticas dos determinantes:");
    println!("   Média: {:.6}", mean_det);
    println!("   Desvio padrão: {:.6}", std_det);
    println!(
        "   Min: {:.6}",
        determinants.iter().cloned().fold(f64::INFINITY, f64::min)
    );
    println!(
        "   Max: {:.6}",
        determinants
            .iter()
            .cloned()
            .fold(f64::NEG_INFINITY, f64::max)
    );

    Ok(())
}
