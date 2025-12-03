//! Avila Log - Sistema de logging nativo completo
//! Substitui tracing/tracing-subscriber com zero dependências

use std::sync::{Mutex, Arc};

static LOGGER: Mutex<Option<Arc<dyn Logger + Send + Sync>>> = Mutex::new(None);
static GLOBAL_LEVEL: Mutex<Level> = Mutex::new(Level::Info);

// Filters armazenados em runtime inicialização
fn get_filters() -> &'static Mutex<std::collections::HashMap<String, Level>> {
    use std::sync::OnceLock;
    static FILTERS: OnceLock<Mutex<std::collections::HashMap<String, Level>>> = OnceLock::new();
    FILTERS.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

pub trait Logger: Send + Sync {
    fn log(&self, record: &Record);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Level {
    Trace = 0,
    Debug = 1,
    Info = 2,
    Warn = 3,
    Error = 4,
}

impl Level {
    pub fn as_str(&self) -> &'static str {
        match self {
            Level::Trace => "TRACE",
            Level::Debug => "DEBUG",
            Level::Info => "INFO",
            Level::Warn => "WARN",
            Level::Error => "ERROR",
        }
    }

    pub fn color(&self) -> &'static str {
        match self {
            Level::Trace => "\x1b[90m",   // Gray
            Level::Debug => "\x1b[36m",   // Cyan
            Level::Info => "\x1b[32m",    // Green
            Level::Warn => "\x1b[33m",    // Yellow
            Level::Error => "\x1b[31m",   // Red
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_uppercase().as_str() {
            "TRACE" => Some(Level::Trace),
            "DEBUG" => Some(Level::Debug),
            "INFO" => Some(Level::Info),
            "WARN" => Some(Level::Warn),
            "ERROR" => Some(Level::Error),
            _ => None,
        }
    }
}

pub struct Record<'a> {
    pub level: Level,
    pub target: &'a str,
    pub module: Option<&'a str>,
    pub file: Option<&'a str>,
    pub line: Option<u32>,
    pub message: &'a str,
}

pub struct ConsoleLogger {
    min_level: Level,
    colored: bool,
    show_target: bool,
    show_location: bool,
}

impl ConsoleLogger {
    pub fn new(min_level: Level) -> Self {
        Self {
            min_level,
            colored: true,
            show_target: true,
            show_location: false,
        }
    }

    pub fn with_colors(mut self, colored: bool) -> Self {
        self.colored = colored;
        self
    }

    pub fn with_target(mut self, show: bool) -> Self {
        self.show_target = show;
        self
    }

    pub fn with_location(mut self, show: bool) -> Self {
        self.show_location = show;
        self
    }
}

impl Logger for ConsoleLogger {
    fn log(&self, record: &Record) {
        if record.level < self.min_level {
            return;
        }

        let now = std::time::SystemTime::now();
        let timestamp = format!("{:?}", now);

        let level_str = if self.colored {
            format!("{}[{}]\x1b[0m", record.level.color(), record.level.as_str())
        } else {
            format!("[{}]", record.level.as_str())
        };

        let target_str = if self.show_target {
            format!(" {}", record.target)
        } else {
            String::new()
        };

        let location_str = if self.show_location {
            if let (Some(file), Some(line)) = (record.file, record.line) {
                format!(" ({}:{})", file, line)
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        println!(
            "{} {}{}{}: {}",
            timestamp,
            level_str,
            target_str,
            location_str,
            record.message
        );
    }
}

pub struct FileLogger {
    file: Mutex<std::fs::File>,
    min_level: Level,
}

impl FileLogger {
    pub fn new(path: &str, min_level: Level) -> std::io::Result<Self> {
        use std::fs::OpenOptions;

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)?;

        Ok(Self {
            file: Mutex::new(file),
            min_level,
        })
    }
}

impl Logger for FileLogger {
    fn log(&self, record: &Record) {
        use std::io::Write;

        if record.level < self.min_level {
            return;
        }

        let now = std::time::SystemTime::now();
        let timestamp = format!("{:?}", now);

        let line = format!(
            "{} [{}] {}: {}\n",
            timestamp,
            record.level.as_str(),
            record.target,
            record.message
        );

        if let Ok(mut file) = self.file.lock() {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }
}

pub struct MultiLogger {
    loggers: Vec<Arc<dyn Logger + Send + Sync>>,
}

impl MultiLogger {
    pub fn new() -> Self {
        Self {
            loggers: Vec::new(),
        }
    }

