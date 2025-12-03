//! Avila Terminal - AVL Platform terminal colors
//! Replacement for colored - 100% Rust std
//! ANSI escape codes for terminal coloring

use std::fmt;

/// Color codes
#[derive(Debug, Clone, Copy)]
pub enum Color {
    Black,
    Red,
    Green,
    Yellow,
    Blue,
    Magenta,
    Cyan,
    White,
    BrightBlack,
    BrightRed,
    BrightGreen,
    BrightYellow,
    BrightBlue,
    BrightMagenta,
    BrightCyan,
    BrightWhite,
}

impl Color {
    fn fg_code(self) -> &'static str {
        match self {
            Color::Black => "30",
            Color::Red => "31",
            Color::Green => "32",
            Color::Yellow => "33",
            Color::Blue => "34",
            Color::Magenta => "35",
            Color::Cyan => "36",
            Color::White => "37",
            Color::BrightBlack => "90",
            Color::BrightRed => "91",
            Color::BrightGreen => "92",
            Color::BrightYellow => "93",
            Color::BrightBlue => "94",
            Color::BrightMagenta => "95",
            Color::BrightCyan => "96",
            Color::BrightWhite => "97",
        }
    }
}

/// Colored string wrapper
pub struct ColoredString {
    text: String,
    fg: Option<Color>,
    bold: bool,
    underline: bool,
}

impl ColoredString {
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            fg: None,
            bold: false,
            underline: false,
        }
    }

    pub fn color(mut self, color: Color) -> Self {
        self.fg = Some(color);
        self
    }

    pub fn bold(mut self) -> Self {
        self.bold = true;
        self
    }

    pub fn underline(mut self) -> Self {
        self.underline = true;
        self
    }

    // Convenience methods
    pub fn red(self) -> Self {
        self.color(Color::Red)
    }

    pub fn green(self) -> Self {
        self.color(Color::Green)
    }

    pub fn yellow(self) -> Self {
        self.color(Color::Yellow)
    }

    pub fn blue(self) -> Self {
        self.color(Color::Blue)
    }

    pub fn magenta(self) -> Self {
        self.color(Color::Magenta)
    }

    pub fn cyan(self) -> Self {
        self.color(Color::Cyan)
    }

    pub fn white(self) -> Self {
        self.color(Color::White)
    }

    pub fn bright_black(self) -> Self {
        self.color(Color::BrightBlack)
    }

    pub fn bright_red(self) -> Self {
        self.color(Color::BrightRed)
    }

    pub fn bright_blue(self) -> Self {
        self.color(Color::BrightBlue)
    }
}

impl fmt::Display for ColoredString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut codes = Vec::new();

        if self.bold {
            codes.push("1");
        }
        if self.underline {
            codes.push("4");
        }
        if let Some(color) = self.fg {
            codes.push(color.fg_code());
        }

        if codes.is_empty() {
            write!(f, "{}", self.text)
        } else {
            write!(f, "\x1b[{}m{}\x1b[0m", codes.join(";"), self.text)
        }
    }
}

/// Trait to add coloring methods to strings
pub trait Colorize {
    fn color(self, color: Color) -> ColoredString;
    fn red(self) -> ColoredString;
    fn green(self) -> ColoredString;
    fn yellow(self) -> ColoredString;
    fn blue(self) -> ColoredString;
    fn magenta(self) -> ColoredString;
    fn cyan(self) -> ColoredString;
    fn white(self) -> ColoredString;
    fn bright_black(self) -> ColoredString;
    fn bright_blue(self) -> ColoredString;
    fn bold(self) -> ColoredString;
}

impl Colorize for String {
    fn color(self, color: Color) -> ColoredString {
        ColoredString::new(self).color(color)
    }

    fn red(self) -> ColoredString {
        ColoredString::new(self).red()
    }

    fn green(self) -> ColoredString {
        ColoredString::new(self).green()
    }

    fn yellow(self) -> ColoredString {
        ColoredString::new(self).yellow()
    }

    fn blue(self) -> ColoredString {
        ColoredString::new(self).blue()
    }

    fn magenta(self) -> ColoredString {
        ColoredString::new(self).magenta()
    }

    fn cyan(self) -> ColoredString {
        ColoredString::new(self).cyan()
    }

    fn white(self) -> ColoredString {
        ColoredString::new(self).white()
    }

    fn bright_black(self) -> ColoredString {
        ColoredString::new(self).bright_black()
    }

    fn bright_blue(self) -> ColoredString {
        ColoredString::new(self).bright_blue()
    }

    fn bold(self) -> ColoredString {
        ColoredString::new(self).bold()
    }
}

impl Colorize for &str {
    fn color(self, color: Color) -> ColoredString {
        ColoredString::new(self).color(color)
    }

    fn red(self) -> ColoredString {
        ColoredString::new(self).red()
    }

    fn green(self) -> ColoredString {
        ColoredString::new(self).green()
    }

    fn yellow(self) -> ColoredString {
        ColoredString::new(self).yellow()
    }

