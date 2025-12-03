//! Gerenciamento de mailboxes (pastas)

use crate::{generate_id, EmailId, Error, ErrorKind, Result};

/// Mailbox (pasta de emails)
#[derive(Debug, Clone)]
pub struct Mailbox {
    /// Nome da mailbox
    pub name: String,
    /// IDs dos emails nesta mailbox
    pub email_ids: Vec<EmailId>,
    /// Submailboxes
    pub children: Vec<Mailbox>,
}

impl Mailbox {
    /// Cria nova mailbox
    pub fn new(name: String) -> Self {
        Self {
            name,
            email_ids: Vec::new(),
            children: Vec::new(),
        }
    }

    /// Adiciona email
    pub fn add_email(&mut self, id: EmailId) {
        self.email_ids.push(id);
    }

    /// Remove email
    pub fn remove_email(&mut self, id: &EmailId) -> bool {
        if let Some(pos) = self.email_ids.iter().position(|x| x == id) {
            self.email_ids.remove(pos);
            true
        } else {
            false
        }
    }

    /// Cria submailbox
    pub fn create_child(&mut self, name: String) -> &mut Mailbox {
        let mailbox = Mailbox::new(name);
        self.children.push(mailbox);
        self.children.last_mut().unwrap()
    }

    /// Encontra submailbox por nome
    pub fn find_child(&self, name: &str) -> Option<&Mailbox> {
        self.children.iter().find(|m| m.name == name)
    }
}

/// Gerenciador de mailboxes
pub struct MailboxManager {
    root: Mailbox,
}

impl MailboxManager {
    /// Cria novo gerenciador com mailboxes padrão
    pub fn new() -> Self {
        let mut root = Mailbox::new("Root".to_string());

        // Mailboxes padrão
        root.create_child("INBOX".to_string());
        root.create_child("Sent".to_string());
        root.create_child("Drafts".to_string());
        root.create_child("Trash".to_string());
        root.create_child("Spam".to_string());

        Self { root }
    }

    /// Lista todas as mailboxes
    pub fn list(&self) -> Vec<String> {
        let mut names = Vec::new();
        self.collect_names(&self.root, String::new(), &mut names);
        names
    }

    fn collect_names(&self, mailbox: &Mailbox, prefix: String, names: &mut Vec<String>) {
        if !prefix.is_empty() {
            names.push(prefix.clone());
        }

        for child in &mailbox.children {
            let child_prefix = if prefix.is_empty() {
                child.name.clone()
            } else {
                format!("{}/{}", prefix, child.name)
            };
            self.collect_names(child, child_prefix, names);
        }
    }

    /// Obtém mailbox por nome
    pub fn get(&self, name: &str) -> Result<&Mailbox> {
        self.find_mailbox(&self.root, name)
            .ok_or_else(|| Error::new(ErrorKind::NotFound, format!("Mailbox '{}' não encontrada", name)))
    }

    fn find_mailbox<'a>(&self, current: &'a Mailbox, target: &str) -> Option<&'a Mailbox> {
        if current.name == target {
            return Some(current);
        }

        for child in &current.children {
            if let Some(found) = self.find_mailbox(child, target) {
                return Some(found);
            }
        }

        None
    }
}

impl Default for MailboxManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mailbox_manager() {
        let manager = MailboxManager::new();
        let names = manager.list();

        assert!(names.contains(&"INBOX".to_string()));
        assert!(names.contains(&"Sent".to_string()));
    }

    #[test]
    fn test_mailbox_operations() {
        let mut mailbox = Mailbox::new("Test".to_string());
        let id = generate_id();

        mailbox.add_email(id);
        assert_eq!(mailbox.email_ids.len(), 1);

        assert!(mailbox.remove_email(&id));
        assert_eq!(mailbox.email_ids.len(), 0);
    }
}
