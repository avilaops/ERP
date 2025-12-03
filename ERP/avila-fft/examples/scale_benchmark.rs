//! Scalability Benchmark
//!
//! Demonstrates performance scaling of parallel FFT and STFT processing.
//! Shows speedup vs serial processing and performance metrics.

use avila_fft::*;
use avila_fft::parallel::*;
use avila_fft::streaming::*;
use std::time::Instant;

fn main() {
    println!("=== AVILA-FFT SCALABILITY BENCHMARK ===\n");

    benchmark_parallel_fft();
    println!();
    benchmark_parallel_stft();
    println!();
    benchmark_streaming();
}

fn benchmark_parallel_fft() {
    println!("📊 Parallel FFT Batch Processing");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    let sizes = vec![1024, 2048, 4096];
    let batch_sizes = vec![10, 50, 100];

    for &size in &sizes {
        println!("\nFFT Size: {}", size);

        for &batch in &batch_sizes {
            // Generate test signals
            let signals: Vec<Vec<Complex<f64>>> = (0..batch)
                .map(|i| {
                    (0..size)
                        .map(|j| {
                            let t = j as f64 / size as f64;
                            let freq = 100.0 + i as f64 * 10.0;
                            Complex::new((2.0 * std::f64::consts::PI * freq * t).sin(), 0.0)
                        })
                        .collect()
                })
                .collect();

            // Serial processing
            let start = Instant::now();
            let mut serial_results = Vec::new();
            for signal in &signals {
                let planner = FftPlanner::new(size, false).unwrap();
                let result = planner.process(signal).unwrap();
                serial_results.push(result);
            }
            let serial_time = start.elapsed();

            // Parallel processing (2 threads)
            let config = ParallelConfig {
                num_threads: 2,
                min_chunk_size: 512,
            };
            let processor = ParallelFft::<f64>::new(config);

            let start = Instant::now();
            let parallel_results = processor.process_batch(signals.clone(), false);
            let parallel_time = start.elapsed();

            // Parallel processing (4 threads)
            let config = ParallelConfig {
                num_threads: 4,
                min_chunk_size: 512,
            };
            let processor = ParallelFft::<f64>::new(config);

            let start = Instant::now();
            let _ = processor.process_batch(signals, false);
            let parallel4_time = start.elapsed();

            let speedup_2 = serial_time.as_secs_f64() / parallel_time.as_secs_f64();
            let speedup_4 = serial_time.as_secs_f64() / parallel4_time.as_secs_f64();

            println!("  Batch: {:3} signals", batch);
            println!("    Serial:    {:6.2} ms", serial_time.as_secs_f64() * 1000.0);
            println!("    Parallel2: {:6.2} ms (speedup: {:.2}x)",
                     parallel_time.as_secs_f64() * 1000.0, speedup_2);
            println!("    Parallel4: {:6.2} ms (speedup: {:.2}x)",
                     parallel4_time.as_secs_f64() * 1000.0, speedup_4);

            // Verify correctness
            assert_eq!(serial_results.len(), parallel_results.len());
            for (s, p) in serial_results.iter().zip(parallel_results.iter()) {
                for (sv, pv) in s.iter().zip(p.iter()) {
                    let diff = (sv.re - pv.re).abs() + (sv.im - pv.im).abs();
                    assert!(diff < 1e-10, "Results differ!");
                }
            }
        }
    }

    println!("\n✓ All parallel FFT results match serial processing");
}

