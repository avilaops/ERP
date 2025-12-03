//! Terminal utilities with colors

/// Colorize trait for strings
pub trait Colorize {
    fn cyan(&self) -> String;
    fn green(&self) -> String;
    fn red(&self) -> String;
    fn yellow(&self) -> String;
    fn bold(&self) -> String;
}

impl Colorize for str {
    fn cyan(&self) -> String { format!("\x1b[36m{}\x1b[0m", self) }
    fn green(&self) -> String { format!("\x1b[32m{}\x1b[0m", self) }
    fn red(&self) -> String { format!("\x1b[31m{}\x1b[0m", self) }
    fn yellow(&self) -> String { format!("\x1b[33m{}\x1b[0m", self) }
    fn bold(&self) -> String { format!("\x1b[1m{}\x1b[0m", self) }
}

impl Colorize for String {
    fn cyan(&self) -> String { self.as_str().cyan() }
    fn green(&self) -> String { self.as_str().green() }
    fn red(&self) -> String { self.as_str().red() }
    fn yellow(&self) -> String { self.as_str().yellow() }
    fn bold(&self) -> String { self.as_str().bold() }
}

/// Terminal interface
pub struct Terminal;

impl Terminal {
    pub fn new() -> Self { Terminal }
    pub fn print(&self, message: &str) { println!("{}", message); }
}

impl Default for Terminal {
    fn default() -> Self { Self::new() }
}
