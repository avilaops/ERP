//! AST (Abstract Syntax Tree) para regex

/// Nó da árvore sintática
#[derive(Debug, Clone, PartialEq)]
pub enum Ast {
    /// Caractere literal
    Literal(char),

    /// Classe de caracteres [a-z]
    CharClass {
        negated: bool,
        ranges: Vec<(char, char)>,
    },

    /// Metacaracteres \d, \w, \s, etc
    MetaClass(MetaClass),

    /// Qualquer caractere .
    Dot,

    /// Concatenação de padrões
    Concat(Vec<Ast>),

    /// Alternação pattern1|pattern2
    Alternation(Vec<Ast>),

    /// Grupo de captura (pattern)
    Group(Box<Ast>),

    /// Quantificador *, +, ?, {n}, {n,m}
    Quantifier {
        expr: Box<Ast>,
        min: usize,
        max: Option<usize>,
        greedy: bool,
    },

    /// Âncora ^ (início) ou $ (fim)
    Anchor(Anchor),

    /// Boundary \b
    WordBoundary,

    /// Empty (epsilon)
    Empty,
}

/// Metacaracteres de classe
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MetaClass {
    /// \d - dígitos [0-9]
    Digit,
    /// \D - não-dígitos
    NotDigit,
    /// \w - word [a-zA-Z0-9_]
    Word,
    /// \W - não-word
    NotWord,
    /// \s - whitespace [ \t\n\r]
    Space,
    /// \S - não-whitespace
    NotSpace,
}

impl MetaClass {
    pub fn matches(&self, ch: char) -> bool {
        match self {
            MetaClass::Digit => ch.is_ascii_digit(),
            MetaClass::NotDigit => !ch.is_ascii_digit(),
            MetaClass::Word => ch.is_ascii_alphanumeric() || ch == '_',
            MetaClass::NotWord => !(ch.is_ascii_alphanumeric() || ch == '_'),
            MetaClass::Space => ch.is_ascii_whitespace(),
            MetaClass::NotSpace => !ch.is_ascii_whitespace(),
        }
    }
}

/// Tipo de âncora
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Anchor {
    /// ^ - início da string
    Start,
    /// $ - fim da string
    End,
}

impl Ast {
    /// Cria concatenação otimizada
    pub fn concat(nodes: Vec<Ast>) -> Ast {
        match nodes.len() {
            0 => Ast::Empty,
            1 => nodes.into_iter().next().unwrap(),
            _ => Ast::Concat(nodes),
        }
    }

    /// Cria alternação otimizada
    pub fn alternation(nodes: Vec<Ast>) -> Ast {
        match nodes.len() {
            0 => Ast::Empty,
            1 => nodes.into_iter().next().unwrap(),
            _ => Ast::Alternation(nodes),
        }
    }

    /// Cria quantificador
    pub fn quantifier(expr: Ast, min: usize, max: Option<usize>, greedy: bool) -> Ast {
        Ast::Quantifier {
            expr: Box::new(expr),
            min,
            max,
            greedy,
        }
    }

    /// Cria grupo
    pub fn group(expr: Ast) -> Ast {
        Ast::Group(Box::new(expr))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_meta_class_digit() {
        assert!(MetaClass::Digit.matches('5'));
        assert!(!MetaClass::Digit.matches('a'));
    }

    #[test]
    fn test_meta_class_word() {
        assert!(MetaClass::Word.matches('a'));
        assert!(MetaClass::Word.matches('_'));
        assert!(!MetaClass::Word.matches(' '));
    }

    #[test]
    fn test_concat() {
        let ast = Ast::concat(vec![Ast::Literal('a'), Ast::Literal('b')]);
        assert!(matches!(ast, Ast::Concat(_)));
    }
}
