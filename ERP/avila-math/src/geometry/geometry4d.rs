// use std::f64::consts::PI;

/// Ponto no espaço 4D: (x, y, z, w) ∈ ℝ⁴
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Point4D {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
}

impl Point4D {
    pub fn new(x: f64, y: f64, z: f64, w: f64) -> Self {
        Self { x, y, z, w }
    }

    pub fn origin() -> Self {
        Self::new(0.0, 0.0, 0.0, 0.0)
    }

    /// Distância euclidiana 4D
    pub fn distance(&self, other: &Self) -> f64 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        let dz = self.z - other.z;
        let dw = self.w - other.w;
        (dx * dx + dy * dy + dz * dz + dw * dw).sqrt()
    }

    /// Norma (distância da origem)
    pub fn norm(&self) -> f64 {
        (self.x * self.x + self.y * self.y + self.z * self.z + self.w * self.w).sqrt()
    }

    /// Adiciona outro ponto (álgebra vetorial)
    pub fn add(&self, other: &Self) -> Self {
        Self::new(
            self.x + other.x,
            self.y + other.y,
            self.z + other.z,
            self.w + other.w,
        )
    }

    /// Multiplica por escalar
    pub fn scale(&self, scalar: f64) -> Self {
        Self::new(
            self.x * scalar,
            self.y * scalar,
            self.z * scalar,
            self.w * scalar,
        )
    }

    /// Produto escalar 4D
    pub fn dot(&self, other: &Self) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z + self.w * other.w
    }
}

/// Vetor 4D (equivalente a Point4D mas com semântica diferente)
pub type Vector4D = Point4D;

/// Matriz de transformação 4×4
#[derive(Debug, Clone, Copy)]
pub struct Matrix4x4 {
    pub data: [[f64; 4]; 4],
}

impl Matrix4x4 {
    pub fn identity() -> Self {
        Self {
            data: [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ],
        }
    }

    pub fn zeros() -> Self {
        Self {
            data: [[0.0; 4]; 4],
        }
    }

    /// Multiplica matriz por ponto 4D
    pub fn transform(&self, point: &Point4D) -> Point4D {
        Point4D::new(
            self.data[0][0] * point.x
                + self.data[0][1] * point.y
                + self.data[0][2] * point.z
                + self.data[0][3] * point.w,
            self.data[1][0] * point.x
                + self.data[1][1] * point.y
                + self.data[1][2] * point.z
                + self.data[1][3] * point.w,
            self.data[2][0] * point.x
                + self.data[2][1] * point.y
                + self.data[2][2] * point.z
                + self.data[2][3] * point.w,
            self.data[3][0] * point.x
                + self.data[3][1] * point.y
                + self.data[3][2] * point.z
                + self.data[3][3] * point.w,
        )
    }

    /// Multiplica duas matrizes 4×4
    pub fn multiply(&self, other: &Self) -> Self {
        let mut result = Self::zeros();
        for i in 0..4 {
            for j in 0..4 {
                for k in 0..4 {
                    result.data[i][j] += self.data[i][k] * other.data[k][j];
                }
            }
        }
        result
    }

    /// Rotação no plano XY (mantém Z e W fixos)
    pub fn rotation_xy(angle: f64) -> Self {
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        Self {
            data: [
                [cos_a, -sin_a, 0.0, 0.0],
                [sin_a, cos_a, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ],
        }
    }

    /// Rotação no plano ZW (4D puro!)
    pub fn rotation_zw(angle: f64) -> Self {
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        Self {
            data: [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, cos_a, -sin_a],
                [0.0, 0.0, sin_a, cos_a],
            ],
        }
    }

    /// Rotação no plano XW
    pub fn rotation_xw(angle: f64) -> Self {
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        Self {
            data: [
                [cos_a, 0.0, 0.0, -sin_a],
                [0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0],
                [sin_a, 0.0, 0.0, cos_a],
            ],
        }
    }

    /// Rotação no plano YW
    pub fn rotation_yw(angle: f64) -> Self {
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        Self {
            data: [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, cos_a, 0.0, -sin_a],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, sin_a, 0.0, cos_a],
            ],
        }
    }

    /// Escala uniforme
    pub fn scale(factor: f64) -> Self {
        Self {
            data: [
                [factor, 0.0, 0.0, 0.0],
                [0.0, factor, 0.0, 0.0],
                [0.0, 0.0, factor, 0.0],
                [0.0, 0.0, 0.0, factor],
            ],
        }
    }

    /// Translação 4D
    pub fn translation(dx: f64, dy: f64, dz: f64, dw: f64) -> Self {
        Self {
            data: [
                [1.0, 0.0, 0.0, dx],
                [0.0, 1.0, 0.0, dy],
                [0.0, 0.0, 1.0, dz],
                [0.0, 0.0, 0.0, 1.0 + dw],
            ],
        }
    }
}

