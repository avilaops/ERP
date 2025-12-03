//! JSON serialization and deserialization

use crate::error::{Error, Result};
use crate::ser::{Serialize, Serializer};
use crate::de::{Deserialize, Deserializer};

/// Serialize a value to JSON string
pub fn to_json<T: Serialize>(value: &T) -> Result<String> {
    let mut serializer = JsonSerializer::new();
    value.serialize(&mut serializer)?;
    Ok(serializer.into_string())
}

/// Serialize a value to pretty-printed JSON string
pub fn to_json_pretty<T: Serialize>(value: &T) -> Result<String> {
    let mut serializer = JsonSerializer::new_pretty();
    value.serialize(&mut serializer)?;
    Ok(serializer.into_string())
}

/// Deserialize a value from JSON string
pub fn from_json<T: Deserialize>(json: &str) -> Result<T> {
    let mut deserializer = JsonDeserializer::new(json)?;
    T::deserialize(&mut deserializer)
}

/// JSON serializer
pub struct JsonSerializer {
    buffer: String,
    pretty: bool,
    indent_level: usize,
    needs_comma: bool,
}

impl JsonSerializer {
    /// Create a new compact JSON serializer
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            pretty: false,
            indent_level: 0,
            needs_comma: false,
        }
    }

    /// Create a new pretty-printing JSON serializer
    pub fn new_pretty() -> Self {
        Self {
            buffer: String::new(),
            pretty: true,
            indent_level: 0,
            needs_comma: false,
        }
    }

    /// Get the serialized JSON string
    pub fn into_string(self) -> String {
        self.buffer
    }

    fn write_comma(&mut self) {
        if self.needs_comma {
            self.buffer.push(',');
            if self.pretty {
                self.buffer.push('\n');
            }
        }
        self.needs_comma = true;
    }

    fn write_indent(&mut self) {
        if self.pretty {
            for _ in 0..self.indent_level {
                self.buffer.push_str("  ");
            }
        }
    }
}

impl Default for JsonSerializer {
    fn default() -> Self {
        Self::new()
    }
}

impl Serializer for JsonSerializer {
    fn serialize_bool(&mut self, value: bool) -> Result<()> {
        self.buffer.push_str(if value { "true" } else { "false" });
        Ok(())
    }

    fn serialize_i8(&mut self, value: i8) -> Result<()> {
        self.buffer.push_str(&value.to_string());
        Ok(())
    }

    fn serialize_i16(&mut self, value: i16) -> Result<()> {
        self.buffer.push_str(&value.to_string());
        Ok(())
    }

    fn serialize_i32(&mut self, value: i32) -> Result<()> {
        self.buffer.push_str(&value.to_string());
        Ok(())
    }

    fn serialize_i64(&mut self, value: i64) -> Result<()> {
        self.buffer.push_str(&value.to_string());
        Ok(())
    }

    fn serialize_u8(&mut self, value: u8) -> Result<()> {
        self.buffer.push_str(&value.to_string());
        Ok(())
    }

    fn serialize_u16(&mut self, value: u16) -> Result<()> {
        self.buffer.push_str(&value.to_string());
        Ok(())
    }

    fn serialize_u32(&mut self, value: u32) -> Result<()> {
        self.buffer.push_str(&value.to_string());
        Ok(())
    }

    fn serialize_u64(&mut self, value: u64) -> Result<()> {
        self.buffer.push_str(&value.to_string());
        Ok(())
    }

    fn serialize_f32(&mut self, value: f32) -> Result<()> {
        if value.is_nan() || value.is_infinite() {
            self.buffer.push_str("null");
        } else {
            self.buffer.push_str(&value.to_string());
        }
        Ok(())
    }

    fn serialize_f64(&mut self, value: f64) -> Result<()> {
        if value.is_nan() || value.is_infinite() {
            self.buffer.push_str("null");
        } else {
            self.buffer.push_str(&value.to_string());
        }
        Ok(())
    }

    fn serialize_str(&mut self, value: &str) -> Result<()> {
        self.buffer.push('"');
        for ch in value.chars() {
            match ch {
                '"' => self.buffer.push_str("\\\""),
                '\\' => self.buffer.push_str("\\\\"),
                '\n' => self.buffer.push_str("\\n"),
                '\r' => self.buffer.push_str("\\r"),
                '\t' => self.buffer.push_str("\\t"),
                _ => self.buffer.push(ch),
            }
        }
        self.buffer.push('"');
        Ok(())
    }

