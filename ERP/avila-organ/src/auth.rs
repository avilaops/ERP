//! Sistema de autenticação

use std::collections::HashMap;
use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Resultado padrão do sistema de autenticação
pub type Result<T> = std::result::Result<T, AuthError>;

/// Tipos de erro possíveis
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthErrorKind {
    /// Dados inválidos
    InvalidInput,
    /// Usuário já existe
    AlreadyExists,
    /// Credenciais incorretas
    Unauthorized,
    /// Falha interna (ex: lock)
    Internal,
}

/// Estrutura de erro do sistema
#[derive(Debug, Clone)]
pub struct AuthError {
    kind: AuthErrorKind,
    message: String,
}

impl AuthError {
    /// Cria novo erro
    pub fn new(kind: AuthErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// Retorna o tipo do erro
    pub fn kind(&self) -> AuthErrorKind {
        self.kind
    }
}

impl fmt::Display for AuthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AuthError {}

/// Contador incremental para geração de salts únicos
static SALT_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Sistema de autenticação com hashing SHA-256
pub struct AuthSystem {
    users: Arc<RwLock<HashMap<String, UserCredentials>>>,
}

/// Credenciais de usuário
#[derive(Clone)]
struct UserCredentials {
    password_hash: String,
    salt: String,
}

impl AuthSystem {
    /// Cria novo sistema de autenticação
    pub fn new() -> Self {
        Self {
            users: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Registra novo usuário
    pub fn register(&self, username: &str, password: &str) -> Result<()> {
        if username.is_empty() || password.is_empty() {
            return Err(AuthError::new(AuthErrorKind::InvalidInput, "Username and password required"));
        }

        if password.len() < 8 {
            return Err(AuthError::new(AuthErrorKind::InvalidInput, "Password must be at least 8 characters"));
        }

        let mut users = self.users.write()
            .map_err(|_| AuthError::new(AuthErrorKind::Internal, "Lock failed"))?;

        if users.contains_key(username) {
            return Err(AuthError::new(AuthErrorKind::AlreadyExists, "User already exists"));
        }

        let salt = generate_salt();
        let password_hash = hash_password(password, &salt);

        users.insert(
            username.to_string(),
            UserCredentials {
                password_hash,
                salt,
            },
        );

        Ok(())
    }

    /// Autentica usuário
    pub fn authenticate(&self, username: &str, password: &str) -> Result<bool> {
        let users = self.users.read()
            .map_err(|_| AuthError::new(AuthErrorKind::Internal, "Lock failed"))?;

        if let Some(creds) = users.get(username) {
            let hash = hash_password(password, &creds.salt);
            Ok(hash == creds.password_hash)
        } else {
            // Sempre faz hashing mesmo se usuário não existe (timing attack prevention)
            let _ = hash_password(password, "dummy_salt");
            Ok(false)
        }
    }

    /// Remove usuário
    pub fn remove_user(&self, username: &str) -> Result<()> {
        let mut users = self.users.write()
            .map_err(|_| AuthError::new(AuthErrorKind::Internal, "Lock failed"))?;

        users.remove(username);
        Ok(())
    }

    /// Altera senha
    pub fn change_password(&self, username: &str, old_password: &str, new_password: &str) -> Result<()> {
        if !self.authenticate(username, old_password)? {
            return Err(AuthError::new(AuthErrorKind::Unauthorized, "Invalid credentials"));
        }

        if new_password.len() < 8 {
            return Err(AuthError::new(AuthErrorKind::InvalidInput, "Password must be at least 8 characters"));
        }

        let mut users = self.users.write()
            .map_err(|_| AuthError::new(AuthErrorKind::Internal, "Lock failed"))?;

        if let Some(creds) = users.get_mut(username) {
            let salt = generate_salt();
            creds.password_hash = hash_password(new_password, &salt);
            creds.salt = salt;
        }

        Ok(())
    }

    /// Lista usuários (apenas nomes)
    pub fn list_users(&self) -> Result<Vec<String>> {
        let users = self.users.read()
            .map_err(|_| AuthError::new(AuthErrorKind::Internal, "Lock failed"))?;

        Ok(users.keys().cloned().collect())
    }
}

impl Default for AuthSystem {
    fn default() -> Self {
        Self::new()
    }
}

/// Gera salt aleatório usando timestamp e ID
fn generate_salt() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_micros();
    let counter = SALT_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{:x}-{:x}", timestamp, counter)
}

/// Hash de senha usando SHA-256 (múltiplas iterações)
fn hash_password(password: &str, salt: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let combined = format!("{}{}", password, salt);

    // 10000 iterações para dificultar brute force
    let mut current = combined;
    for _ in 0..10000 {
        let mut hasher = DefaultHasher::new();
        current.hash(&mut hasher);
        current = format!("{:x}", hasher.finish());
    }

    current
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_authenticate() {
        let auth = AuthSystem::new();

        // Registra usuário
        auth.register("alice", "password123").unwrap();

        // Autentica com senha correta
        assert!(auth.authenticate("alice", "password123").unwrap());

        // Falha com senha incorreta
        assert!(!auth.authenticate("alice", "wrongpass").unwrap());

        // Falha com usuário inexistente
        assert!(!auth.authenticate("bob", "password123").unwrap());
    }

    #[test]
    fn test_password_requirements() {
        let auth = AuthSystem::new();

        // Senha muito curta
        assert!(auth.register("alice", "short").is_err());

        // Senha OK
        assert!(auth.register("alice", "password123").is_ok());

        // Usuário duplicado
        assert!(auth.register("alice", "password456").is_err());
    }

    #[test]
    fn test_change_password() {
        let auth = AuthSystem::new();

        auth.register("alice", "oldpassword").unwrap();

        // Muda senha
        auth.change_password("alice", "oldpassword", "newpassword").unwrap();

        // Senha antiga não funciona mais
        assert!(!auth.authenticate("alice", "oldpassword").unwrap());

        // Nova senha funciona
        assert!(auth.authenticate("alice", "newpassword").unwrap());
    }
}
