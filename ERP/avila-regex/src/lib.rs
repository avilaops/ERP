//! Avila Regex - Motor de regex completo e nativo
//! Zero dependências - substitui regex crate
//!
//! ## Features
//! - Classes de caracteres: [a-z], [^0-9], \d, \w, \s
//! - Quantificadores: *, +, ?, {n}, {n,}, {n,m}
//! - Grupos de captura: (pattern)
//! - Alternação: pattern1|pattern2
//! - Âncoras: ^, $, \b
//! - Escape: \., \*, \\
//! - Greedy e lazy: *?, +?, ??
//!
//! ## Examples
//! ```
//! use avila_regex::Regex;
//!
//! let re = Regex::new(r"\d{3}-\d{4}").unwrap();
//! assert!(re.is_match("123-4567"));
//!
//! let re = Regex::new(r"(\w+)@(\w+\.\w+)").unwrap();
//! let caps = re.captures("user@example.com").unwrap();
//! assert_eq!(caps.get(1), Some("user"));
//! assert_eq!(caps.get(2), Some("example.com"));
//! ```

mod ast;
mod parser;
mod compiler;
mod vm;

use parser::Parser;
use compiler::Compiler;
use vm::Vm;

/// Erro de compilação de regex
#[derive(Debug, Clone, PartialEq)]
pub enum Error {
    /// Padrão inválido
    InvalidPattern(String),
    /// Grupo não fechado
    UnclosedGroup,
    /// Colchete não fechado
    UnclosedBracket,
    /// Quantificador inválido
    InvalidQuantifier,
    /// Backreference inválido
    InvalidBackreference,
    /// Escape inválido
    InvalidEscape,
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::InvalidPattern(msg) => write!(f, "Invalid pattern: {}", msg),
            Error::UnclosedGroup => write!(f, "Unclosed group"),
            Error::UnclosedBracket => write!(f, "Unclosed bracket"),
            Error::InvalidQuantifier => write!(f, "Invalid quantifier"),
            Error::InvalidBackreference => write!(f, "Invalid backreference"),
            Error::InvalidEscape => write!(f, "Invalid escape sequence"),
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

/// Motor de regex compilado
pub struct Regex {
    pattern: String,
    vm: Vm,
}

impl Regex {
    /// Compila um novo regex
    pub fn new(pattern: &str) -> Result<Self> {
        let parser = Parser::new(pattern);
        let ast = parser.parse()?;
        let compiler = Compiler::new();
        let vm = compiler.compile(&ast)?;

        Ok(Self {
            pattern: pattern.to_string(),
            vm,
        })
    }

    /// Verifica se há match
    pub fn is_match(&self, text: &str) -> bool {
        self.find(text).is_some()
    }

    /// Encontra primeiro match
    pub fn find(&self, text: &str) -> Option<Match> {
        self.vm.find(text)
    }

    /// Encontra todos os matches
    pub fn find_iter<'r, 't>(&'r self, text: &'t str) -> FindIter<'r, 't> {
        FindIter {
            regex: self,
            text,
            last_end: 0,
        }
    }

    /// Captura grupos
    pub fn captures<'t>(&self, text: &'t str) -> Option<Captures<'t>> {
        self.vm.captures(text)
    }

    /// Substitui primeiro match
    pub fn replace(&self, text: &str, replacement: &str) -> String {
        if let Some(m) = self.find(text) {
            let mut result = String::new();
            result.push_str(&text[..m.start]);
            result.push_str(replacement);
            result.push_str(&text[m.end..]);
            result
        } else {
            text.to_string()
        }
    }

    /// Substitui todos os matches
    pub fn replace_all(&self, text: &str, replacement: &str) -> String {
        let mut result = String::new();
        let mut last_end = 0;

        for m in self.find_iter(text) {
            result.push_str(&text[last_end..m.start]);
            result.push_str(replacement);
            last_end = m.end;
        }

        result.push_str(&text[last_end..]);
        result
    }

    /// Separa string por regex
    pub fn split<'r, 't>(&'r self, text: &'t str) -> Split<'r, 't> {
        Split {
            finder: self.find_iter(text),
            last: 0,
        }
    }

    /// Retorna o padrão
    pub fn as_str(&self) -> &str {
        &self.pattern
    }
}

