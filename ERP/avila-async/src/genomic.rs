//! Genetic Algorithm Optimization
//!
//! Evolutionary algorithms for runtime optimization

use std::sync::{Arc, Mutex};

/// Genetic algorithm for runtime configuration optimization
#[derive(Clone)]
pub struct GeneticOptimizer {
    population: Arc<Mutex<Vec<Genome>>>,
    generation: Arc<Mutex<usize>>,
    population_size: usize,
    mutation_rate: f64,
}

#[derive(Clone, Debug)]
pub struct Genome {
    pub genes: Vec<f64>,
    pub fitness: f64,
}

impl GeneticOptimizer {
    pub fn new(population_size: usize, gene_count: usize, mutation_rate: f64) -> Self {
        let population: Vec<Genome> = (0..population_size)
            .map(|i| Genome {
                genes: (0..gene_count)
                    .map(|j| ((i * 7919 + j * 3571) as f64 % 1000.0) / 1000.0)
                    .collect(),
                fitness: 0.0,
            })
            .collect();

        Self {
            population: Arc::new(Mutex::new(population)),
            generation: Arc::new(Mutex::new(0)),
            population_size,
            mutation_rate,
        }
    }

    /// Evaluate fitness of all genomes
    pub fn evaluate<F>(&self, fitness_fn: F)
    where
        F: Fn(&[f64]) -> f64,
    {
        let mut population = self.population.lock().unwrap();
        for genome in population.iter_mut() {
            genome.fitness = fitness_fn(&genome.genes);
        }
    }

    /// Evolve to next generation
    pub fn evolve(&self) {
        let mut population = self.population.lock().unwrap();
        let mut generation = self.generation.lock().unwrap();

        // Sort by fitness (descending)
        population.sort_by(|a, b| b.fitness.partial_cmp(&a.fitness).unwrap());

        // Keep top 20% (elitism)
        let elite_count = self.population_size / 5;
        let elite = population[..elite_count].to_vec();

        // Generate new population
        let mut new_population = elite.clone();

        while new_population.len() < self.population_size {
            // Select parents (tournament selection)
            let parent1 = &population[0]; // Best
            let parent2 = &population[1]; // Second best

            // Crossover
            let mut child = self.crossover(parent1, parent2);

            // Mutation
            self.mutate(&mut child);

            new_population.push(child);
        }

        *population = new_population;
        *generation += 1;
    }

    /// Get best genome
    pub fn best(&self) -> Option<Genome> {
        let population = self.population.lock().unwrap();
        population.iter()
            .max_by(|a, b| a.fitness.partial_cmp(&b.fitness).unwrap())
            .cloned()
    }

    /// Get current generation
    pub fn generation(&self) -> usize {
        *self.generation.lock().unwrap()
    }

    /// Get optimization statistics
    pub fn stats(&self) -> GeneticStats {
        let population = self.population.lock().unwrap();
        let generation = *self.generation.lock().unwrap();

        let avg_fitness = if !population.is_empty() {
            population.iter().map(|g| g.fitness).sum::<f64>() / population.len() as f64
        } else {
            0.0
        };

        let best_fitness = population.iter()
            .map(|g| g.fitness)
            .max_by(|a, b| a.partial_cmp(b).unwrap())
            .unwrap_or(0.0);

        GeneticStats {
            generation,
            population_size: population.len(),
            avg_fitness,
            best_fitness,
            mutation_rate: self.mutation_rate,
        }
    }

    fn crossover(&self, parent1: &Genome, parent2: &Genome) -> Genome {
        let gene_count = parent1.genes.len();
        let crossover_point = gene_count / 2;

        let mut genes = Vec::with_capacity(gene_count);
        genes.extend_from_slice(&parent1.genes[..crossover_point]);
        genes.extend_from_slice(&parent2.genes[crossover_point..]);

        Genome { genes, fitness: 0.0 }
    }

    fn mutate(&self, genome: &mut Genome) {
        for gene in &mut genome.genes {
            if ((*gene * 1000.0) % 1.0) < self.mutation_rate {
                *gene = ((*gene * 7919.0) % 1000.0) / 1000.0;
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct GeneticStats {
    pub generation: usize,
    pub population_size: usize,
    pub avg_fitness: f64,
    pub best_fitness: f64,
    pub mutation_rate: f64,
}

impl std::fmt::Display for Genome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Genome[genes={}, fitness={:.3}]",
            self.genes.len(),
            self.fitness
        )
    }
}

impl std::fmt::Display for GeneticStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Gen{}: pop={}, avg={:.3}, best={:.3}",
            self.generation, self.population_size, self.avg_fitness, self.best_fitness
        )
    }
}
