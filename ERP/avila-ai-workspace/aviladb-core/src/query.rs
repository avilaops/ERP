//! Query processor (SQL-like)

use alloc::string::String;
use alloc::vec::Vec;

/// Parsed query
pub enum Query {
    /// SELECT
    Select {
        columns: Vec<String>,
        table: String,
        where_clause: Option<String>,
    },

    /// INSERT
    Insert {
        table: String,
        columns: Vec<String>,
        values: Vec<String>,
    },

    /// UPDATE
    Update {
        table: String,
        set: Vec<(String, String)>,
        where_clause: Option<String>,
    },

    /// DELETE
    Delete {
        table: String,
        where_clause: Option<String>,
    },

    /// CREATE TABLE
    CreateTable {
        name: String,
        columns: Vec<ColumnDef>,
    },
}

/// Definição de coluna
pub struct ColumnDef {
    /// Nome da coluna
    pub name: String,

    /// Tipo da coluna
    pub data_type: DataType,

    /// Constraints
    pub nullable: bool,
}

/// Tipos de dados
pub enum DataType {
    /// Integer
    Integer,
    /// Float
    Float,
    /// String (tamanho máximo)
    String(usize),
    /// Bytes
    Bytes,
}

/// Query executor
pub struct QueryExecutor {
    // TODO: Adicionar referência ao storage engine
}

impl QueryExecutor {
    /// Executa query
    pub fn execute(&mut self, query: Query) -> Result<QueryResult, String> {
        match query {
            Query::Select { columns, table, where_clause } => {
                self.execute_select(columns, table, where_clause)
            }
            Query::Insert { table, columns, values } => {
                self.execute_insert(table, columns, values)
            }
            _ => Err(String::from("Not implemented")),
        }
    }

    fn execute_select(&mut self, columns: Vec<String>, table: String, where_clause: Option<String>) -> Result<QueryResult, String> {
        // TODO: Implementar SELECT
        Ok(QueryResult::empty())
    }

    fn execute_insert(&mut self, table: String, columns: Vec<String>, values: Vec<String>) -> Result<QueryResult, String> {
        // TODO: Implementar INSERT
        Ok(QueryResult::empty())
    }
}

/// Resultado da query
pub struct QueryResult {
    /// Linhas retornadas
    pub rows: Vec<Vec<String>>,
}

impl QueryResult {
    fn empty() -> Self {
        Self { rows: Vec::new() }
    }
}
