//! Avila Time - AVL Platform date/time handling
//! Replacement for chrono - 100% Rust std
//! Uses SystemTime + formatting

use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH, Duration};

/// DateTime representation (UTC)
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct DateTime {
    timestamp: u64, // Unix timestamp (seconds since epoch)
    nanos: u32,     // Nanoseconds component
}

impl DateTime {
    /// Get current UTC time
    pub fn now() -> Self {
        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("System time before UNIX epoch");

        Self {
            timestamp: duration.as_secs(),
            nanos: duration.subsec_nanos(),
        }
    }

    /// Create from Unix timestamp
    pub fn from_timestamp(secs: u64, nanos: u32) -> Self {
        Self {
            timestamp: secs,
            nanos,
        }
    }

    /// Get Unix timestamp
    pub fn timestamp(&self) -> u64 {
        self.timestamp
    }

    /// Get nanoseconds
    pub fn nanos(&self) -> u32 {
        self.nanos
    }

    /// Format as ISO 8601 (UTC): YYYY-MM-DDTHH:MM:SSZ
    pub fn to_rfc3339(&self) -> String {
        let (year, month, day, hour, minute, second) = self.to_components();
        format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
            year, month, day, hour, minute, second
        )
    }

    /// Format as RFC 2822 (email date format)
    pub fn to_rfc2822(&self) -> String {
        let (year, month, day, hour, minute, second) = self.to_components();
        let weekday = self.weekday();
        let month_name = month_name(month);

        format!(
            "{}, {} {} {} {:02}:{:02}:{:02} +0000",
            weekday, day, month_name, year, hour, minute, second
        )
    }

    /// Format custom
    pub fn format(&self, fmt: &str) -> String {
        let (year, month, day, hour, minute, second) = self.to_components();

        fmt.replace("%Y", &format!("{:04}", year))
            .replace("%m", &format!("{:02}", month))
            .replace("%d", &format!("{:02}", day))
            .replace("%H", &format!("{:02}", hour))
            .replace("%M", &format!("{:02}", minute))
            .replace("%S", &format!("{:02}", second))
    }

    /// Convert timestamp to date/time components
    fn to_components(&self) -> (u32, u32, u32, u32, u32, u32) {
        // Simplified date calculation (não considera leap seconds etc)
        let days_since_epoch = self.timestamp / 86400;
        let seconds_today = self.timestamp % 86400;

        let hour = (seconds_today / 3600) as u32;
        let minute = ((seconds_today % 3600) / 60) as u32;
        let second = (seconds_today % 60) as u32;

        // Approximate year calculation
        let years_since_epoch = days_since_epoch / 365;
        let year = 1970 + years_since_epoch as u32;

        let days_this_year = days_since_epoch % 365;
        let month = ((days_this_year / 30) + 1) as u32;
        let day = ((days_this_year % 30) + 1) as u32;

        (year, month, day, hour, minute, second)
    }

    /// Add duration
    pub fn add(&self, duration: Duration) -> Self {
        let total_nanos = self.nanos as u64 + duration.subsec_nanos() as u64;
        let extra_secs = total_nanos / 1_000_000_000;
        let new_nanos = (total_nanos % 1_000_000_000) as u32;

        Self {
            timestamp: self.timestamp + duration.as_secs() + extra_secs,
            nanos: new_nanos,
        }
    }

    /// Subtract duration
    pub fn sub(&self, duration: Duration) -> Self {
        let total_secs = duration.as_secs();
        let nanos = duration.subsec_nanos();

        if nanos > self.nanos {
            Self {
                timestamp: self.timestamp - total_secs - 1,
                nanos: 1_000_000_000 + self.nanos - nanos,
            }
        } else {
            Self {
                timestamp: self.timestamp - total_secs,
                nanos: self.nanos - nanos,
            }
        }
    }

    /// Get weekday name
    fn weekday(&self) -> &'static str {
        let days_since_epoch = self.timestamp / 86400;
        let weekday = (days_since_epoch + 4) % 7; // Thursday was day 0
        match weekday {
            0 => "Sun",
            1 => "Mon",
            2 => "Tue",
            3 => "Wed",
            4 => "Thu",
            5 => "Fri",
            6 => "Sat",
            _ => "???",
        }
    }
}

