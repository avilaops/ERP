use arxis_quaternions::{DualQuat, Quat3D, SO4Rotation};
use std::f64::consts::PI;

fn main() {
    println!("=== Exemplos de Rotações com Quaternions ===\n");

    // ========== QUATERNIONS 3D ==========
    println!("--- Quaternions 3D (Rotações em 3D) ---");

    // Exemplo 1: Rotação simples em torno do eixo Z
    println!("\n1. Rotação de 90° em torno do eixo Z:");
    let axis_z = [0.0, 0.0, 1.0];
    let angle_90 = PI / 2.0;
    let q_z = Quat3D::from_axis_angle(axis_z, angle_90);

    let v1 = [1.0, 0.0, 0.0]; // vetor apontando para X
    let v1_rotated = q_z.rotate_vector(v1);
    println!(
        "  Vetor original: [{:.3}, {:.3}, {:.3}]",
        v1[0], v1[1], v1[2]
    );
    println!(
        "  Vetor rotacionado: [{:.3}, {:.3}, {:.3}]",
        v1_rotated[0], v1_rotated[1], v1_rotated[2]
    );
    println!("  (X → Y após rotação de 90° em Z)");

    // Exemplo 2: Composição de rotações
    println!("\n2. Composição de rotações (X + Y):");
    let q_x = Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 4.0);
    let q_y = Quat3D::from_axis_angle([0.0, 1.0, 0.0], PI / 3.0);
    let q_composed = q_x * q_y; // multiplicação de quaternions

    let v2 = [0.0, 0.0, 1.0];
    let v2_rotated = q_composed.rotate_vector(v2);
    println!(
        "  Vetor original: [{:.3}, {:.3}, {:.3}]",
        v2[0], v2[1], v2[2]
    );
    println!(
        "  Após composição: [{:.3}, {:.3}, {:.3}]",
        v2_rotated[0], v2_rotated[1], v2_rotated[2]
    );

    // Exemplo 3: Interpolação esférica (SLERP)
    println!("\n3. Interpolação esférica (SLERP):");
    let q_start = Quat3D::identity();
    let q_end = Quat3D::from_axis_angle([0.0, 1.0, 0.0], PI / 2.0);

    println!("  Interpolação de 0° a 90° em Y:");
    for i in 0..=4 {
        let t = i as f64 / 4.0;
        let q_interp = q_start.slerp(&q_end, t);
        let v_interp = q_interp.rotate_vector([1.0, 0.0, 0.0]);
        println!(
            "    t={:.2}: [{:.3}, {:.3}, {:.3}]",
            t, v_interp[0], v_interp[1], v_interp[2]
        );
    }

    // Exemplo 4: Conversão para matriz de rotação
    println!("\n4. Matriz de rotação 3x3:");
    let q_matrix = Quat3D::from_axis_angle([0.0, 0.0, 1.0], PI / 4.0);
    let matrix = q_matrix.to_rotation_matrix();
    println!("  Quaternion para rotação de 45° em Z:");
    for row in &matrix {
        println!("    [{:7.3}, {:7.3}, {:7.3}]", row[0], row[1], row[2]);
    }

    // ========== DUAL QUATERNIONS ==========
    println!("\n\n--- Dual Quaternions (Rotações + Translações) ---");

    // Exemplo 5: Translação pura
    println!("\n5. Translação pura:");
    let translation = [2.0, 3.0, 1.0];
    let dq_trans = DualQuat::from_translation(translation);
    let point = [1.0, 1.0, 1.0];
    let point_translated = dq_trans.transform_point(point);
    println!(
        "  Ponto original: [{:.3}, {:.3}, {:.3}]",
        point[0], point[1], point[2]
    );
    println!(
        "  Ponto transladado: [{:.3}, {:.3}, {:.3}]",
        point_translated[0], point_translated[1], point_translated[2]
    );

    // Exemplo 6: Rotação + Translação
    println!("\n6. Rotação + Translação combinadas:");
    let rotation = Quat3D::from_axis_angle([0.0, 0.0, 1.0], PI / 2.0);
    let translation = [5.0, 0.0, 0.0];
    let dq_combined = DualQuat::from_rotation_translation(rotation, translation);

    let point2 = [1.0, 0.0, 0.0];
    let point2_transformed = dq_combined.transform_point(point2);
    println!(
        "  Ponto original: [{:.3}, {:.3}, {:.3}]",
        point2[0], point2[1], point2[2]
    );
    println!(
        "  Após rotação 90°Z + translação X: [{:.3}, {:.3}, {:.3}]",
        point2_transformed[0], point2_transformed[1], point2_transformed[2]
    );

    // Exemplo 7: Composição de dual quaternions
    println!("\n7. Composição de transformações:");
    let dq1 = DualQuat::from_rotation(Quat3D::from_axis_angle([0.0, 0.0, 1.0], PI / 4.0));
    let dq2 = DualQuat::from_translation([1.0, 1.0, 0.0]);
    let dq_composed = dq1 * dq2;

    let point3 = [1.0, 0.0, 0.0];
    let point3_result = dq_composed.transform_point(point3);
    println!(
        "  Ponto original: [{:.3}, {:.3}, {:.3}]",
        point3[0], point3[1], point3[2]
    );
    println!(
        "  Após composição: [{:.3}, {:.3}, {:.3}]",
        point3_result[0], point3_result[1], point3_result[2]
    );

    // ========== SO(4) ROTAÇÕES 4D ==========
    println!("\n\n--- SO(4) - Rotações em 4D (S³ × S³) ---");

    // Exemplo 8: Rotação 4D com left e right
    println!("\n8. Rotação 4D usando q1 * v * q2*:");
    let q_left = Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 6.0);
    let q_right = Quat3D::from_axis_angle([0.0, 1.0, 0.0], PI / 4.0);
    let so4 = SO4Rotation::new(q_left, q_right);

    let v4 = [1.0, 0.0, 0.0, 0.0];
    let v4_rotated = so4.rotate_vector_4d(v4);
    println!(
        "  Vetor 4D original: [{:.3}, {:.3}, {:.3}, {:.3}]",
        v4[0], v4[1], v4[2], v4[3]
    );
    println!(
        "  Vetor rotacionado: [{:.3}, {:.3}, {:.3}, {:.3}]",
        v4_rotated[0], v4_rotated[1], v4_rotated[2], v4_rotated[3]
    );

    // Verifica preservação de norma
    let norm_before = (v4[0] * v4[0] + v4[1] * v4[1] + v4[2] * v4[2] + v4[3] * v4[3]).sqrt();
    let norm_after = (v4_rotated[0] * v4_rotated[0]
        + v4_rotated[1] * v4_rotated[1]
        + v4_rotated[2] * v4_rotated[2]
        + v4_rotated[3] * v4_rotated[3])
        .sqrt();
    println!(
        "  Norma antes: {:.6}, depois: {:.6}",
        norm_before, norm_after
    );

    // Exemplo 9: Rotação apenas left
    println!("\n9. Rotação SO(4) apenas com componente LEFT:");
    let so4_left_only = SO4Rotation::from_left(Quat3D::from_axis_angle([0.0, 0.0, 1.0], PI / 3.0));
    let v5 = [1.0, 1.0, 0.0, 0.0];
    let v5_rotated = so4_left_only.rotate_vector_4d(v5);
    println!(
        "  Vetor 4D: [{:.3}, {:.3}, {:.3}, {:.3}]",
        v5[0], v5[1], v5[2], v5[3]
    );
    println!(
        "  Rotacionado (left): [{:.3}, {:.3}, {:.3}, {:.3}]",
        v5_rotated[0], v5_rotated[1], v5_rotated[2], v5_rotated[3]
    );

    // Exemplo 10: Rotação apenas right
    println!("\n10. Rotação SO(4) apenas com componente RIGHT:");
    let so4_right_only =
        SO4Rotation::from_right(Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 4.0));
    let v6 = [0.0, 1.0, 1.0, 0.0];
    let v6_rotated = so4_right_only.rotate_vector_4d(v6);
    println!(
        "  Vetor 4D: [{:.3}, {:.3}, {:.3}, {:.3}]",
        v6[0], v6[1], v6[2], v6[3]
    );
    println!(
        "  Rotacionado (right): [{:.3}, {:.3}, {:.3}, {:.3}]",
        v6_rotated[0], v6_rotated[1], v6_rotated[2], v6_rotated[3]
    );

    // Exemplo 11: Composição de rotações SO(4)
    println!("\n11. Composição de rotações SO(4):");
    let so4_a = SO4Rotation::new(
        Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 6.0),
        Quat3D::from_axis_angle([0.0, 1.0, 0.0], PI / 8.0),
    );
    let so4_b = SO4Rotation::new(
        Quat3D::from_axis_angle([0.0, 0.0, 1.0], PI / 4.0),
        Quat3D::from_axis_angle([1.0, 1.0, 0.0], PI / 12.0),
    );
    let so4_composed = so4_a.compose(&so4_b);

    let v7 = [1.0, 0.0, 0.0, 0.0];
    let v7_result = so4_composed.rotate_vector_4d(v7);
    println!(
        "  Vetor original: [{:.3}, {:.3}, {:.3}, {:.3}]",
        v7[0], v7[1], v7[2], v7[3]
    );
    println!(
        "  Após composição: [{:.3}, {:.3}, {:.3}, {:.3}]",
        v7_result[0], v7_result[1], v7_result[2], v7_result[3]
    );

    // Exemplo 12: Matriz de rotação 4x4
    println!("\n12. Matriz de rotação 4x4 do SO(4):");
    let so4_matrix = SO4Rotation::new(
        Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 6.0),
        Quat3D::from_axis_angle([0.0, 1.0, 0.0], PI / 4.0),
    );
    let matrix4 = so4_matrix.to_rotation_matrix_4x4();
    println!("  Matriz 4x4:");
    for row in &matrix4 {
        println!(
            "    [{:7.3}, {:7.3}, {:7.3}, {:7.3}]",
            row[0], row[1], row[2], row[3]
        );
    }

    // Exemplo 13: Decomposição isoclínica
    println!("\n13. Decomposição isoclínica (S³ × S³):");
    let so4_decomp = SO4Rotation::new(
        Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 3.0),
        Quat3D::from_axis_angle([0.0, 1.0, 0.0], PI / 5.0),
    );
    let (left, right) = so4_decomp.decompose_isoclinic();
    println!(
        "  Left quaternion: w={:.3}, x={:.3}, y={:.3}, z={:.3}",
        left.w, left.x, left.y, left.z
    );
    println!(
        "  Right quaternion: w={:.3}, x={:.3}, y={:.3}, z={:.3}",
        right.w, right.x, right.y, right.z
    );

    // ========== APLICAÇÃO PRÁTICA ==========
    println!("\n\n--- Aplicação: Rotação de um cubo 4D ---");

    println!("\n14. Rotando vértices de um tesseract (hipercubo 4D):");
    let vertices_4d = [
        [1.0, 1.0, 1.0, 1.0],
        [-1.0, 1.0, 1.0, 1.0],
        [1.0, -1.0, 1.0, 1.0],
        [1.0, 1.0, -1.0, 1.0],
    ];

    let so4_tesseract = SO4Rotation::new(
        Quat3D::from_axis_angle([0.0, 0.0, 1.0], PI / 8.0),
        Quat3D::from_axis_angle([1.0, 1.0, 0.0], PI / 12.0),
    );

    println!("  Primeiros 4 vértices do tesseract rotacionados:");
    for (i, vertex) in vertices_4d.iter().enumerate() {
        let rotated = so4_tesseract.rotate_vector_4d(*vertex);
        println!(
            "    v{}: [{:6.3}, {:6.3}, {:6.3}, {:6.3}] → [{:6.3}, {:6.3}, {:6.3}, {:6.3}]",
            i,
            vertex[0],
            vertex[1],
            vertex[2],
            vertex[3],
            rotated[0],
            rotated[1],
            rotated[2],
            rotated[3]
        );
    }

    println!("\n=== Fim dos Exemplos ===");
}