/// Match de regex
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Match {
    pub start: usize,
    pub end: usize,
}

impl Match {
    pub fn new(start: usize, end: usize) -> Self {
        Self { start, end }
    }

    pub fn as_str<'a>(&self, text: &'a str) -> &'a str {
        &text[self.start..self.end]
    }

    pub fn len(&self) -> usize {
        self.end - self.start
    }

    pub fn is_empty(&self) -> bool {
        self.start == self.end
    }
}

/// Grupos capturados
pub struct Captures<'t> {
    text: &'t str,
    groups: Vec<Option<Match>>,
}

impl<'t> Captures<'t> {
    pub fn new(text: &'t str, groups: Vec<Option<Match>>) -> Self {
        Self { text, groups }
    }

    /// Retorna o match completo (grupo 0)
    pub fn get(&self, index: usize) -> Option<&str> {
        self.groups.get(index)
            .and_then(|m| m.as_ref())
            .map(|m| m.as_str(self.text))
    }

    /// Número de grupos
    pub fn len(&self) -> usize {
        self.groups.len()
    }

    pub fn is_empty(&self) -> bool {
        self.groups.is_empty()
    }

    /// Itera sobre todos os grupos
    pub fn iter(&self) -> impl Iterator<Item = Option<&str>> + '_ {
        self.groups.iter().map(|m| m.as_ref().map(|m| m.as_str(self.text)))
    }
}

/// Iterator de matches
pub struct FindIter<'r, 't> {
    regex: &'r Regex,
    text: &'t str,
    last_end: usize,
}

impl<'r, 't> Iterator for FindIter<'r, 't> {
    type Item = Match;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.last_end > self.text.len() {
                return None;
            }

            let text = &self.text[self.last_end..];
            if let Some(mut m) = self.regex.vm.find(text) {
                m.start += self.last_end;
                m.end += self.last_end;

                if m.is_empty() {
                    self.last_end = m.start + 1;
                    continue;
                }

                self.last_end = m.end;
                return Some(m);
            } else {
                return None;
            }
        }
    }
}

/// Split por regex
pub struct Split<'r, 't> {
    finder: FindIter<'r, 't>,
    last: usize,
}