/// Projeção de 4D para 3D (projeção perspectiva)
pub struct Projection4Dto3D {
    /// Distância do observador na dimensão W
    pub viewer_distance: f64,
}

impl Projection4Dto3D {
    pub fn new(viewer_distance: f64) -> Self {
        Self { viewer_distance }
    }

    /// Projeção perspectiva de 4D para 3D
    /// Similar à projeção de 3D para 2D, mas uma dimensão acima
    pub fn project(&self, point: &Point4D) -> (f64, f64, f64) {
        let w_factor = 1.0 / (self.viewer_distance - point.w);
        (point.x * w_factor, point.y * w_factor, point.z * w_factor)
    }

    /// Projeção ortográfica (descarta a coordenada W)
    pub fn project_orthographic(&self, point: &Point4D) -> (f64, f64, f64) {
        (point.x, point.y, point.z)
    }

    /// Projeção estereográfica (da hiperesfera)
    pub fn project_stereographic(&self, point: &Point4D) -> (f64, f64, f64) {
        let denom = 1.0 - point.w;
        if denom.abs() < 1e-10 {
            // Polo norte mapeia para infinito
            return (point.x * 1000.0, point.y * 1000.0, point.z * 1000.0);
        }
        (point.x / denom, point.y / denom, point.z / denom)
    }
}

/// Hipercubo (Tesserato) - Análogo 4D do cubo
pub struct Tesseract {
    pub vertices: Vec<Point4D>,
    pub edges: Vec<(usize, usize)>,
    pub faces: Vec<Vec<usize>>, // Faces quadradas
    pub cells: Vec<Vec<usize>>, // Células cúbicas (8 cubos)
}

impl Default for Tesseract {
    fn default() -> Self {
        Self::new()
    }
}

impl Tesseract {
    /// Cria um tesserato centrado na origem com lado de comprimento 2
    pub fn new() -> Self {
        let mut vertices = Vec::new();

        // Gera 16 vértices: todas as combinações de ±1
        for i in 0..16 {
            let x = if i & 1 == 0 { -1.0 } else { 1.0 };
            let y = if i & 2 == 0 { -1.0 } else { 1.0 };
            let z = if i & 4 == 0 { -1.0 } else { 1.0 };
            let w = if i & 8 == 0 { -1.0 } else { 1.0 };
            vertices.push(Point4D::new(x, y, z, w));
        }

        // Gera 32 arestas
        let mut edges = Vec::new();
        for i in 0..16_usize {
            for j in (i + 1)..16_usize {
                // Conecta vértices que diferem em apenas uma coordenada
                let diff: u32 = (i as u32) ^ (j as u32);
                if diff.count_ones() == 1 {
                    edges.push((i, j));
                }
            }
        }

        // Gera faces quadradas (24 faces)
        let mut faces = Vec::new();
        // Cada face é determinada por fixar 2 coordenadas
        for fix_mask in 0..16_u32 {
            if fix_mask.count_ones() == 2 {
                let mut face = Vec::new();
                for i in 0..16_usize {
                    if (i as u32 & fix_mask) == fix_mask || (i as u32 & fix_mask) == 0 {
                        face.push(i);
                    }
                }
                if face.len() == 4 {
                    faces.push(face);
                }
            }
        }

        // Gera células cúbicas (8 cubos)
        // Cada célula é formada fixando uma das 4 coordenadas
        let mut cells = Vec::new();

        // Para cada coordenada e cada sinal
        for coord in 0..4_u32 {
            for sign in [0_u32, 1_u32] {
                let mut cell = Vec::new();
                for i in 0..16_usize {
                    let bit = (i as u32 >> coord) & 1;
                    if bit == sign {
                        cell.push(i);
                    }
                }
                if cell.len() == 8 {
                    cells.push(cell);
                }
            }
        }

        Self {
            vertices,
            edges,
            faces,
            cells,
        }
    }

    /// Aplica transformação a todos os vértices
    pub fn transform(&mut self, matrix: &Matrix4x4) {
        for vertex in &mut self.vertices {
            *vertex = matrix.transform(vertex);
        }
    }

