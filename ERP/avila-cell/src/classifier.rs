//! Email classification and spam detection using pattern matching

use avila_regex::Regex;

/// Email classifier
pub struct EmailClassifier {
    spam_patterns: Vec<Regex>,
    ham_patterns: Vec<Regex>,
}

impl EmailClassifier {
    pub fn new() -> Self {
        Self {
            spam_patterns: Self::default_spam_patterns(),
            ham_patterns: Vec::new(),
        }
    }

    /// Default spam detection patterns
    fn default_spam_patterns() -> Vec<Regex> {
        vec![
            Regex::new(r"(?i)viagra|cialis|pharmacy").unwrap(),
            Regex::new(r"(?i)casino|lottery|winner").unwrap(),
            Regex::new(r"(?i)click here|act now|limited time").unwrap(),
            Regex::new(r"(?i)nigerian prince|inheritance").unwrap(),
            Regex::new(r"(?i)buy now|free money|get rich").unwrap(),
            Regex::new(r"(?i)urgent|congratulations|you've won").unwrap(),
        ]
    }

    /// Classifies email
    pub fn classify(&self, subject: &str, body: &str) -> EmailClass {
        let text = format!("{} {}", subject, body);
        let mut spam_score = 0;
        let mut ham_score = 0;

        // Check spam patterns
        for pattern in &self.spam_patterns {
            if pattern.is_match(&text) {
                spam_score += 1;
            }
        }

        // Check ham patterns
        for pattern in &self.ham_patterns {
            if pattern.is_match(&text) {
                ham_score += 1;
            }
        }

        // Additional heuristics
        let upper_count = text.chars().filter(|&c| c.is_uppercase()).count();
        let total_chars = text.chars().filter(|c| c.is_alphabetic()).count();
        if total_chars > 0 && upper_count > total_chars / 3 {
            spam_score += 2; // Too many capitals
        }

        if text.contains("!!!") || text.matches('!').count() > 5 {
            spam_score += 2; // Excessive exclamation
        }

        if spam_score >= 3 {
            EmailClass::Spam(spam_score)
        } else {
            EmailClass::Ham(ham_score)
        }
    }

    /// Adds custom spam pattern
    pub fn add_spam_pattern(&mut self, pattern: Regex) {
        self.spam_patterns.push(pattern);
    }

    /// Adds custom ham pattern
    pub fn add_ham_pattern(&mut self, pattern: Regex) {
        self.ham_patterns.push(pattern);
    }
}

impl Default for EmailClassifier {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum EmailClass {
    Spam(usize),
    Ham(usize),
}

/// Email threading - groups related emails
pub struct EmailThreader;

impl EmailThreader {
    /// Groups emails by conversation thread
    pub fn thread(emails: Vec<ThreadableEmail>) -> Vec<EmailThread> {
        let mut threads: Vec<EmailThread> = Vec::new();

        for email in emails {
            let mut found = false;

            // Try to add to existing thread
            for thread in &mut threads {
                if thread.belongs(&email) {
                    thread.add(email.clone());
                    found = true;
                    break;
                }
            }

            // Create new thread
            if !found {
                threads.push(EmailThread::new(email));
            }
        }

        threads
    }
}

#[derive(Debug, Clone)]
pub struct ThreadableEmail {
    pub id: String,
    pub subject: String,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct EmailThread {
    pub root_subject: String,
    pub emails: Vec<ThreadableEmail>,
}

impl EmailThread {
    fn new(email: ThreadableEmail) -> Self {
        let root_subject = Self::normalize_subject(&email.subject);
        Self {
            root_subject,
            emails: vec![email],
        }
    }

    fn belongs(&self, email: &ThreadableEmail) -> bool {
        let normalized = Self::normalize_subject(&email.subject);

        // Check subject match
        if normalized == self.root_subject {
            return true;
        }

        // Check references
        for existing in &self.emails {
            if email.in_reply_to.as_ref() == Some(&existing.id) {
                return true;
            }
            if email.references.contains(&existing.id) {
                return true;
            }
        }

        false
    }

    fn add(&mut self, email: ThreadableEmail) {
        self.emails.push(email);
    }

    fn normalize_subject(subject: &str) -> String {
        subject
            .trim()
            .to_lowercase()
            .replace("re:", "")
            .replace("fwd:", "")
            .replace("fw:", "")
            .trim()
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spam_classification() {
        let mut classifier = EmailClassifier::new();

        // Add more spam keywords to trigger detection
        let result = classifier.classify(
            "URGENT!!! You've WON the LOTTERY",
            "Click HERE NOW to claim your FREE MONEY from the casino! Congratulations winner! Buy now viagra!"
        );

        assert!(matches!(result, EmailClass::Spam(_)));
    }

    #[test]
    fn test_ham_classification() {
        let classifier = EmailClassifier::new();

        let result = classifier.classify(
            "Team meeting tomorrow",
            "Hi everyone, let's meet at 2pm to discuss the project."
        );

        assert!(matches!(result, EmailClass::Ham(_)));
    }

    #[test]
    fn test_email_threading() {
        let emails = vec![
            ThreadableEmail {
                id: "1".to_string(),
                subject: "Hello".to_string(),
                in_reply_to: None,
                references: Vec::new(),
            },
            ThreadableEmail {
                id: "2".to_string(),
                subject: "Re: Hello".to_string(),
                in_reply_to: Some("1".to_string()),
                references: vec!["1".to_string()],
            },
        ];

        let threads = EmailThreader::thread(emails);
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].emails.len(), 2);
    }
}