    fn blue(self) -> ColoredString {
        ColoredString::new(self).blue()
    }

    fn magenta(self) -> ColoredString {
        ColoredString::new(self).magenta()
    }

    fn cyan(self) -> ColoredString {
        ColoredString::new(self).cyan()
    }

    fn white(self) -> ColoredString {
        ColoredString::new(self).white()
    }

    fn bright_black(self) -> ColoredString {
        ColoredString::new(self).bright_black()
    }

    fn bright_blue(self) -> ColoredString {
        ColoredString::new(self).bright_blue()
    }

    fn bold(self) -> ColoredString {
        ColoredString::new(self).bold()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_colorize() {
        let colored = "Hello".red();
        let output = format!("{}", colored);
        assert!(output.contains("Hello"));
        assert!(output.contains("\x1b["));
    }

    #[test]
    fn test_bold() {
        let colored = "Bold text".bold();
        let output = format!("{}", colored);
        assert!(output.contains("Bold text"));
    }

    #[test]
    fn test_table() {
        let mut table = Table::new();
        table.header(vec!["Name".to_string(), "Age".to_string()]);
        table.row(vec!["Alice".to_string(), "30".to_string()]);
        table.row(vec!["Bob".to_string(), "25".to_string()]);
        let output = table.render();
        assert!(output.contains("Alice"));
        assert!(output.contains("Bob"));
    }
}

// ============================================================================
// Table Formatting - Substitui tabled
// ============================================================================

pub struct Table {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
    border_style: BorderStyle,
}

#[derive(Clone, Copy)]
pub enum BorderStyle {
    Simple,
    Unicode,
    None,
}

impl Table {
    pub fn new() -> Self {
        Self {
            headers: Vec::new(),
            rows: Vec::new(),
            border_style: BorderStyle::Simple,
        }
    }

    pub fn header(&mut self, headers: Vec<String>) -> &mut Self {
        self.headers = headers;
        self
    }

    pub fn row(&mut self, row: Vec<String>) -> &mut Self {
        self.rows.push(row);
        self
    }

    pub fn border_style(&mut self, style: BorderStyle) -> &mut Self {
        self.border_style = style;
        self
    }

    pub fn render(&self) -> String {
        if self.headers.is_empty() && self.rows.is_empty() {
            return String::new();
        }

        let col_count = if !self.headers.is_empty() {
            self.headers.len()
        } else {
            self.rows.first().map(|r| r.len()).unwrap_or(0)
        };

        let mut col_widths = vec![0; col_count];

        for (i, header) in self.headers.iter().enumerate() {
            col_widths[i] = col_widths[i].max(header.len());
        }

        for row in &self.rows {
            for (i, cell) in row.iter().enumerate() {
                if i < col_widths.len() {
                    col_widths[i] = col_widths[i].max(cell.len());
                }
            }
        }

        let mut output = String::new();

        let (border_h, border_v, border_cross) = match self.border_style {
            BorderStyle::Simple => ("-", "|", "+"),
            BorderStyle::Unicode => ("─", "│", "┼"),
            BorderStyle::None => ("", "", ""),
        };

        if matches!(self.border_style, BorderStyle::Simple | BorderStyle::Unicode) {
            let line = col_widths
                .iter()
                .map(|w| border_h.repeat(w + 2))
                .collect::<Vec<_>>()
                .join(border_cross);
            output.push_str(&format!("{}{}{}\n", border_cross, line, border_cross));
        }

        if !self.headers.is_empty() {
            let header_line = self
                .headers
                .iter()
                .enumerate()
                .map(|(i, h)| format!(" {:<width$} ", h, width = col_widths[i]))
                .collect::<Vec<_>>()
                .join(border_v);
            output.push_str(&format!("{}{}{}\n", border_v, header_line, border_v));

            if matches!(self.border_style, BorderStyle::Simple | BorderStyle::Unicode) {
                let line = col_widths
                    .iter()
                    .map(|w| border_h.repeat(w + 2))
                    .collect::<Vec<_>>()
                    .join(border_cross);
                output.push_str(&format!("{}{}{}\n", border_cross, line, border_cross));
            }
        }

        for row in &self.rows {
            let row_line = row
                .iter()
                .enumerate()
                .map(|(i, cell)| {
                    let width = if i < col_widths.len() {
                        col_widths[i]
                    } else {
                        0
                    };
                    format!(" {:<width$} ", cell, width = width)
                })
                .collect::<Vec<_>>()
                .join(border_v);
            output.push_str(&format!("{}{}{}\n", border_v, row_line, border_v));
        }

        if matches!(self.border_style, BorderStyle::Simple | BorderStyle::Unicode) {
            let line = col_widths
                .iter()
                .map(|w| border_h.repeat(w + 2))
                .collect::<Vec<_>>()
                .join(border_cross);
            output.push_str(&format!("{}{}{}\n", border_cross, line, border_cross));
        }

        output
    }
}

impl Default for Table {
    fn default() -> Self {
        Self::new()
    }
}
