//! Geometria 4D Avançada com avila-math
//!
//! Tesseracts, rotações 4D, projeções

use avila_math::geometry::{
    Quat3D, Point4D, Matrix4x4, Tesseract, Projection4Dto3D
};

fn main() {
    println!("🔷 Geometria 4D Avançada com avila-math\n");

    // 1. Quaternions - Rotação 3D
    println!("1️⃣  Quaternions (SO(3))");

    let axis = [0.0, 0.0, 1.0]; // eixo Z
    let angle = std::f64::consts::PI / 4.0; // 45°
    let q = Quat3D::from_axis_angle(axis, angle);

    println!("   Rotação: 45° em torno de Z");
    println!("   Quaternion: [{:.3}, {:.3}i, {:.3}j, {:.3}k]",
        q.w, q.x, q.y, q.z);

    // Rotar ponto (1, 0, 0)
    let point = [1.0, 0.0, 0.0];
    let rotated = q.rotate_vector(point);
    println!("   (1,0,0) → ({:.3}, {:.3}, {:.3})",
        rotated[0], rotated[1], rotated[2]);
    println!("   ✅ Ponto rotado 45° (esperado: ~0.707, ~0.707, 0)");
    println!();

    // 2. Tesseract (Hipercubo 4D)
    println!("2️⃣  Tesseract (Hipercubo 4D)");

    let tesseract = Tesseract::new();
    println!("   Tesseract gerado");

    let vertices = &tesseract.vertices;
    println!("✅ {} vértices", vertices.len());
    println!("   Exemplos:");
    for (i, v) in vertices.iter().take(4).enumerate() {
        println!("     v{}: [{:.1}, {:.1}, {:.1}, {:.1}]",
            i, v.x, v.y, v.z, v.w);
    }
    println!("   {} arestas", tesseract.edges.len());
    println!("   {} faces", tesseract.faces.len());
    println!("   {} células cúbicas", tesseract.cells.len());
    println!();

    // 3. Rotações 4D
    println!("3️⃣  Rotações em 4D");

    // Rotação no plano X-Y
    let rot_xy = Matrix4x4::rotation_xy(std::f64::consts::PI / 6.0); // 30°

    // Rotação no plano Z-W
    let rot_zw = Matrix4x4::rotation_zw(std::f64::consts::PI / 3.0); // 60°

    println!("   Rotação dupla:");
    println!("     Plano XY: 30°");
    println!("     Plano ZW: 60°");

    // Combinar rotações
    let combined = rot_xy.multiply(&rot_zw);

    // Rotar ponto 4D
    let point_4d = Point4D::new(1.0, 0.0, 0.0, 1.0);
    let rotated_4d = combined.transform(&point_4d);
    println!("   Ponto: ({:.1}, {:.1}, {:.1}, {:.1})",
        point_4d.x, point_4d.y, point_4d.z, point_4d.w);
    println!("   Rotado: ({:.3}, {:.3}, {:.3}, {:.3})",
        rotated_4d.x, rotated_4d.y, rotated_4d.z, rotated_4d.w);
    println!("   ✅ Rotação 4D aplicada");
    println!();

    // 4. Projeção 4D → 3D
    println!("4️⃣  Projeção 4D → 3D (Perspectiva)");

    let projection = Projection4Dto3D::new(2.0); // distância do observador
    println!("   Projetando tesseract para 3D...");
    println!("   Distância: 2.0");

    let projected_3d: Vec<(f64, f64, f64)> = vertices.iter()
        .map(|v| projection.project(v))
        .collect();

    println!("✅ {} pontos projetados", projected_3d.len());
    println!("   Exemplos (3D):");
    for (i, p) in projected_3d.iter().take(4).enumerate() {
        println!("     p{}: ({:.3}, {:.3}, {:.3})",
            i, p.0, p.1, p.2);
    }
    println!();

    // 5. Visualização Animada (ASCII art simplificado)
    println!("5️⃣  Animação Rotacional");

    for frame in 0..8 {
        let angle = (frame as f64 / 8.0) * 2.0 * std::f64::consts::PI;
        let rot = Matrix4x4::rotation_xy(angle);
        let rot2 = Matrix4x4::rotation_zw(angle * 0.7);
        let combined_rot = rot.multiply(&rot2);

        let rotated_verts: Vec<Point4D> = vertices.iter()
            .map(|v| combined_rot.transform(v))
            .collect();

        let projected: Vec<(f64, f64, f64)> = rotated_verts.iter()
            .map(|v| projection.project(v))
            .collect();

        // Encontrar bounds para normalização
        let (mut min_x, mut max_x) = (f64::MAX, f64::MIN);
        let (mut min_y, mut max_y) = (f64::MAX, f64::MIN);

        for p in &projected {
            min_x = min_x.min(p.0);
            max_x = max_x.max(p.0);
            min_y = min_y.min(p.1);
            max_y = max_y.max(p.1);
        }

        // Desenhar frame
        print!("   Frame {}: ", frame);

        // Indicador simples de rotação
        let phase = (angle / (2.0 * std::f64::consts::PI) * 8.0) as usize;
        let spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'];
        print!("{} ", spinner[phase % spinner.len()]);

        // Mostrar spread dos pontos projetados
        let spread = ((max_x - min_x).powi(2) + (max_y - min_y).powi(2)).sqrt();
        print!("spread={:.2}", spread);

        println!();
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    println!("   ✅ Animação completa (8 frames)");
    println!();

    // 6. Interpolação SLERP (Quaternions)
    println!("6️⃣  SLERP entre quaternions");

    let q_start = Quat3D::identity();
    let q_end = Quat3D::from_axis_angle([0.0, 1.0, 0.0], std::f64::consts::PI / 2.0);

    println!("   Interpolação: identidade → 90° (eixo Y)");
    for t in 0..=4 {
        let alpha = t as f64 / 4.0;
        let interpolated = q_start.slerp(&q_end, alpha);

        let test_point = [1.0, 0.0, 0.0];
        let result = interpolated.rotate_vector(test_point);

        println!("     t={:.2}: ({:.3}, {:.3}, {:.3})",
            alpha, result[0], result[1], result[2]);
    }
    println!("   ✅ Interpolação suave (SLERP)");
    println!();

    // 7. Projeções Ortográfica e Estereográfica
    println!("7️⃣  Tipos de Projeção");

    let test_point = Point4D::new(1.0, 1.0, 1.0, 0.5);

    let perspective = projection.project(&test_point);
    let orthographic = projection.project_orthographic(&test_point);
    let stereographic = projection.project_stereographic(&test_point);

    println!("   Ponto 4D: ({:.1}, {:.1}, {:.1}, {:.1})",
        test_point.x, test_point.y, test_point.z, test_point.w);
    println!("   Perspectiva: ({:.3}, {:.3}, {:.3})",
        perspective.0, perspective.1, perspective.2);
    println!("   Ortográfica: ({:.3}, {:.3}, {:.3})",
        orthographic.0, orthographic.1, orthographic.2);
    println!("   Estereográfica: ({:.3}, {:.3}, {:.3})",
        stereographic.0, stereographic.1, stereographic.2);
    println!("   ✅ Diferentes projeções");
    println!();

    println!("🎉 Geometria 4D completa!");
    println!("\n💡 Use cases:");
    println!("   • Robótica (quaternions)");
    println!("   • Gráficos 4D (tesseract)");
    println!("   • Relatividade (rotações 4D)");
    println!("   • Animação (SLERP)");
}
