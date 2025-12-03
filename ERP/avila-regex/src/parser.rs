//! Parser de regex para AST

use crate::ast::{Anchor, Ast, MetaClass};
use crate::{Error, Result};

pub struct Parser<'a> {
    input: &'a str,
    chars: std::iter::Peekable<std::str::CharIndices<'a>>,
}

impl<'a> Parser<'a> {
    pub fn new(input: &'a str) -> Self {
        Self {
            input,
            chars: input.char_indices().peekable(),
        }
    }

    pub fn parse(mut self) -> Result<Ast> {
        self.parse_alternation()
    }

    fn parse_alternation(&mut self) -> Result<Ast> {
        let mut alternatives = vec![self.parse_concat()?];

        while self.peek() == Some('|') {
            self.consume();
            alternatives.push(self.parse_concat()?);
        }

        Ok(Ast::alternation(alternatives))
    }

    fn parse_concat(&mut self) -> Result<Ast> {
        let mut nodes = Vec::new();

        while let Some(ch) = self.peek() {
            if ch == ')' || ch == '|' {
                break;
            }
            nodes.push(self.parse_quantified()?);
        }

        Ok(Ast::concat(nodes))
    }

    fn parse_quantified(&mut self) -> Result<Ast> {
        let expr = self.parse_atom()?;

        match self.peek() {
            Some('*') => {
                self.consume();
                let greedy = !self.check_lazy();
                Ok(Ast::quantifier(expr, 0, None, greedy))
            }
            Some('+') => {
                self.consume();
                let greedy = !self.check_lazy();
                Ok(Ast::quantifier(expr, 1, None, greedy))
            }
            Some('?') => {
                self.consume();
                let greedy = !self.check_lazy();
                Ok(Ast::quantifier(expr, 0, Some(1), greedy))
            }
            Some('{') => {
                self.consume();
                let (min, max) = self.parse_repeat_range()?;
                self.expect('}')?;
                let greedy = !self.check_lazy();
                Ok(Ast::quantifier(expr, min, max, greedy))
            }
            _ => Ok(expr),
        }
    }

    fn parse_atom(&mut self) -> Result<Ast> {
        match self.peek() {
            Some('.') => {
                self.consume();
                Ok(Ast::Dot)
            }
            Some('^') => {
                self.consume();
                Ok(Ast::Anchor(Anchor::Start))
            }
            Some('$') => {
                self.consume();
                Ok(Ast::Anchor(Anchor::End))
            }
            Some('(') => {
                self.consume();
                let expr = self.parse_alternation()?;
                if self.peek() != Some(')') {
                    return Err(Error::UnclosedGroup);
                }
                self.consume();
                Ok(Ast::group(expr))
            }
            Some('[') => self.parse_char_class(),
            Some('\\') => self.parse_escape(),
            Some(ch) if !is_meta(ch) => {
                self.consume();
                Ok(Ast::Literal(ch))
            }
            Some(ch) => Err(Error::InvalidPattern(format!("Unexpected character: {}", ch))),
            None => Ok(Ast::Empty),
        }
    }

    fn parse_char_class(&mut self) -> Result<Ast> {
        self.expect('[')?;

        let negated = if self.peek() == Some('^') {
            self.consume();
            true
        } else {
            false
        };

        let mut ranges = Vec::new();

        while self.peek() != Some(']') && self.peek().is_some() {
            let start = self.parse_class_char()?;

            if self.peek() == Some('-') && self.peek_ahead(1) != Some(']') {
                self.consume(); // consume '-'
                let end = self.parse_class_char()?;

                if start > end {
                    return Err(Error::InvalidPattern("Invalid character range".to_string()));
                }

                ranges.push((start, end));
            } else {
                ranges.push((start, start));
            }
        }

        if self.peek() != Some(']') {
            return Err(Error::UnclosedBracket);
        }
        self.consume();

        Ok(Ast::CharClass { negated, ranges })
    }

    fn parse_class_char(&mut self) -> Result<char> {
        match self.peek() {
            Some('\\') => {
                self.consume();
                match self.peek() {
                    Some('n') => { self.consume(); Ok('\n') }
                    Some('t') => { self.consume(); Ok('\t') }
                    Some('r') => { self.consume(); Ok('\r') }
                    Some(ch) => { self.consume(); Ok(ch) }
                    None => Err(Error::InvalidEscape),
                }
            }
            Some(ch) => {
                self.consume();
                Ok(ch)
            }
            None => Err(Error::UnclosedBracket),
        }
    }