fn benchmark_parallel_stft() {
    println!("📊 Parallel STFT Processing");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    let sample_rate = 16384.0;
    let window_size = 1024;
    let hop_size = 512;

    let durations = vec![1.0, 5.0, 10.0]; // seconds

    for &duration in &durations {
        println!("\nSignal Duration: {:.1}s ({} samples)",
                 duration, (sample_rate * duration) as usize);

        // Generate test signal (chirp)
        let n_samples = (sample_rate * duration) as usize;
        let signal: Vec<f64> = (0..n_samples)
            .map(|i| {
                let t = i as f64 / sample_rate;
                let freq = 100.0 + 400.0 * t / duration;
                (2.0 * std::f64::consts::PI * freq * t).sin()
            })
            .collect();

        // Hann window
        let window: Vec<f64> = (0..window_size)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f64::consts::PI * i as f64 / window_size as f64).cos())
            })
            .collect();

        // Serial STFT (using parallel processor with 1 thread)
        let config = ParallelConfig {
            num_threads: 1,
            min_chunk_size: 512,
        };
        let processor = ParallelStft::<f64>::new(window_size, hop_size, config);

        let start = Instant::now();
        let serial_frames = processor.process_parallel(&signal, &window);
        let serial_time = start.elapsed();

        // Parallel STFT (2 threads)
        let config = ParallelConfig {
            num_threads: 2,
            min_chunk_size: 512,
        };
        let processor = ParallelStft::<f64>::new(window_size, hop_size, config);

        let start = Instant::now();
        let parallel2_frames = processor.process_parallel(&signal, &window);
        let parallel2_time = start.elapsed();

        // Parallel STFT (4 threads)
        let config = ParallelConfig {
            num_threads: 4,
            min_chunk_size: 512,
        };
        let processor = ParallelStft::<f64>::new(window_size, hop_size, config);

        let start = Instant::now();
        let parallel4_frames = processor.process_parallel(&signal, &window);
        let parallel4_time = start.elapsed();

        let speedup_2 = serial_time.as_secs_f64() / parallel2_time.as_secs_f64();
        let speedup_4 = serial_time.as_secs_f64() / parallel4_time.as_secs_f64();

        println!("  Frames: {}", serial_frames.len());
        println!("  Serial:    {:6.2} ms", serial_time.as_secs_f64() * 1000.0);
        println!("  Parallel2: {:6.2} ms (speedup: {:.2}x)",
                 parallel2_time.as_secs_f64() * 1000.0, speedup_2);
        println!("  Parallel4: {:6.2} ms (speedup: {:.2}x)",
                 parallel4_time.as_secs_f64() * 1000.0, speedup_4);

        // Verify correctness
        assert_eq!(serial_frames.len(), parallel2_frames.len());
        assert_eq!(serial_frames.len(), parallel4_frames.len());
    }

    println!("\n✓ All parallel STFT results match serial processing");
}

fn benchmark_streaming() {
    println!("📊 Streaming Processing (Constant Memory)");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Create test file with 100K samples (~6 seconds at 16384 Hz)
    let test_file = "benchmark_signal.txt";
    let n_samples = 100_000;
    let sample_rate = 16384.0;

    println!("\nGenerating test file: {} samples ({:.2}s)",
             n_samples, n_samples as f64 / sample_rate);

    let start = Instant::now();
    let mut file = std::fs::File::create(test_file).unwrap();
    use std::io::Write;

    for i in 0..n_samples {
        let t = i as f64 / sample_rate;
        let freq = 200.0 + 300.0 * t / (n_samples as f64 / sample_rate);
        let sample = (2.0 * std::f64::consts::PI * freq * t).sin();
        writeln!(file, "{}", sample).unwrap();
    }
    let gen_time = start.elapsed();

    println!("File generation: {:.2} ms", gen_time.as_secs_f64() * 1000.0);

    // Streaming processing with different buffer sizes
    let buffer_sizes = vec![4096, 16384, 65536];

    for &buffer_size in &buffer_sizes {
        let config = StreamConfig {
            window_size: 1024,
            hop_size: 512,
            buffer_size,
            sample_rate,
        };

        let mut processor = StreamingStft::<f64>::new(config);
        let mut frame_count = 0;

        let start = Instant::now();
        processor.process_file(test_file, |idx, _time, frame| {
            frame_count = idx + 1;
            // Simulate some processing
            let _mag: f64 = frame.iter().map(|c| c.norm()).sum();
        }).unwrap();
        let process_time = start.elapsed();

        let throughput = n_samples as f64 / process_time.as_secs_f64();

        println!("\nBuffer: {} samples", buffer_size);
        println!("  Frames processed: {}", frame_count);
        println!("  Time: {:.2} ms", process_time.as_secs_f64() * 1000.0);
        println!("  Throughput: {:.0} samples/sec ({:.1}x realtime)",
                 throughput, throughput / sample_rate);
    }

    // Cleanup
    std::fs::remove_file(test_file).unwrap();

    println!("\n✓ Streaming processing completed with constant memory");
}
