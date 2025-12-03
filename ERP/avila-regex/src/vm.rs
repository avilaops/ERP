//! Máquina virtual de execução de regex (Thompson NFA)

use crate::ast::MetaClass;
use crate::{Captures, Match};

/// Instrução de bytecode
#[derive(Debug, Clone)]
pub enum Inst {
    /// Match específico de caractere
    Char(char),

    /// Match qualquer caractere (.)
    Any,

    /// Match classe de caracteres
    CharClass {
        negated: bool,
        ranges: Vec<(char, char)>,
    },

    /// Match metaclasse (\d, \w, \s)
    MetaClass(MetaClass),

    /// Split execution (não-determinismo)
    Split(usize, usize),

    /// Jump incondicional
    Jump(usize),

    /// Salva posição para grupo
    Save(usize),

    /// Âncora de início ^
    AnchorStart,

    /// Âncora de fim $
    AnchorEnd,

    /// Word boundary \b
    WordBoundary,

    /// Match bem-sucedido
    Match,
}

/// Thread de execução
#[derive(Debug, Clone)]
struct Thread {
    pc: usize,
    saves: Vec<usize>,
}

impl Thread {
    fn new(pc: usize, save_count: usize) -> Self {
        Self {
            pc,
            saves: vec![0; save_count],
        }
    }
}

/// Máquina virtual
pub struct Vm {
    pub insts: Vec<Inst>,
    group_count: usize,
}

impl Vm {
    pub fn new(insts: Vec<Inst>, group_count: usize) -> Self {
        Self {
            insts,
            group_count,
        }
    }

    pub fn find(&self, text: &str) -> Option<Match> {
        // Try matching from each position
        for start in 0..=text.len() {
            if let Some(end) = self.execute(&text[start..], start) {
                return Some(Match::new(start, end));
            }
        }
        None
    }