    fn parse_escape(&mut self) -> Result<Ast> {
        self.expect('\\')?;

        match self.peek() {
            Some('d') => { self.consume(); Ok(Ast::MetaClass(MetaClass::Digit)) }
            Some('D') => { self.consume(); Ok(Ast::MetaClass(MetaClass::NotDigit)) }
            Some('w') => { self.consume(); Ok(Ast::MetaClass(MetaClass::Word)) }
            Some('W') => { self.consume(); Ok(Ast::MetaClass(MetaClass::NotWord)) }
            Some('s') => { self.consume(); Ok(Ast::MetaClass(MetaClass::Space)) }
            Some('S') => { self.consume(); Ok(Ast::MetaClass(MetaClass::NotSpace)) }
            Some('b') => { self.consume(); Ok(Ast::WordBoundary) }
            Some('n') => { self.consume(); Ok(Ast::Literal('\n')) }
            Some('t') => { self.consume(); Ok(Ast::Literal('\t')) }
            Some('r') => { self.consume(); Ok(Ast::Literal('\r')) }
            Some(ch) if is_meta(ch) => {
                self.consume();
                Ok(Ast::Literal(ch))
            }
            Some(_) => Err(Error::InvalidEscape),
            None => Err(Error::InvalidEscape),
        }
    }

    fn parse_repeat_range(&mut self) -> Result<(usize, Option<usize>)> {
        let min = self.parse_number()?;

        if self.peek() == Some(',') {
            self.consume();

            let max = if self.peek() == Some('}') {
                None
            } else {
                Some(self.parse_number()?)
            };

            Ok((min, max))
        } else {
            Ok((min, Some(min)))
        }
    }

    fn parse_number(&mut self) -> Result<usize> {
        let mut num = String::new();

        while let Some(ch) = self.peek() {
            if ch.is_ascii_digit() {
                num.push(ch);
                self.consume();
            } else {
                break;
            }
        }

        num.parse().map_err(|_| Error::InvalidQuantifier)
    }

    fn check_lazy(&mut self) -> bool {
        if self.peek() == Some('?') {
            self.consume();
            true
        } else {
            false
        }
    }

    fn peek(&mut self) -> Option<char> {
        self.chars.peek().map(|(_, ch)| *ch)
    }

    fn peek_ahead(&mut self, n: usize) -> Option<char> {
        self.input.chars().nth(self.chars.peek().map(|(i, _)| *i).unwrap_or(self.input.len()) + n)
    }

    fn consume(&mut self) -> Option<char> {
        self.chars.next().map(|(_, ch)| ch)
    }

    fn expect(&mut self, expected: char) -> Result<()> {
        if self.peek() == Some(expected) {
            self.consume();
            Ok(())
        } else {
            Err(Error::InvalidPattern(format!("Expected '{}'", expected)))
        }
    }
}

fn is_meta(ch: char) -> bool {
    matches!(ch, '.' | '^' | '$' | '*' | '+' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '|' | '\\')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_literal() {
        let parser = Parser::new("abc");
        let ast = parser.parse().unwrap();
        assert!(matches!(ast, Ast::Concat(_)));
    }

    #[test]
    fn test_parse_dot() {
        let parser = Parser::new("a.b");
        let ast = parser.parse().unwrap();
        assert!(matches!(ast, Ast::Concat(_)));
    }

    #[test]
    fn test_parse_quantifier() {
        let parser = Parser::new("a*");
        let ast = parser.parse().unwrap();
        assert!(matches!(ast, Ast::Quantifier { .. }));
    }

    #[test]
    fn test_parse_group() {
        let parser = Parser::new("(abc)");
        let ast = parser.parse().unwrap();
        assert!(matches!(ast, Ast::Group(_)));
    }

    #[test]
    fn test_parse_char_class() {
        let parser = Parser::new("[a-z]");
        let ast = parser.parse().unwrap();
        assert!(matches!(ast, Ast::CharClass { .. }));
    }

    #[test]
    fn test_parse_alternation() {
        let parser = Parser::new("a|b");
        let ast = parser.parse().unwrap();
        assert!(matches!(ast, Ast::Alternation(_)));
    }
}
