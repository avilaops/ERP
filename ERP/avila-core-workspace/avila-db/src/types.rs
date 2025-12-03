//! Tipos de dados do AvilaDB

use alloc::vec::Vec;
use alloc::string::String;

/// Tipo de coluna
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ColumnType {
    /// Integer de 64 bits
    Int64,
    /// Float de 64 bits
    Float64,
    /// String UTF-8
    String,
    /// Bytes raw
    Bytes,
    /// Boolean
    Bool,
    /// Timestamp (microssegundos desde epoch)
    Timestamp,
}

/// Valor de célula
#[derive(Debug, Clone)]
pub enum CellValue {
    Null,
    Int64(i64),
    Float64(f64),
    String(String),
    Bytes(Vec<u8>),
    Bool(bool),
    Timestamp(i64),
}

impl CellValue {
    /// Serializa valor para bytes
    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = Vec::new();

        match self {
            CellValue::Null => {
                bytes.push(0);
            }
            CellValue::Int64(v) => {
                bytes.push(1);
                bytes.extend_from_slice(&v.to_le_bytes());
            }
            CellValue::Float64(v) => {
                bytes.push(2);
                bytes.extend_from_slice(&v.to_le_bytes());
            }
            CellValue::String(s) => {
                bytes.push(3);
                let str_bytes = s.as_bytes();
                bytes.extend_from_slice(&(str_bytes.len() as u32).to_le_bytes());
                bytes.extend_from_slice(str_bytes);
            }
            CellValue::Bytes(b) => {
                bytes.push(4);
                bytes.extend_from_slice(&(b.len() as u32).to_le_bytes());
                bytes.extend_from_slice(b);
            }
            CellValue::Bool(b) => {
                bytes.push(5);
                bytes.push(if *b { 1 } else { 0 });
            }
            CellValue::Timestamp(ts) => {
                bytes.push(6);
                bytes.extend_from_slice(&ts.to_le_bytes());
            }
        }

        bytes
    }

    /// Deserializa valor de bytes
    pub fn decode(bytes: &[u8]) -> Option<Self> {
        if bytes.is_empty() {
            return None;
        }

        match bytes[0] {
            0 => Some(CellValue::Null),
            1 => {
                if bytes.len() < 9 {
                    return None;
                }
                let value = i64::from_le_bytes(bytes[1..9].try_into().ok()?);
                Some(CellValue::Int64(value))
            }
            2 => {
                if bytes.len() < 9 {
                    return None;
                }
                let value = f64::from_le_bytes(bytes[1..9].try_into().ok()?);
                Some(CellValue::Float64(value))
            }
            3 => {
                if bytes.len() < 5 {
                    return None;
                }
                let len = u32::from_le_bytes(bytes[1..5].try_into().ok()?) as usize;
                if bytes.len() < 5 + len {
                    return None;
                }
                let s = String::from_utf8(bytes[5..5 + len].to_vec()).ok()?;
                Some(CellValue::String(s))
            }
            4 => {
                if bytes.len() < 5 {
                    return None;
                }
                let len = u32::from_le_bytes(bytes[1..5].try_into().ok()?) as usize;
                if bytes.len() < 5 + len {
                    return None;
                }
                Some(CellValue::Bytes(bytes[5..5 + len].to_vec()))
            }
            5 => {
                if bytes.len() < 2 {
                    return None;
                }
                Some(CellValue::Bool(bytes[1] != 0))
            }
            6 => {
                if bytes.len() < 9 {
                    return None;
                }
                let ts = i64::from_le_bytes(bytes[1..9].try_into().ok()?);
                Some(CellValue::Timestamp(ts))
            }
            _ => None,
        }
    }
}

/// Schema de tabela
#[derive(Debug, Clone)]
pub struct TableSchema {
    /// Nome da tabela
    pub name: String,
    /// Colunas
    pub columns: Vec<Column>,
    /// Índice da primary key
    pub primary_key: Option<usize>,
}

/// Definição de coluna
#[derive(Debug, Clone)]
pub struct Column {
    /// Nome
    pub name: String,
    /// Tipo
    pub column_type: ColumnType,
    /// Nullable?
    pub nullable: bool,
}

/// Row (linha) de dados
#[derive(Debug, Clone)]
pub struct Row {
    /// Valores das células
    pub cells: Vec<CellValue>,
}

impl Row {
    /// Serializa row
    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = Vec::new();

        // Número de células
        bytes.extend_from_slice(&(self.cells.len() as u32).to_le_bytes());

        // Cada célula
        for cell in &self.cells {
            let cell_bytes = cell.encode();
            bytes.extend_from_slice(&(cell_bytes.len() as u32).to_le_bytes());
            bytes.extend_from_slice(&cell_bytes);
        }

        bytes
    }

    /// Deserializa row
    pub fn decode(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 4 {
            return None;
        }

        let num_cells = u32::from_le_bytes(bytes[0..4].try_into().ok()?) as usize;
        let mut cells = Vec::with_capacity(num_cells);
        let mut offset = 4;

        for _ in 0..num_cells {
            if offset + 4 > bytes.len() {
                return None;
            }

            let cell_len = u32::from_le_bytes(bytes[offset..offset + 4].try_into().ok()?) as usize;
            offset += 4;

            if offset + cell_len > bytes.len() {
                return None;
            }

            let cell = CellValue::decode(&bytes[offset..offset + cell_len])?;
            cells.push(cell);
            offset += cell_len;
        }

        Some(Row { cells })
    }
}