    pub fn add(mut self, logger: Arc<dyn Logger + Send + Sync>) -> Self {
        self.loggers.push(logger);
        self
    }
}

impl Logger for MultiLogger {
    fn log(&self, record: &Record) {
        for logger in &self.loggers {
            logger.log(record);
        }
    }
}

pub fn init(logger: impl Logger + Send + Sync + 'static) {
    let mut guard = LOGGER.lock().unwrap();
    *guard = Some(Arc::new(logger));
}

pub fn set_global_level(level: Level) {
    let mut guard = GLOBAL_LEVEL.lock().unwrap();
    *guard = level;
}

pub fn set_filter(target: &str, level: Level) {
    let filters = get_filters();
    let mut guard = filters.lock().unwrap();
    guard.insert(target.to_string(), level);
}

fn should_log(target: &str, level: Level) -> bool {
    // Check target-specific filter
    let filters = get_filters();
    if let Ok(filter_map) = filters.lock() {
        if let Some(&filter_level) = filter_map.get(target) {
            return level >= filter_level;
        }
    }

    // Check global level
    if let Ok(global) = GLOBAL_LEVEL.lock() {
        return level >= *global;
    }

    true
}

pub fn log(record: Record) {
    if !should_log(record.target, record.level) {
        return;
    }

    let guard = LOGGER.lock().unwrap();
    if let Some(logger) = guard.as_ref() {
        logger.log(&record);
    } else {
        // Fallback: print to stderr if no logger initialized
        eprintln!("[{}] {}: {}", record.level.as_str(), record.target, record.message);
    }
}

#[macro_export]
macro_rules! trace {
    (target: $target:expr, $($arg:tt)*) => {
        $crate::log($crate::Record {
            level: $crate::Level::Trace,
            target: $target,
            module: Some(module_path!()),
            file: Some(file!()),
            line: Some(line!()),
            message: &format!($($arg)*),
        })
    };
    ($($arg:tt)*) => {
        $crate::trace!(target: module_path!(), $($arg)*)
    };
}

#[macro_export]
macro_rules! debug {
    (target: $target:expr, $($arg:tt)*) => {
        $crate::log($crate::Record {
            level: $crate::Level::Debug,
            target: $target,
            module: Some(module_path!()),
            file: Some(file!()),
            line: Some(line!()),
            message: &format!($($arg)*),
        })
    };
    ($($arg:tt)*) => {
        $crate::debug!(target: module_path!(), $($arg)*)
    };
}

#[macro_export]
macro_rules! info {
    (target: $target:expr, $($arg:tt)*) => {
        $crate::log($crate::Record {
            level: $crate::Level::Info,
            target: $target,
            module: Some(module_path!()),
            file: Some(file!()),
            line: Some(line!()),
            message: &format!($($arg)*),
        })
    };
    ($($arg:tt)*) => {
        $crate::info!(target: module_path!(), $($arg)*)
    };
}

#[macro_export]
macro_rules! warn {
    (target: $target:expr, $($arg:tt)*) => {
        $crate::log($crate::Record {
            level: $crate::Level::Warn,
            target: $target,
            module: Some(module_path!()),
            file: Some(file!()),
            line: Some(line!()),
            message: &format!($($arg)*),
        })
    };
    ($($arg:tt)*) => {
        $crate::warn!(target: module_path!(), $($arg)*)
    };
}

#[macro_export]
macro_rules! error {
    (target: $target:expr, $($arg:tt)*) => {
        $crate::log($crate::Record {
            level: $crate::Level::Error,
            target: $target,
            module: Some(module_path!()),
            file: Some(file!()),
            line: Some(line!()),
            message: &format!($($arg)*),
        })
    };
    ($($arg:tt)*) => {
        $crate::error!(target: module_path!(), $($arg)*)
    };
}

pub struct Span {
    name: String,
    start: std::time::Instant,
}

impl Span {
    pub fn new(name: &str) -> Self {
        debug!(target: "span", "→ Entering: {}", name);
        Self {
            name: name.to_string(),
            start: std::time::Instant::now(),
        }
    }

    pub fn enter(&self) {
        debug!(target: "span", "→ {}", self.name);
    }

    pub fn exit(&self) {
        let elapsed = self.start.elapsed();
        debug!(target: "span", "← {} ({:?})", self.name, elapsed);
    }
}

impl Drop for Span {
    fn drop(&mut self) {
        self.exit();
    }
}

#[macro_export]
macro_rules! span {
    ($name:expr) => {
        $crate::Span::new($name)
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_console_logger() {
        let logger = ConsoleLogger::new(Level::Info);
        let record = Record {
            level: Level::Info,
            target: "test",
            module: Some("tests"),
            file: Some("lib.rs"),
            line: Some(1),
            message: "test message",
        };
        logger.log(&record);
    }

    #[test]
    fn test_levels() {
        assert!(Level::Error > Level::Warn);
        assert!(Level::Info > Level::Debug);
        assert_eq!(Level::Info.as_str(), "INFO");
    }

    #[test]
    fn test_level_from_str() {
        assert_eq!(Level::from_str("INFO"), Some(Level::Info));
        assert_eq!(Level::from_str("debug"), Some(Level::Debug));
        assert_eq!(Level::from_str("INVALID"), None);
    }

    #[test]
    fn test_span() {
        init(ConsoleLogger::new(Level::Debug));
        let _span = Span::new("test_operation");
        // Span should log on creation and drop
    }

    #[test]
    fn test_macros() {
        init(ConsoleLogger::new(Level::Trace));

        trace!("This is a trace message");
        debug!("This is a debug message: {}", 42);
        info!("This is info");
        warn!("Warning: {}", "something");
        error!("Error occurred!");
    }

    #[test]
    fn test_filters() {
        init(ConsoleLogger::new(Level::Trace));
        set_global_level(Level::Warn);
        set_filter("mymodule", Level::Debug);

        // This will be filtered out
        info!("Should not appear");

        // This should appear
        warn!("Should appear");
    }

    #[test]
    fn test_multi_logger() {
        let console = ConsoleLogger::new(Level::Debug);

        let multi = MultiLogger::new()
            .add(Arc::new(console));

        init(multi);

        info!("Test multi logger");
    }
}

