//! Email template system with variable substitution

use avila_error::{Error, ErrorKind, Result};
use std::collections::HashMap;

/// Email template with placeholders
#[derive(Debug, Clone)]
pub struct EmailTemplate {
    subject: String,
    body: String,
    html_body: Option<String>,
    variables: Vec<String>,
}

impl EmailTemplate {
    /// Creates a new template
    pub fn new(subject: String, body: String) -> Self {
        let variables = Self::extract_variables(&body);
        Self {
            subject,
            body,
            html_body: None,
            variables,
        }
    }

    /// Sets HTML body template
    pub fn with_html(mut self, html: String) -> Self {
        self.html_body = Some(html);
        self
    }

    /// Extracts variable names from template ({{variable}})
    fn extract_variables(template: &str) -> Vec<String> {
        let mut vars = Vec::new();
        let mut in_var = false;
        let mut current_var = String::new();

        let chars: Vec<char> = template.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            if i + 1 < chars.len() && chars[i] == '{' && chars[i + 1] == '{' {
                in_var = true;
                i += 2;
                continue;
            }

            if i + 1 < chars.len() && chars[i] == '}' && chars[i + 1] == '}' {
                if in_var && !current_var.is_empty() {
                    vars.push(current_var.trim().to_string());
                    current_var.clear();
                }
                in_var = false;
                i += 2;
                continue;
            }

            if in_var {
                current_var.push(chars[i]);
            }

            i += 1;
        }

        vars.sort();
        vars.dedup();
        vars
    }

    /// Renders template with variables
    pub fn render(&self, vars: &HashMap<String, String>) -> Result<(String, String, Option<String>)> {
        // Check all required variables are provided
        for var in &self.variables {
            if !vars.contains_key(var) {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    format!("Missing template variable: {}", var),
                ));
            }
        }

        let subject = Self::substitute(&self.subject, vars);
        let body = Self::substitute(&self.body, vars);
        let html = self.html_body.as_ref().map(|h| Self::substitute(h, vars));

        Ok((subject, body, html))
    }

    /// Substitutes variables in text
    fn substitute(text: &str, vars: &HashMap<String, String>) -> String {
        let mut result = text.to_string();

        for (key, value) in vars {
            let placeholder = format!("{{{{{}}}}}", key);
            result = result.replace(&placeholder, value);
        }

        result
    }

    /// Lists required variables
    pub fn required_variables(&self) -> &[String] {
        &self.variables
    }
}

/// Template builder for common email types
pub struct TemplateBuilder;

impl TemplateBuilder {
    /// Welcome email template
    pub fn welcome() -> EmailTemplate {
        EmailTemplate::new(
            "Welcome {{name}}!".to_string(),
            "Hello {{name}},\n\nWelcome to {{service}}!\n\nBest regards,\n{{company}}".to_string(),
        ).with_html(
            "<h1>Welcome {{name}}!</h1><p>Hello {{name}},</p><p>Welcome to <strong>{{service}}</strong>!</p><p>Best regards,<br>{{company}}</p>".to_string()
        )
    }

    /// Password reset template
    pub fn password_reset() -> EmailTemplate {
        EmailTemplate::new(
            "Reset your password".to_string(),
            "Hello {{name}},\n\nClick this link to reset your password:\n{{reset_link}}\n\nThis link expires in {{expiry}} hours.".to_string(),
        ).with_html(
            "<h2>Password Reset</h2><p>Hello {{name}},</p><p>Click the link below to reset your password:</p><p><a href=\"{{reset_link}}\">Reset Password</a></p><p>This link expires in {{expiry}} hours.</p>".to_string()
        )
    }

    /// Notification template
    pub fn notification() -> EmailTemplate {
        EmailTemplate::new(
            "{{title}}".to_string(),
            "{{message}}\n\n{{details}}".to_string(),
        ).with_html(
            "<h2>{{title}}</h2><p>{{message}}</p><div>{{details}}</div>".to_string()
        )
    }

    /// Invoice template
    pub fn invoice() -> EmailTemplate {
        EmailTemplate::new(
            "Invoice #{{invoice_number}}".to_string(),
            "Hello {{customer_name}},\n\nYour invoice #{{invoice_number}} for {{amount}} is ready.\n\nDue date: {{due_date}}\n\nThank you!".to_string(),
        ).with_html(
            "<h1>Invoice #{{invoice_number}}</h1><p>Hello {{customer_name}},</p><p>Amount: <strong>{{amount}}</strong></p><p>Due date: {{due_date}}</p><p>Thank you!</p>".to_string()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_variable_extraction() {
        let template = EmailTemplate::new(
            "Hello {{name}}".to_string(),
            "Welcome {{name}}, to {{service}}!".to_string(),
        );

        assert_eq!(template.variables.len(), 2);
        assert!(template.variables.contains(&"name".to_string()));
        assert!(template.variables.contains(&"service".to_string()));
    }

    #[test]
    fn test_template_rendering() {
        let template = EmailTemplate::new(
            "Hello {{name}}".to_string(),
            "Welcome {{name}}!".to_string(),
        );

        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "John".to_string());

        let (subject, body, _) = template.render(&vars).unwrap();
        assert_eq!(subject, "Hello John");
        assert_eq!(body, "Welcome John!");
    }

    #[test]
    fn test_missing_variable() {
        let template = EmailTemplate::new(
            "Hello {{name}}".to_string(),
            "Welcome {{name}}!".to_string(),
        );

        let vars = HashMap::new();
        assert!(template.render(&vars).is_err());
    }

    #[test]
    fn test_welcome_template() {
        let template = TemplateBuilder::welcome();

        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "Alice".to_string());
        vars.insert("service".to_string(), "Avila".to_string());
        vars.insert("company".to_string(), "Avila Inc".to_string());

        let (subject, body, html) = template.render(&vars).unwrap();
        assert!(subject.contains("Alice"));
        assert!(body.contains("Avila"));
        assert!(html.is_some());
    }
}
