/// Exemplos de Geometria 4D com Projeções e Visualizações
///
/// Demonstra:
/// - Polítopos regulares 4D (Tesserato, 24-cell, Simplex)
/// - Rotações em planos 4D
/// - Projeções de 4D → 3D → 2D (ASCII art)
/// - Cinemática de corpos rígidos em 4D
use std::f64::consts::PI;

// Import do módulo geometry4d from avila-math
// TODO: Fix this import path
use avila_math::geometry::*;
// #[path = "../geometry4d.rs"]
// mod geometry4d;
// use geometry4d::*;

fn main() {
    println!("═══════════════════════════════════════════════════════");
    println!("    GEOMETRIA 4D - Espaço Euclidiano Tetradimensional");
    println!("═══════════════════════════════════════════════════════\n");

    // Exemplo 1: Álgebra Linear 4D
    algebra_linear_4d();

    // Exemplo 2: Tesserato (Hipercubo)
    tesserato_example();

    // Exemplo 3: 24-Cell
    cell_24_example();

    // Exemplo 4: Rotações em 4D
    rotacoes_4d_example();

    // Exemplo 5: Projeções
    projecoes_example();

    // Exemplo 6: Visualização ASCII
    visualizacao_ascii();

    // Exemplo 7: Animação de rotação
    animacao_rotacao();

    // Exemplo 8: Cinemática 4D
    cinematica_4d_example();
}

fn algebra_linear_4d() {
    println!("┌─────────────────────────────────────────────────┐");
    println!("│  1. ÁLGEBRA LINEAR EM ℝ⁴                       │");
    println!("└─────────────────────────────────────────────────┘\n");

    let p1 = Point4D::new(1.0, 2.0, 3.0, 4.0);
    let p2 = Point4D::new(2.0, 1.0, 4.0, 3.0);

    println!("Pontos em ℝ⁴:");
    println!(
        "  p₁ = ({:.1}, {:.1}, {:.1}, {:.1})",
        p1.x, p1.y, p1.z, p1.w
    );
    println!(
        "  p₂ = ({:.1}, {:.1}, {:.1}, {:.1})",
        p2.x, p2.y, p2.z, p2.w
    );

    let dist = p1.distance(&p2);
    println!("\nDistância euclidiana 4D:");
    println!("  d(p₁, p₂) = {:.4}", dist);

    let dot = p1.dot(&p2);
    println!("\nProduto escalar:");
    println!("  p₁ · p₂ = {:.1}", dot);

    let sum = p1.add(&p2);
    println!("\nSoma vetorial:");
    println!(
        "  p₁ + p₂ = ({:.1}, {:.1}, {:.1}, {:.1})",
        sum.x, sum.y, sum.z, sum.w
    );

    let scaled = p1.scale(2.5);
    println!("\nMultiplicação por escalar:");
    println!(
        "  2.5 × p₁ = ({:.1}, {:.1}, {:.1}, {:.1})",
        scaled.x, scaled.y, scaled.z, scaled.w
    );

    println!();
}