    fn serialize_bytes(&mut self, value: &[u8]) -> Result<()> {
        self.begin_seq(Some(value.len()))?;
        for &byte in value {
            self.serialize_element(&byte)?;
        }
        self.end_seq()
    }

    fn serialize_none(&mut self) -> Result<()> {
        self.buffer.push_str("null");
        Ok(())
    }

    fn serialize_some<T: Serialize>(&mut self, value: &T) -> Result<()> {
        value.serialize(self)
    }

    fn begin_seq(&mut self, _len: Option<usize>) -> Result<()> {
        self.buffer.push('[');
        if self.pretty {
            self.buffer.push('\n');
            self.indent_level += 1;
        }
        self.needs_comma = false;
        Ok(())
    }

    fn serialize_element<T: Serialize>(&mut self, value: &T) -> Result<()> {
        self.write_comma();
        self.write_indent();
        value.serialize(self)
    }

    fn end_seq(&mut self) -> Result<()> {
        if self.pretty {
            self.indent_level -= 1;
            self.buffer.push('\n');
            self.write_indent();
        }
        self.buffer.push(']');
        self.needs_comma = false;
        Ok(())
    }

    fn begin_map(&mut self, _len: Option<usize>) -> Result<()> {
        self.buffer.push('{');
        if self.pretty {
            self.buffer.push('\n');
            self.indent_level += 1;
        }
        self.needs_comma = false;
        Ok(())
    }

    fn serialize_key<T: Serialize>(&mut self, key: &T) -> Result<()> {
        self.write_comma();
        self.write_indent();
        key.serialize(self)?;
        self.buffer.push(':');
        if self.pretty {
            self.buffer.push(' ');
        }
        Ok(())
    }

    fn serialize_value<T: Serialize>(&mut self, value: &T) -> Result<()> {
        value.serialize(self)?;
        Ok(())
    }

    fn end_map(&mut self) -> Result<()> {
        if self.pretty {
            self.indent_level -= 1;
            self.buffer.push('\n');
            self.write_indent();
        }
        self.buffer.push('}');
        self.needs_comma = false;
        Ok(())
    }
}

/// JSON deserializer
pub struct JsonDeserializer {
    input: Vec<u8>,
    pos: usize,
}

impl JsonDeserializer {
    /// Create a new JSON deserializer
    pub fn new(json: &str) -> Result<Self> {
        Ok(Self {
            input: json.as_bytes().to_vec(),
            pos: 0,
        })
    }

    fn skip_whitespace(&mut self) {
        while self.pos < self.input.len() {
            match self.input[self.pos] {
                b' ' | b'\n' | b'\r' | b'\t' => self.pos += 1,
                _ => break,
            }
        }
    }

    fn peek(&mut self) -> Result<u8> {
        self.skip_whitespace();
        self.input.get(self.pos)
            .copied()
            .ok_or(Error::UnexpectedEof)
    }

    fn consume(&mut self) -> Result<u8> {
        self.skip_whitespace();
        let byte = self.input.get(self.pos)
            .copied()
            .ok_or(Error::UnexpectedEof)?;
        self.pos += 1;
        Ok(byte)
    }

    fn parse_string(&mut self) -> Result<String> {
        if self.consume()? != b'"' {
            return Err(Error::InvalidType("expected string".to_string()));
        }

        let mut result = String::new();
        loop {
            match self.consume()? {
                b'"' => return Ok(result),
                b'\\' => {
                    match self.consume()? {
                        b'"' => result.push('"'),
                        b'\\' => result.push('\\'),
                        b'n' => result.push('\n'),
                        b'r' => result.push('\r'),
                        b't' => result.push('\t'),
                        _ => return Err(Error::InvalidValue("invalid escape".to_string())),
                    }
                }
                ch => result.push(ch as char),
            }
        }
    }

    fn parse_number<T: std::str::FromStr>(&mut self) -> Result<T> {
        let start = self.pos;
        while self.pos < self.input.len() {
            match self.input[self.pos] {
                b'0'..=b'9' | b'-' | b'+' | b'.' | b'e' | b'E' => self.pos += 1,
                _ => break,
            }
        }

        let num_str = std::str::from_utf8(&self.input[start..self.pos])?;
        num_str.parse()
            .map_err(|_| Error::InvalidValue(format!("invalid number: {}", num_str)))
    }
}

impl Deserializer for JsonDeserializer {
    fn deserialize_bool(&mut self) -> Result<bool> {
        match self.peek()? {
            b't' => {
                self.pos += 4; // "true"
                Ok(true)
            }
            b'f' => {
                self.pos += 5; // "false"
                Ok(false)
            }
            _ => Err(Error::InvalidType("expected boolean".to_string())),
        }
    }