    pub fn captures<'t>(&self, text: &'t str) -> Option<Captures<'t>> {
        for start in 0..=text.len() {
            if let Some((end, saves)) = self.execute_with_saves(&text[start..], start) {
                let mut groups = vec![Some(Match::new(start, end))];

                for i in 0..self.group_count {
                    let group_start = saves[i * 2];
                    let group_end = saves[i * 2 + 1];

                    if group_start != usize::MAX && group_end != usize::MAX {
                        groups.push(Some(Match::new(group_start, group_end)));
                    } else {
                        groups.push(None);
                    }
                }

                return Some(Captures::new(text, groups));
            }
        }
        None
    }

    fn execute(&self, text: &str, offset: usize) -> Option<usize> {
        let chars: Vec<char> = text.chars().collect();
        let mut clist = vec![Thread::new(0, self.group_count * 2)];
        let mut nlist = Vec::<Thread>::new();
        let mut first_match_pos = None;
        let mut last_match_pos = None;

        // Check if this is a lazy match by looking for Split with higher priority on second branch
        let is_lazy = self.insts.iter().any(|inst| {
            if let Inst::Split(a, b) = inst {
                b < a // Lazy has lower address (skip) as first choice
            } else {
                false
            }
        });

        for pos in 0..=chars.len() {
            // Add epsilon transitions
            self.add_epsilon_threads(&mut clist, &chars, pos, offset);

            // Check if any thread reached Match
            for thread in &clist {
                if thread.pc < self.insts.len() && matches!(self.insts[thread.pc], Inst::Match) {
                    if first_match_pos.is_none() {
                        first_match_pos = Some(offset + pos);
                    }
                    last_match_pos = Some(offset + pos);
                }
            }

            // For lazy, return first match immediately
            if is_lazy && first_match_pos.is_some() {
                return first_match_pos;
            }

            // Try matching current character
            for thread in clist.drain(..) {
                self.step_char(thread, &chars, pos, &mut nlist, offset);
            }

            std::mem::swap(&mut clist, &mut nlist);
            nlist.clear();

            // If no more threads and we had a match, return it
            if clist.is_empty() && last_match_pos.is_some() {
                return last_match_pos;
            }
        }

        last_match_pos
    }    fn execute_with_saves(&self, text: &str, offset: usize) -> Option<(usize, Vec<usize>)> {
        let chars: Vec<char> = text.chars().collect();
        let mut clist = vec![Thread::new(0, self.group_count * 2)];
        let mut nlist = Vec::<Thread>::new();
        let mut first_match = None;
        let mut last_match = None;

        for save in &mut clist[0].saves {
            *save = usize::MAX;
        }

        // Check if this is a lazy match
        let is_lazy = self.insts.iter().any(|inst| {
            if let Inst::Split(a, b) = inst {
                b < a
            } else {
                false
            }
        });

        for pos in 0..=chars.len() {
            // Add epsilon transitions
            self.add_epsilon_threads(&mut clist, &chars, pos, offset);

            // Check for matches
            for thread in &clist {
                if thread.pc < self.insts.len() && matches!(self.insts[thread.pc], Inst::Match) {
                    if first_match.is_none() {
                        first_match = Some((offset + pos, thread.saves.clone()));
                    }
                    last_match = Some((offset + pos, thread.saves.clone()));
                }
            }

            // For lazy, return first match immediately
            if is_lazy && first_match.is_some() {
                return first_match;
            }

            // Try matching current character
            for thread in clist.drain(..) {
                self.step_char(thread, &chars, pos, &mut nlist, offset);
            }

            std::mem::swap(&mut clist, &mut nlist);
            nlist.clear();

            // If no more threads and we had a match, return it
            if clist.is_empty() && last_match.is_some() {
                return last_match;
            }
        }

        last_match
    }    fn add_epsilon_threads(&self, clist: &mut Vec<Thread>, chars: &[char], pos: usize, offset: usize) {
        let mut worklist = std::mem::take(clist);
        let mut visited = std::collections::HashSet::new();

        while let Some(thread) = worklist.pop() {
            if visited.contains(&thread.pc) {
                continue;
            }
            visited.insert(thread.pc);

            if thread.pc >= self.insts.len() {
                continue;
            }

            match &self.insts[thread.pc] {
                Inst::Split(a, b) => {
                    worklist.push(Thread { pc: *a, saves: thread.saves.clone() });
                    worklist.push(Thread { pc: *b, saves: thread.saves.clone() });
                }
                Inst::Jump(target) => {
                    worklist.push(Thread { pc: *target, saves: thread.saves.clone() });
                }
                Inst::Save(slot) => {
                    let mut new_thread = thread.clone();
                    if *slot < new_thread.saves.len() {
                        new_thread.saves[*slot] = offset + pos;
                    }
                    new_thread.pc += 1;
                    worklist.push(new_thread);
                }
                Inst::AnchorStart => {
                    if offset + pos == 0 {
                        let mut new_thread = thread.clone();
                        new_thread.pc += 1;
                        worklist.push(new_thread);
                    }
                }
                Inst::AnchorEnd => {
                    if pos == chars.len() {
                        let mut new_thread = thread.clone();
                        new_thread.pc += 1;
                        worklist.push(new_thread);
                    }
                }
                Inst::WordBoundary => {
                    if self.is_word_boundary(chars, pos) {
                        let mut new_thread = thread.clone();
                        new_thread.pc += 1;
                        worklist.push(new_thread);
                    }
                }
                Inst::Match => {
                    clist.push(thread);
                }
                _ => {
                    clist.push(thread);
                }
            }
        }
    }

    fn step_char(&self, thread: Thread, chars: &[char], pos: usize, nlist: &mut Vec<Thread>, offset: usize) {
        if thread.pc >= self.insts.len() {
            return;
        }

        let inst = &self.insts[thread.pc];

        match inst {
            Inst::Char(ch) => {
                if pos < chars.len() && chars[pos] == *ch {
                    let mut new_thread = thread.clone();
                    new_thread.pc += 1;
                    nlist.push(new_thread);
                }
            }
            Inst::Any => {
                if pos < chars.len() && chars[pos] != '\n' {
                    let mut new_thread = thread.clone();
                    new_thread.pc += 1;
                    nlist.push(new_thread);
                }
            }
            Inst::CharClass { negated, ranges } => {
                if pos < chars.len() {
                    let ch = chars[pos];
                    let matches = ranges.iter().any(|(start, end)| ch >= *start && ch <= *end);
                    let result = if *negated { !matches } else { matches };

                    if result {
                        let mut new_thread = thread.clone();
                        new_thread.pc += 1;
                        nlist.push(new_thread);
                    }
                }
            }
            Inst::MetaClass(meta) => {
                if pos < chars.len() && meta.matches(chars[pos]) {
                    let mut new_thread = thread.clone();
                    new_thread.pc += 1;
                    nlist.push(new_thread);
                }
            }
            Inst::Save(slot) => {
                let mut new_thread = thread.clone();
                if *slot < new_thread.saves.len() {
                    new_thread.saves[*slot] = offset + pos;
                }
                new_thread.pc += 1;
                nlist.push(new_thread);
            }
            _ => {}
        }
    }

    fn is_word_boundary(&self, chars: &[char], pos: usize) -> bool {
        let prev_is_word = if pos > 0 {
            MetaClass::Word.matches(chars[pos - 1])
        } else {
            false
        };

        let curr_is_word = if pos < chars.len() {
            MetaClass::Word.matches(chars[pos])
        } else {
            false
        };

        prev_is_word != curr_is_word
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vm_char() {
        let vm = Vm::new(vec![Inst::Char('a'), Inst::Match], 0);
        assert!(vm.find("a").is_some());
        assert!(vm.find("b").is_none());
    }

    #[test]
    fn test_vm_quantifier() {
        let vm = Vm::new(vec![
            Inst::Split(1, 3),
            Inst::Char('a'),
            Inst::Jump(0),
            Inst::Match,
        ], 0);
        assert!(vm.find("").is_some()); // a* matches empty string
        assert!(vm.find("aaa").is_some());
        assert!(vm.find("b").is_some()); // a* matches empty string before 'b'
    }
}