    /// Retorna estatísticas do tesserato
    pub fn stats(&self) -> TesseractStats {
        TesseractStats {
            vertices: self.vertices.len(),
            edges: self.edges.len(),
            faces: self.faces.len(),
            cells: self.cells.len(),
        }
    }
}

#[derive(Debug)]
pub struct TesseractStats {
    pub vertices: usize,
    pub edges: usize,
    pub faces: usize,
    pub cells: usize,
}

/// 24-cell - Politopo regular 4D autodual
pub struct Cell24 {
    pub vertices: Vec<Point4D>,
    pub edges: Vec<(usize, usize)>,
}

impl Default for Cell24 {
    fn default() -> Self {
        Self::new()
    }
}

impl Cell24 {
    /// Cria um 24-cell com raio 1
    pub fn new() -> Self {
        let mut vertices = Vec::new();

        // 24 vértices: permutações de (±1, ±1, 0, 0) e suas rotações
        let coords = vec![
            (1.0, 1.0, 0.0, 0.0),
            (1.0, -1.0, 0.0, 0.0),
            (-1.0, 1.0, 0.0, 0.0),
            (-1.0, -1.0, 0.0, 0.0),
            (1.0, 0.0, 1.0, 0.0),
            (1.0, 0.0, -1.0, 0.0),
            (-1.0, 0.0, 1.0, 0.0),
            (-1.0, 0.0, -1.0, 0.0),
            (1.0, 0.0, 0.0, 1.0),
            (1.0, 0.0, 0.0, -1.0),
            (-1.0, 0.0, 0.0, 1.0),
            (-1.0, 0.0, 0.0, -1.0),
            (0.0, 1.0, 1.0, 0.0),
            (0.0, 1.0, -1.0, 0.0),
            (0.0, -1.0, 1.0, 0.0),
            (0.0, -1.0, -1.0, 0.0),
            (0.0, 1.0, 0.0, 1.0),
            (0.0, 1.0, 0.0, -1.0),
            (0.0, -1.0, 0.0, 1.0),
            (0.0, -1.0, 0.0, -1.0),
            (0.0, 0.0, 1.0, 1.0),
            (0.0, 0.0, 1.0, -1.0),
            (0.0, 0.0, -1.0, 1.0),
            (0.0, 0.0, -1.0, -1.0),
        ];

        for (x, y, z, w) in coords {
            vertices.push(Point4D::new(x, y, z, w));
        }

        // Conecta vértices que estão a distância √2
        let mut edges = Vec::new();
        for i in 0..24 {
            for j in (i + 1)..24 {
                let dist = vertices[i].distance(&vertices[j]);
                if (dist - 2.0_f64.sqrt()).abs() < 0.01 {
                    edges.push((i, j));
                }
            }
        }

        Self { vertices, edges }
    }

    pub fn transform(&mut self, matrix: &Matrix4x4) {
        for vertex in &mut self.vertices {
            *vertex = matrix.transform(vertex);
        }
    }
}

/// Simplex 4D (5-cell) - Análogo 4D do tetraedro
pub struct Simplex4D {
    pub vertices: Vec<Point4D>,
    pub edges: Vec<(usize, usize)>,
}

impl Default for Simplex4D {
    fn default() -> Self {
        Self::new()
    }
}

impl Simplex4D {
    /// Cria um simplex 4D regular
    pub fn new() -> Self {
        // 5 vértices em posições simétricas
        let sqrt5 = 5.0_f64.sqrt();
        let vertices = vec![
            Point4D::new(1.0, 1.0, 1.0, -1.0 / sqrt5),
            Point4D::new(1.0, -1.0, -1.0, -1.0 / sqrt5),
            Point4D::new(-1.0, 1.0, -1.0, -1.0 / sqrt5),
            Point4D::new(-1.0, -1.0, 1.0, -1.0 / sqrt5),
            Point4D::new(0.0, 0.0, 0.0, 4.0 / sqrt5),
        ];

        // Conecta todos os pares (grafo completo)
        let mut edges = Vec::new();
        for i in 0..5 {
            for j in (i + 1)..5 {
                edges.push((i, j));
            }
        }

        Self { vertices, edges }
    }
}

/// Corpo rígido em 4D
pub struct RigidBody4D {
    pub position: Point4D,
    pub velocity: Vector4D,
    pub acceleration: Vector4D,
    pub rotation: Matrix4x4,
    pub angular_velocity: f64, // Simplificado
}