    fn deserialize_i8(&mut self) -> Result<i8> {
        self.parse_number()
    }

    fn deserialize_i16(&mut self) -> Result<i16> {
        self.parse_number()
    }

    fn deserialize_i32(&mut self) -> Result<i32> {
        self.parse_number()
    }

    fn deserialize_i64(&mut self) -> Result<i64> {
        self.parse_number()
    }

    fn deserialize_u8(&mut self) -> Result<u8> {
        self.parse_number()
    }

    fn deserialize_u16(&mut self) -> Result<u16> {
        self.parse_number()
    }

    fn deserialize_u32(&mut self) -> Result<u32> {
        self.parse_number()
    }

    fn deserialize_u64(&mut self) -> Result<u64> {
        self.parse_number()
    }

    fn deserialize_f32(&mut self) -> Result<f32> {
        self.parse_number()
    }

    fn deserialize_f64(&mut self) -> Result<f64> {
        self.parse_number()
    }

    fn deserialize_string(&mut self) -> Result<String> {
        self.parse_string()
    }

    fn deserialize_bytes(&mut self) -> Result<Vec<u8>> {
        Vec::<u8>::deserialize(self)
    }

    fn deserialize_option<T: Deserialize>(&mut self) -> Result<Option<T>> {
        if self.peek()? == b'n' {
            self.pos += 4; // "null"
            Ok(None)
        } else {
            Ok(Some(T::deserialize(self)?))
        }
    }

    fn begin_seq(&mut self) -> Result<usize> {
        if self.consume()? != b'[' {
            return Err(Error::InvalidType("expected array".to_string()));
        }
        Ok(0) // Unknown length
    }

    fn deserialize_seq_element<T: Deserialize>(&mut self) -> Result<Option<T>> {
        self.skip_whitespace();
        if self.peek()? == b']' {
            return Ok(None);
        }

        if self.pos > 0 && self.input.get(self.pos.saturating_sub(1)) == Some(&b',') {
            // Already consumed comma
        } else if self.pos > 0 {
            // Check for comma
            let prev_pos = self.pos;
            self.skip_whitespace();
            if self.peek()? == b',' {
                self.consume()?;
            } else if self.peek()? != b']' && prev_pos != 1 {
                return Err(Error::InvalidValue("expected comma or ]".to_string()));
            }
        }

        Ok(Some(T::deserialize(self)?))
    }

    fn end_seq(&mut self) -> Result<()> {
        if self.consume()? != b']' {
            return Err(Error::InvalidType("expected ]".to_string()));
        }
        Ok(())
    }

    fn begin_map(&mut self) -> Result<usize> {
        if self.consume()? != b'{' {
            return Err(Error::InvalidType("expected object".to_string()));
        }
        Ok(0) // Unknown length
    }

    fn deserialize_map_key<T: Deserialize>(&mut self) -> Result<Option<T>> {
        self.skip_whitespace();
        if self.peek()? == b'}' {
            return Ok(None);
        }

        // Handle comma between entries
        if self.pos > 0 {
            self.skip_whitespace();
            if self.peek()? == b',' {
                self.consume()?;
            }
        }

        Ok(Some(T::deserialize(self)?))
    }

    fn deserialize_map_value<T: Deserialize>(&mut self) -> Result<T> {
        if self.consume()? != b':' {
            return Err(Error::InvalidType("expected :".to_string()));
        }
        T::deserialize(self)
    }

    fn end_map(&mut self) -> Result<()> {
        if self.consume()? != b'}' {
            return Err(Error::InvalidType("expected }".to_string()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialize_primitives() {
        assert_eq!(to_json(&true).unwrap(), "true");
        assert_eq!(to_json(&42i32).unwrap(), "42");
        assert_eq!(to_json(&3.14f64).unwrap(), "3.14");
        assert_eq!(to_json(&"hello").unwrap(), "\"hello\"");
    }

    #[test]
    fn test_serialize_vec() {
        let vec = vec![1, 2, 3];
        let json = to_json(&vec).unwrap();
        assert!(json.contains("1"));
        assert!(json.contains("2"));
        assert!(json.contains("3"));
    }

    #[test]
    fn test_deserialize_primitives() {
        assert_eq!(from_json::<bool>("true").unwrap(), true);
        assert_eq!(from_json::<i32>("42").unwrap(), 42);
        assert_eq!(from_json::<String>("\"hello\"").unwrap(), "hello");
    }
}