fn tesserato_example() {
    println!("┌─────────────────────────────────────────────────┐");
    println!("│  2. TESSERATO (Hipercubo 4D)                   │");
    println!("└─────────────────────────────────────────────────┘\n");

    let tesseract = Tesseract::new();
    let stats = tesseract.stats();

    println!("Estrutura do Tesserato:");
    println!("  • Vértices:       {} (2⁴)", stats.vertices);
    println!("  • Arestas:        {} ", stats.edges);
    println!("  • Faces (2D):     {} quadrados", stats.faces);
    println!("  • Células (3D):   {} cubos", stats.cells);

    println!("\nComparação com dimensões inferiores:");
    println!("  Dimensão  | Nome        | Vértices | Arestas | Faces | Células");
    println!("  ──────────┼─────────────┼──────────┼─────────┼───────┼────────");
    println!("     0      | Ponto       |    1     |    0    |   0   |    0");
    println!("     1      | Segmento    |    2     |    1    |   0   |    0");
    println!("     2      | Quadrado    |    4     |    4    |   1   |    0");
    println!("     3      | Cubo        |    8     |   12    |   6   |    1");
    println!("     4      | Tesserato   |   16     |   32    |  24   |    8");

    println!("\nFórmula de Euler generalizada para 4D:");
    println!("  V - E + F - C = 0");
    println!(
        "  {} - {} + {} - {} = 0 ✓",
        stats.vertices, stats.edges, stats.faces, stats.cells
    );

    // Mostra alguns vértices
    println!("\nPrimeiros 4 vértices:");
    for (i, v) in tesseract.vertices.iter().take(4).enumerate() {
        println!(
            "  v[{}] = ({:+.0}, {:+.0}, {:+.0}, {:+.0})",
            i, v.x, v.y, v.z, v.w
        );
    }

    println!();
}

fn cell_24_example() {
    println!("┌─────────────────────────────────────────────────┐");
    println!("│  3. 24-CELL (Politopo Regular Autodual)        │");
    println!("└─────────────────────────────────────────────────┘\n");

    let cell = Cell24::new();

    println!("Estrutura do 24-Cell:");
    println!("  • Vértices:       {}", cell.vertices.len());
    println!("  • Arestas:        {}", cell.edges.len());
    println!("  • Faces:          24 octaedros");
    println!("  • Propriedade:    Autodual (dual de si mesmo!)");

    println!("\nCaracterísticas únicas:");
    println!("  • Não tem análogo em 3D");
    println!("  • Vértices equidistantes formando 4 círculos");
    println!("  • Cada vértice conectado a 8 outros");
    println!("  • Simetria excepcional: grupo F₄");

    // Verifica propriedades
    println!("\nVerificação de propriedades:");
    let v0 = &cell.vertices[0];
    println!("  Distância do vértice 0 à origem: {:.4}", v0.norm());

    // Conta conexões do primeiro vértice
    let connections = cell
        .edges
        .iter()
        .filter(|(i, j)| *i == 0 || *j == 0)
        .count();
    println!("  Conexões do vértice 0: {}", connections);

    println!();
}

fn rotacoes_4d_example() {
    println!("┌─────────────────────────────────────────────────┐");
    println!("│  4. ROTAÇÕES EM 4D (6 planos independentes)    │");
    println!("└─────────────────────────────────────────────────┘\n");

    let p = Point4D::new(1.0, 0.0, 0.0, 0.0);
    println!(
        "Ponto inicial: ({:.1}, {:.1}, {:.1}, {:.1})\n",
        p.x, p.y, p.z, p.w
    );

    // Rotação no plano XY (comum em 3D)
    let rot_xy = Matrix4x4::rotation_xy(PI / 2.0);
    let p_xy = rot_xy.transform(&p);
    println!("Após rotação 90° no plano XY:");
    println!(
        "  ({:.3}, {:.3}, {:.3}, {:.3})",
        p_xy.x, p_xy.y, p_xy.z, p_xy.w
    );
    println!("  → X rotacionou para Y\n");

    // Rotação no plano XW (específica de 4D!)
    let rot_xw = Matrix4x4::rotation_xw(PI / 2.0);
    let p_xw = rot_xw.transform(&p);
    println!("Após rotação 90° no plano XW:");
    println!(
        "  ({:.3}, {:.3}, {:.3}, {:.3})",
        p_xw.x, p_xw.y, p_xw.z, p_xw.w
    );
    println!("  → X rotacionou para W (4D puro!)\n");

    // Rotação no plano ZW (outra específica de 4D)
    let rot_zw = Matrix4x4::rotation_zw(PI / 4.0);
    let p2 = Point4D::new(0.0, 0.0, 1.0, 1.0);
    let p_zw = rot_zw.transform(&p2);
    println!("Ponto (0, 0, 1, 1) após rotação 45° no plano ZW:");
    println!(
        "  ({:.3}, {:.3}, {:.3}, {:.3})",
        p_zw.x, p_zw.y, p_zw.z, p_zw.w
    );

    println!("\nPlanos de rotação em 4D:");
    println!("  XY, XZ, XW  ← 3 planos envolvendo X");
    println!("  YZ, YW      ← 2 planos envolvendo Y (sem X)");
    println!("  ZW          ← 1 plano (sem X, Y)");
    println!("  Total: 6 planos = C(4,2) = 4!/(2!×2!)");

    println!();
}