impl RigidBody4D {
    pub fn new(position: Point4D) -> Self {
        Self {
            position,
            velocity: Vector4D::origin(),
            acceleration: Vector4D::origin(),
            rotation: Matrix4x4::identity(),
            angular_velocity: 0.0,
        }
    }

    /// Atualiza física (Euler simples)
    pub fn update(&mut self, dt: f64) {
        // Atualiza velocidade
        self.velocity = self.velocity.add(&self.acceleration.scale(dt));

        // Atualiza posição
        self.position = self.position.add(&self.velocity.scale(dt));

        // Atualiza rotação (simplificado: rotação no plano XY)
        let rot = Matrix4x4::rotation_xy(self.angular_velocity * dt);
        self.rotation = self.rotation.multiply(&rot);
    }
}

/// Renderizador ASCII 3D para visualização de projeções
pub struct AsciiRenderer3D {
    pub width: usize,
    pub height: usize,
    pub scale: f64,
}

impl AsciiRenderer3D {
    pub fn new(width: usize, height: usize, scale: f64) -> Self {
        Self {
            width,
            height,
            scale,
        }
    }

    /// Converte coordenadas 3D para coordenadas de tela 2D
    fn to_screen(&self, x: f64, y: f64, _z: f64) -> (usize, usize) {
        let sx = ((x * self.scale) + (self.width as f64 / 2.0)) as i32;
        let sy = ((y * self.scale) + (self.height as f64 / 2.0)) as i32;
        (
            sx.max(0).min(self.width as i32 - 1) as usize,
            sy.max(0).min(self.height as i32 - 1) as usize,
        )
    }

    /// Renderiza arestas projetadas
    pub fn render_edges(
        &self,
        vertices_3d: &[(f64, f64, f64)],
        edges: &[(usize, usize)],
    ) -> Vec<String> {
        let mut buffer = vec![vec![' '; self.width]; self.height];

        // Desenha vértices
        for (x, y, z) in vertices_3d {
            let (sx, sy) = self.to_screen(*x, *y, *z);
            if sy < self.height && sx < self.width {
                buffer[sy][sx] = '●';
            }
        }

        // Desenha arestas (simplificado: apenas marcadores)
        for (i, j) in edges {
            if *i < vertices_3d.len() && *j < vertices_3d.len() {
                let (x1, y1, z1) = vertices_3d[*i];
                let (x2, y2, z2) = vertices_3d[*j];

                // Interpola alguns pontos ao longo da aresta
                for t in 0..5 {
                    let t_norm = t as f64 / 4.0;
                    let x = x1 + (x2 - x1) * t_norm;
                    let y = y1 + (y2 - y1) * t_norm;
                    let z = z1 + (z2 - z1) * t_norm;

                    let (sx, sy) = self.to_screen(x, y, z);
                    if sy < self.height && sx < self.width && buffer[sy][sx] == ' ' {
                        buffer[sy][sx] = '·';
                    }
                }
            }
        }

        buffer.iter().map(|row| row.iter().collect()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn test_point4d_distance() {
        let p1 = Point4D::new(1.0, 0.0, 0.0, 0.0);
        let p2 = Point4D::new(0.0, 1.0, 0.0, 0.0);
        let dist = p1.distance(&p2);
        assert!((dist - 2.0_f64.sqrt()).abs() < 1e-10);
    }

    #[test]
    fn test_tesseract_structure() {
        let tesseract = Tesseract::new();
        let stats = tesseract.stats();

        assert_eq!(stats.vertices, 16);
        assert_eq!(stats.edges, 32);
        assert_eq!(stats.cells, 8);
    }

    #[test]
    fn test_rotation_4d() {
        let p = Point4D::new(1.0, 0.0, 0.0, 0.0);
        let rot = Matrix4x4::rotation_xy(PI / 2.0);
        let rotated = rot.transform(&p);

        assert!(rotated.x.abs() < 1e-10);
        assert!((rotated.y - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_24cell_vertices() {
        let cell = Cell24::new();
        assert_eq!(cell.vertices.len(), 24);

        // Verifica que todos os vértices estão a distância √2 da origem
        for v in &cell.vertices {
            let dist = v.norm();
            assert!((dist - 2.0_f64.sqrt()).abs() < 0.01);
        }
    }

    #[test]
    fn test_projection() {
        let proj = Projection4Dto3D::new(4.0);
        let p4d = Point4D::new(1.0, 1.0, 1.0, 1.0);
        let (x, _y, _z) = proj.project(&p4d);

        // Verifica que a projeção escalou corretamente
        assert!((x - 1.0 / 3.0).abs() < 1e-10);
    }
}