impl<'r, 't> Iterator for Split<'r, 't> {
    type Item = &'t str;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            match self.finder.next() {
                Some(m) if !m.is_empty() => {
                    let result = &self.finder.text[self.last..m.start];
                    self.last = m.end;
                    return Some(result);
                }
                Some(_) => continue,
                None => {
                    if self.last <= self.finder.text.len() {
                        let result = &self.finder.text[self.last..];
                        self.last = self.finder.text.len() + 1;
                        return Some(result);
                    } else {
                        return None;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_literal() {
        let re = Regex::new("hello").unwrap();
        assert!(re.is_match("hello"));
        assert!(re.is_match("hello world"));
        assert!(!re.is_match("hi"));
    }

    #[test]
    fn test_dot() {
        let re = Regex::new("h.llo").unwrap();
        assert!(re.is_match("hello"));
        assert!(re.is_match("hallo"));
        assert!(!re.is_match("hllo"));
    }

    #[test]
    fn test_anchors() {
        let re = Regex::new("^hello$").unwrap();
        assert!(re.is_match("hello"));
        assert!(!re.is_match("hello world"));

        let re = Regex::new("^hello").unwrap();
        assert!(re.is_match("hello world"));
        assert!(!re.is_match("say hello"));

        let re = Regex::new("world$").unwrap();
        assert!(re.is_match("hello world"));
        assert!(!re.is_match("world hello"));
    }

    #[test]
    fn test_char_class() {
        let re = Regex::new("[a-z]").unwrap();
        assert!(re.is_match("a"));
        assert!(re.is_match("z"));
        assert!(!re.is_match("A"));

        let re = Regex::new("[^0-9]").unwrap();
        assert!(re.is_match("a"));
        assert!(!re.is_match("5"));
    }

    #[test]
    fn test_meta_class() {
        let re = Regex::new(r"\d+").unwrap();
        assert!(re.is_match("123"));
        assert!(!re.is_match("abc"));

        let re = Regex::new(r"\w+").unwrap();
        assert!(re.is_match("hello"));
        assert!(re.is_match("test_123"));

        let re = Regex::new(r"\s+").unwrap();
        assert!(re.is_match("  "));
        assert!(!re.is_match("abc"));
    }

    #[test]
    fn test_quantifiers() {
        let re = Regex::new("a*").unwrap();
        assert!(re.is_match(""));
        assert!(re.is_match("aaa"));

        let re = Regex::new("a+").unwrap();
        assert!(re.is_match("a"));
        assert!(!re.is_match(""));

        let re = Regex::new("a?").unwrap();
        assert!(re.is_match(""));
        assert!(re.is_match("a"));

        let re = Regex::new("a{3}").unwrap();
        assert!(re.is_match("aaa"));
        assert!(!re.is_match("aa"));

        let re = Regex::new("a{2,4}").unwrap();
        assert!(re.is_match("aa"));
        assert!(re.is_match("aaaa"));
        assert!(!re.is_match("a"));
    }

    #[test]
    fn test_groups() {
        let re = Regex::new(r"(\w+)@(\w+)").unwrap();
        let caps = re.captures("user@example").unwrap();
        assert_eq!(caps.get(0), Some("user@example"));
        assert_eq!(caps.get(1), Some("user"));
        assert_eq!(caps.get(2), Some("example"));
    }

    #[test]
    fn test_alternation() {
        let re = Regex::new("cat|dog").unwrap();
        assert!(re.is_match("cat"));
        assert!(re.is_match("dog"));
        assert!(!re.is_match("bird"));
    }

    #[test]
    fn test_complex_pattern() {
        // Email regex
        let re = Regex::new(r"^\w+@\w+\.\w+$").unwrap();
        assert!(re.is_match("user@example.com"));
        assert!(!re.is_match("invalid.email"));

        // Phone number
        let re = Regex::new(r"^\d{3}-\d{4}$").unwrap();
        assert!(re.is_match("123-4567"));
        assert!(!re.is_match("12-34567"));
    }

    #[test]
    fn test_replace() {
        let re = Regex::new("world").unwrap();
        assert_eq!(re.replace("hello world", "Rust"), "hello Rust");
    }

    #[test]
    fn test_replace_all() {
        let re = Regex::new(r"\d+").unwrap();
        assert_eq!(re.replace_all("abc 123 def 456", "X"), "abc X def X");
    }

    #[test]
    fn test_find_iter() {
        let re = Regex::new(r"\d+").unwrap();
        let matches: Vec<_> = re.find_iter("a1b22c333")
            .map(|m| m.as_str("a1b22c333"))
            .collect();
        assert_eq!(matches, vec!["1", "22", "333"]);
    }

    #[test]
    fn test_split() {
        let re = Regex::new(r"\s+").unwrap();
        let parts: Vec<_> = re.split("hello  world   rust").collect();
        assert_eq!(parts, vec!["hello", "world", "rust"]);
    }

    #[test]
    fn test_escape() {
        let re = Regex::new(r"\.").unwrap();
        assert!(re.is_match("."));
        assert!(!re.is_match("a"));

        let re = Regex::new(r"\*").unwrap();
        assert!(re.is_match("*"));
    }

    #[test]
    fn test_greedy_vs_lazy() {
        let re = Regex::new(r"a+").unwrap();
        let m = re.find("aaaa").unwrap();
        assert_eq!(m.len(), 4); // greedy

        let re = Regex::new(r"a+?").unwrap();
        let m = re.find("aaaa").unwrap();
        assert_eq!(m.len(), 1); // lazy
    }
}
