//! Compilador de AST para bytecode

use crate::ast::{Anchor, Ast};
use crate::vm::{Inst, Vm};
use crate::Result;

pub struct Compiler {
    insts: Vec<Inst>,
    group_count: usize,
}

impl Compiler {
    pub fn new() -> Self {
        Self {
            insts: Vec::new(),
            group_count: 0,
        }
    }

    pub fn compile(mut self, ast: &Ast) -> Result<Vm> {
        self.compile_ast(ast)?;
        self.insts.push(Inst::Match);

        Ok(Vm::new(self.insts, self.group_count))
    }

    fn compile_ast(&mut self, ast: &Ast) -> Result<()> {
        match ast {
            Ast::Literal(ch) => {
                self.insts.push(Inst::Char(*ch));
            }

            Ast::Dot => {
                self.insts.push(Inst::Any);
            }

            Ast::CharClass { negated, ranges } => {
                self.insts.push(Inst::CharClass {
                    negated: *negated,
                    ranges: ranges.clone(),
                });
            }

            Ast::MetaClass(meta) => {
                self.insts.push(Inst::MetaClass(*meta));
            }

            Ast::Concat(nodes) => {
                for node in nodes {
                    self.compile_ast(node)?;
                }
            }

            Ast::Alternation(nodes) => {
                if nodes.len() != 2 {
                    // For now, only support binary alternation
                    return Err(crate::Error::InvalidPattern("Only binary alternation supported".to_string()));
                }

                // For A|B: Split(1, len(A)+2), A, Jump(end), B
                let split_pos = self.insts.len();
                self.insts.push(Inst::Split(split_pos + 1, usize::MAX));

                // Compile first alternative
                self.compile_ast(&nodes[0])?;

                // Jump to end after matching first
                let jump_pos = self.insts.len();
                self.insts.push(Inst::Jump(usize::MAX));

                // Second alternative starts here
                let alt2_start = self.insts.len();

                // Compile second alternative
                self.compile_ast(&nodes[1])?;

                // Patch split to point to second alternative
                if let Inst::Split(_, ref mut alt2) = self.insts[split_pos] {
                    *alt2 = alt2_start;
                }

                // Patch jump to point to end
                let end_pos = self.insts.len();
                if let Inst::Jump(ref mut target) = self.insts[jump_pos] {
                    *target = end_pos;
                }
            }

            Ast::Group(expr) => {
                let group_id = self.group_count;
                self.group_count += 1;

                self.insts.push(Inst::Save(group_id * 2));
                self.compile_ast(expr)?;
                self.insts.push(Inst::Save(group_id * 2 + 1));
            }

            Ast::Quantifier { expr, min, max, greedy } => {
                self.compile_quantifier(expr, *min, *max, *greedy)?;
            }

            Ast::Anchor(anchor) => {
                self.insts.push(match anchor {
                    Anchor::Start => Inst::AnchorStart,
                    Anchor::End => Inst::AnchorEnd,
                });
            }

            Ast::WordBoundary => {
                self.insts.push(Inst::WordBoundary);
            }

            Ast::Empty => {}
        }

        Ok(())
    }

    fn compile_quantifier(
        &mut self,
        expr: &Ast,
        min: usize,
        max: Option<usize>,
        greedy: bool,
    ) -> Result<()> {
        match max {
            Some(max) if max == min => {
                // Exact count
                for _ in 0..min {
                    self.compile_ast(expr)?;
                }
            }
            Some(max) => {
                // Limited repetition {min,max}
                // Compile minimum required
                for _ in 0..min {
                    self.compile_ast(expr)?;
                }

                // Compile optional matches
                for _ in min..max {
                    let split_pos = self.insts.len();
                    self.insts.push(Inst::Split(usize::MAX, usize::MAX));

                    self.compile_ast(expr)?;

                    let end_pos = self.insts.len();
                    if let Inst::Split(ref mut a, ref mut b) = self.insts[split_pos] {
                        if greedy {
                            *a = split_pos + 1;
                            *b = end_pos + 1;
                        } else {
                            *a = end_pos + 1;
                            *b = split_pos + 1;
                        }
                    }
                    self.insts.push(Inst::Jump(end_pos + 1));
                }
            }
            None => {
                // Unbounded repetition (*, +)
                // Compile minimum required occurrences first
                for _ in 0..min {
                    self.compile_ast(expr)?;
                }

                // Then add the loop for additional matches
                let split_pos = self.insts.len();
                self.insts.push(Inst::Split(usize::MAX, usize::MAX));

                self.compile_ast(expr)?;

                self.insts.push(Inst::Jump(split_pos));

                let end_pos = self.insts.len();
                if let Inst::Split(ref mut a, ref mut b) = self.insts[split_pos] {
                    if greedy {
                        *a = split_pos + 1;
                        *b = end_pos;
                    } else {
                        *a = end_pos;
                        *b = split_pos + 1;
                    }
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::Parser;

    #[test]
    fn test_compile_plus() {
        let parser = Parser::new("a+");
        let ast = parser.parse().unwrap();
        let compiler = Compiler::new();
        let vm = compiler.compile(&ast).unwrap();
        println!("a+ bytecode:");
        for (i, inst) in vm.insts.iter().enumerate() {
            println!("{}: {:?}", i, inst);
        }
        assert!(!vm.insts.is_empty());
    }

    #[test]
    fn test_compile_quantifier() {
        let parser = Parser::new("a*");
        let ast = parser.parse().unwrap();
        let compiler = Compiler::new();
        let vm = compiler.compile(&ast).unwrap();
        println!("Quantifier bytecode:");
        for (i, inst) in vm.insts.iter().enumerate() {
            println!("{}: {:?}", i, inst);
        }
        assert!(!vm.insts.is_empty());
    }

    #[test]
    fn test_compile_alternation() {
        let parser = Parser::new("cat|dog");
        let ast = parser.parse().unwrap();
        let compiler = Compiler::new();
        let vm = compiler.compile(&ast).unwrap();
        println!("Alternation bytecode:");
        for (i, inst) in vm.insts.iter().enumerate() {
            println!("{}: {:?}", i, inst);
        }
        assert!(!vm.insts.is_empty());
    }
}