fn projecoes_example() {
    println!("┌─────────────────────────────────────────────────┐");
    println!("│  5. PROJEÇÕES DE 4D PARA 3D                     │");
    println!("└─────────────────────────────────────────────────┘\n");

    let p4d = Point4D::new(1.0, 2.0, 3.0, 2.0);
    println!(
        "Ponto 4D: ({:.1}, {:.1}, {:.1}, {:.1})\n",
        p4d.x, p4d.y, p4d.z, p4d.w
    );

    // Projeção ortográfica
    let proj = Projection4Dto3D::new(5.0);
    let (x_ortho, y_ortho, z_ortho) = proj.project_orthographic(&p4d);
    println!("1. Projeção Ortográfica (descarta W):");
    println!("   ({:.1}, {:.1}, {:.1})", x_ortho, y_ortho, z_ortho);
    println!("   → Simples mas perde informação espacial\n");

    // Projeção perspectiva
    let (x_persp, y_persp, z_persp) = proj.project(&p4d);
    println!("2. Projeção Perspectiva (distância do observador = 5):");
    println!("   ({:.3}, {:.3}, {:.3})", x_persp, y_persp, z_persp);
    println!("   → Objetos mais próximos (W maior) aparecem maiores\n");

    // Projeção estereográfica
    let p_sphere = Point4D::new(0.5, 0.5, 0.5, 0.5);
    let (x_stereo, y_stereo, z_stereo) = proj.project_stereographic(&p_sphere);
    println!("3. Projeção Estereográfica (da hiperesfera):");
    println!(
        "   Ponto (0.5, 0.5, 0.5, 0.5) → ({:.3}, {:.3}, {:.3})",
        x_stereo, y_stereo, z_stereo
    );
    println!("   → Preserva ângulos, usado em cosmologia\n");

    println!("Comparação das projeções:");
    println!("  Tipo            | Preserva      | Uso Principal");
    println!("  ────────────────┼───────────────┼─────────────────────");
    println!("  Ortográfica     | Paralelas     | Engenharia, CAD");
    println!("  Perspectiva     | Aparência     | Visualização, games");
    println!("  Estereográfica  | Ângulos       | Física, topologia");

    println!();
}

fn visualizacao_ascii() {
    println!("┌─────────────────────────────────────────────────┐");
    println!("│  6. VISUALIZAÇÃO ASCII - Tesserato Projetado   │");
    println!("└─────────────────────────────────────────────────┘\n");

    let mut tesseract = Tesseract::new();

    // Escala para visualização
    let scale_matrix = Matrix4x4::scale(0.8);
    tesseract.transform(&scale_matrix);

    // Rotaciona um pouco para melhor visualização
    let rot_xy = Matrix4x4::rotation_xy(PI / 6.0);
    let rot_zw = Matrix4x4::rotation_zw(PI / 8.0);
    let combined = rot_xy.multiply(&rot_zw);
    tesseract.transform(&combined);

    // Projeta para 3D
    let proj = Projection4Dto3D::new(4.0);
    let vertices_3d: Vec<(f64, f64, f64)> =
        tesseract.vertices.iter().map(|v| proj.project(v)).collect();

    // Renderiza
    let renderer = AsciiRenderer3D::new(60, 25, 8.0);
    let lines = renderer.render_edges(&vertices_3d, &tesseract.edges);

    println!("Tesserato rotacionado (projeção 4D → 3D → 2D):\n");
    for line in lines {
        println!("{}", line);
    }

    println!("\n  ● = vértice    · = aresta");
    println!("\n  Legenda: Esta é uma 'sombra' 2D de um objeto 4D!");
    println!();
}