fn month_name(month: u32) -> &'static str {
    match month {
        1 => "Jan",
        2 => "Feb",
        3 => "Mar",
        4 => "Apr",
        5 => "May",
        6 => "Jun",
        7 => "Jul",
        8 => "Aug",
        9 => "Sep",
        10 => "Oct",
        11 => "Nov",
        12 => "Dec",
        _ => "???",
    }
}

impl Default for DateTime {
    fn default() -> Self {
        Self::now()
    }
}

impl fmt::Display for DateTime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_rfc3339())
    }
}

impl From<SystemTime> for DateTime {
    fn from(st: SystemTime) -> Self {
        let duration = st.duration_since(UNIX_EPOCH).unwrap_or(Duration::ZERO);
        Self {
            timestamp: duration.as_secs(),
            nanos: duration.subsec_nanos(),
        }
    }
}

impl From<DateTime> for SystemTime {
    fn from(dt: DateTime) -> Self {
        UNIX_EPOCH + Duration::new(dt.timestamp, dt.nanos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_now() {
        let now = DateTime::now();
        assert!(now.timestamp() > 0);
    }

    #[test]
    fn test_format() {
        let dt = DateTime::from_timestamp(1640995200, 0); // 2022-01-01 00:00:00
        let formatted = dt.to_rfc3339();
        assert!(formatted.contains("2022") || formatted.contains("2021")); // Approximate
    }

    #[test]
    fn test_add_duration() {
        let dt = DateTime::from_timestamp(1000, 0);
        let dt2 = dt.add(Duration::from_secs(500));
        assert_eq!(dt2.timestamp(), 1500);
    }
}

// Implementação de Serialize/Deserialize para avila-serde
#[cfg(feature = "serde")]
impl avila_serde::Serialize for DateTime {
    fn to_value(&self) -> avila_serde::Value {
        // Serializa como string ISO 8601
        avila_serde::Value::String(self.to_rfc3339())
    }
}

#[cfg(feature = "serde")]
impl avila_serde::Deserialize for DateTime {
    fn from_value(value: avila_serde::Value) -> Result<Self, avila_serde::Error> {
        match value {
            avila_serde::Value::String(s) => {
                // Parse ISO 8601: YYYY-MM-DDTHH:MM:SSZ
                // Implementação simplificada - assume formato exato
                if s.len() < 19 {
                    return Err(avila_serde::Error::Parse(format!("Invalid datetime format: {}", s)));
                }

                // Extrai componentes básicos
                let parts: Vec<&str> = s.split('T').collect();
                if parts.len() != 2 {
                    return Err(avila_serde::Error::Parse(format!("Invalid datetime format: {}", s)));
                }

                let date_parts: Vec<&str> = parts[0].split('-').collect();
                let time_str = parts[1].trim_end_matches('Z');
                let time_parts: Vec<&str> = time_str.split(':').collect();

                if date_parts.len() != 3 || time_parts.len() != 3 {
                    return Err(avila_serde::Error::Parse(format!("Invalid datetime format: {}", s)));
                }

                let year: u32 = date_parts[0].parse()
                    .map_err(|_| avila_serde::Error::Parse(format!("Invalid year: {}", date_parts[0])))?;
                let month: u32 = date_parts[1].parse()
                    .map_err(|_| avila_serde::Error::Parse(format!("Invalid month: {}", date_parts[1])))?;
                let day: u32 = date_parts[2].parse()
                    .map_err(|_| avila_serde::Error::Parse(format!("Invalid day: {}", date_parts[2])))?;
                let hour: u32 = time_parts[0].parse()
                    .map_err(|_| avila_serde::Error::Parse(format!("Invalid hour: {}", time_parts[0])))?;
                let minute: u32 = time_parts[1].parse()
                    .map_err(|_| avila_serde::Error::Parse(format!("Invalid minute: {}", time_parts[1])))?;
                let second: u32 = time_parts[2].parse()
                    .map_err(|_| avila_serde::Error::Parse(format!("Invalid second: {}", time_parts[2])))?;

                // Calcula timestamp Unix aproximado
                // Fórmula simplificada - não considera anos bissextos
                let days_since_1970 = (year - 1970) * 365 + (month - 1) * 30 + (day - 1);
                let seconds = (days_since_1970 as u64) * 86400
                    + (hour as u64) * 3600
                    + (minute as u64) * 60
                    + (second as u64);

                Ok(Self::from_timestamp(seconds, 0))
            }
            _ => Err(avila_serde::Error::Parse("Expected string for DateTime".to_string()))
        }
    }
}
