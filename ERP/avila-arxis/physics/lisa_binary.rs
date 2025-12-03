//! Binary I/O support for LISA data (Rust-native format)
//!
//! Implements efficient binary format for LISA data storage.
//! Simple, fast, and pure Rust - no external dependencies.

use crate::physics::{EventCandidate, StrainTimeSeries};
use std::fs::File;
use std::io::{self, BufReader, BufWriter, Read, Write};

/// Binary file handler for LISA data
pub struct LisaBinaryFile {
    path: String,
}

impl LisaBinaryFile {
    /// Create new binary file handler
    pub fn new(path: impl Into<String>) -> Self {
        Self { path: path.into() }
    }

    /// Write strain time series to binary file
    pub fn write_strain(&self, data: &StrainTimeSeries) -> io::Result<()> {
        let file = File::create(&self.path)?;
        let mut writer = BufWriter::new(file);

        // Write header
        writer.write_all(b"LISA")?; // Magic bytes
        writer.write_all(&1u32.to_le_bytes())?; // Version

        // Write metadata
        writer.write_all(&data.sampling_rate.to_le_bytes())?;
        writer.write_all(&data.duration.to_le_bytes())?;
        writer.write_all(&(data.time.len() as u64).to_le_bytes())?;

        // Write time array
        for &t in &data.time {
            writer.write_all(&t.to_le_bytes())?;
        }

        // Write h_plus
        for &h in &data.h_plus {
            writer.write_all(&h.to_le_bytes())?;
        }

        // Write h_cross
        for &h in &data.h_cross {
            writer.write_all(&h.to_le_bytes())?;
        }

        Ok(())
    }

    /// Read strain time series from binary file
    pub fn read_strain(&self) -> io::Result<StrainTimeSeries> {
        let file = File::open(&self.path)?;
        let mut reader = BufReader::new(file);

        // Read and verify header
        let mut magic = [0u8; 4];
        reader.read_exact(&mut magic)?;
        if &magic != b"LISA" {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Invalid file format",
            ));
        }

        let mut version_buf = [0u8; 4];
        reader.read_exact(&mut version_buf)?;

        // Read metadata
        let sampling_rate = read_f64(&mut reader)?;
        let duration = read_f64(&mut reader)?;
        let len = read_u64(&mut reader)? as usize;

        // Read arrays
        let time = read_f64_array(&mut reader, len)?;
        let h_plus = read_f64_array(&mut reader, len)?;
        let h_cross = read_f64_array(&mut reader, len)?;

        Ok(StrainTimeSeries {
            time,
            h_plus,
            h_cross,
            sampling_rate,
            duration,
        })
    }

    /// Write event catalog to binary file
    pub fn write_events(&self, events: &[EventCandidate]) -> io::Result<()> {
        let file = File::create(&self.path)?;
        let mut writer = BufWriter::new(file);

        // Write header
        writer.write_all(b"EVNT")?;
        writer.write_all(&1u32.to_le_bytes())?;
        writer.write_all(&(events.len() as u64).to_le_bytes())?;

        // Write events
        for event in events {
            writer.write_all(&event.time.to_le_bytes())?;
            writer.write_all(&event.snr.to_le_bytes())?;
            // Write template parameters
            writer.write_all(&event.best_template.total_mass.to_le_bytes())?;
            writer.write_all(&event.best_template.mass_ratio.to_le_bytes())?;
        }

        Ok(())
    }

    /// Check if file exists
    pub fn exists(&self) -> bool {
        std::path::Path::new(&self.path).exists()
    }
}

// Helper functions for binary I/O
fn read_f64<R: Read>(reader: &mut R) -> io::Result<f64> {
    let mut buf = [0u8; 8];
    reader.read_exact(&mut buf)?;
    Ok(f64::from_le_bytes(buf))
}

fn read_u64<R: Read>(reader: &mut R) -> io::Result<u64> {
    let mut buf = [0u8; 8];
    reader.read_exact(&mut buf)?;
    Ok(u64::from_le_bytes(buf))
}

fn read_f64_array<R: Read>(reader: &mut R, len: usize) -> io::Result<Vec<f64>> {
    let mut result = Vec::with_capacity(len);
    for _ in 0..len {
        result.push(read_f64(reader)?);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::physics::SyntheticDataGenerator;

    #[test]
    fn test_binary_write_read_strain() {
        let temp_path = "test_strain.lisa";

        // Create synthetic data
        let gen = SyntheticDataGenerator::new(1.0, 10.0);
        let data = gen.monochromatic_binary(0.001, 1e-21, 0.0);

        // Write
        let lisa_file = LisaBinaryFile::new(temp_path);
        lisa_file.write_strain(&data).expect("Failed to write");

        // Read
        let read_data = lisa_file.read_strain().expect("Failed to read");

        // Verify
        assert_eq!(data.time.len(), read_data.time.len());
        assert!((data.sampling_rate - read_data.sampling_rate).abs() < 1e-10);
        assert!((data.duration - read_data.duration).abs() < 1e-10);

        // Cleanup
        std::fs::remove_file(temp_path).ok();
    }

    #[test]
    fn test_binary_write_events() {
        let temp_path = "test_events.lisa";

        // Create test events
        let events = vec![
            EventCandidate {
                time: 100.0,
                snr: 12.5,
                frequency: 0.001,
                template_index: 0,
            },
            EventCandidate {
                time: 200.0,
                snr: 15.3,
                frequency: 0.002,
                template_index: 1,
            },
        ];

        // Write
        let lisa_file = LisaBinaryFile::new(temp_path);
        lisa_file
            .write_events(&events)
            .expect("Failed to write events");

        assert!(lisa_file.exists());

        // Cleanup
        std::fs::remove_file(temp_path).ok();
    }
}