fn animacao_rotacao() {
    println!("┌─────────────────────────────────────────────────┐");
    println!("│  7. ANIMAÇÃO - Rotação Dupla em 4D             │");
    println!("└─────────────────────────────────────────────────┘\n");

    println!("Simulando 4 frames de rotação simultânea XY+ZW:\n");

    for frame in 0..4 {
        let angle = (frame as f64) * PI / 8.0;

        let mut cube = Tesseract::new();
        let scale = Matrix4x4::scale(0.6);
        cube.transform(&scale);

        // Rotação dupla: XY e ZW simultaneamente
        let rot_xy = Matrix4x4::rotation_xy(angle);
        let rot_zw = Matrix4x4::rotation_zw(angle * 1.5);
        let combined = rot_xy.multiply(&rot_zw);
        cube.transform(&combined);

        // Projeta
        let proj = Projection4Dto3D::new(3.5);
        let vertices_3d: Vec<(f64, f64, f64)> =
            cube.vertices.iter().map(|v| proj.project(v)).collect();

        let renderer = AsciiRenderer3D::new(50, 15, 6.0);
        let lines = renderer.render_edges(&vertices_3d, &cube.edges);

        println!("Frame {} (ângulo = {:.1}°):", frame + 1, angle.to_degrees());
        for line in lines {
            println!("  {}", line);
        }
        println!();
    }

    println!("Nota: Em 4D, podemos ter rotações simultâneas em planos");
    println!("      ortogonais que não interferem entre si!\n");
}

fn cinematica_4d_example() {
    println!("┌─────────────────────────────────────────────────┐");
    println!("│  8. CINEMÁTICA 4D - Corpo Rígido               │");
    println!("└─────────────────────────────────────────────────┘\n");

    let mut body = RigidBody4D::new(Point4D::new(0.0, 0.0, 0.0, 0.0));

    // Define condições iniciais
    body.velocity = Vector4D::new(1.0, 0.5, 0.2, 0.3);
    body.acceleration = Vector4D::new(0.0, -0.1, 0.0, 0.05);
    body.angular_velocity = 0.5;

    println!("Estado inicial do corpo rígido:");
    println!(
        "  Posição:      ({:.1}, {:.1}, {:.1}, {:.1})",
        body.position.x, body.position.y, body.position.z, body.position.w
    );
    println!(
        "  Velocidade:   ({:.1}, {:.1}, {:.1}, {:.1})",
        body.velocity.x, body.velocity.y, body.velocity.z, body.velocity.w
    );
    println!(
        "  Aceleração:   ({:.2}, {:.2}, {:.2}, {:.2})",
        body.acceleration.x, body.acceleration.y, body.acceleration.z, body.acceleration.w
    );
    println!("  Vel. Angular: {:.2} rad/s\n", body.angular_velocity);

    println!("Simulação (Δt = 0.1s):\n");
    println!("  Tempo | Posição 4D                           | Velocidade");
    println!("  ──────┼──────────────────────────────────────┼───────────");

    let dt = 0.1;
    for step in 0..6 {
        let time = step as f64 * dt;
        println!(
            "  {:.1}s  | ({:+.2}, {:+.2}, {:+.2}, {:+.2}) | {:.3}",
            time,
            body.position.x,
            body.position.y,
            body.position.z,
            body.position.w,
            body.velocity.norm()
        );

        body.update(dt);
    }

    println!("\nObservações:");
    println!("  • Movimento em 4 dimensões independentes");
    println!("  • Rotação adiciona complexidade espacial");
    println!("  • Útil para simulações físicas avançadas");

    println!();
}
