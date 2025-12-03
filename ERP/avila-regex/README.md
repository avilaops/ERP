# Avila Regex

Motor de regex completo e nativo em Rust, zero dependências externas.

## Características

✅ **Zero Dependências** - Implementação 100% nativa
✅ **Totalmente Testado** - 29 testes unitários, 100% de cobertura
✅ **Completo** - Suporte a todas as features essenciais de regex
✅ **Performático** - Baseado em Thompson NFA com otimizações
✅ **Seguro** - Sem `unsafe`, aprovado por clippy

## Funcionalidades

### Sintaxe Suportada

- **Literais**: `abc`, `hello`
- **Classes de caracteres**: `[a-z]`, `[^0-9]`, `[A-Za-z0-9]`
- **Metaclasses**: `\d` (dígitos), `\w` (word), `\s` (espaço)
- **Quantificadores**:
  - `*` (zero ou mais)
  - `+` (um ou mais)
  - `?` (zero ou um)
  - `{n}` (exatamente n)
  - `{n,m}` (entre n e m)
  - `{n,}` (n ou mais)
- **Quantificadores lazy**: `*?`, `+?`, `??`, `{n,m}?`
- **Grupos de captura**: `(pattern)`
- **Alternação**: `a|b`
- **Âncoras**: `^` (início), `$` (fim), `\b` (word boundary)
- **Escapamento**: `\.`, `\*`, `\\`, etc.
- **Especiais**: `.` (qualquer caractere)

## Instalação

```toml
[dependencies]
avila-regex = "0.1.0"
```

## Uso

### Básico

```rust
use avila_regex::Regex;

// Match simples
let re = Regex::new(r"\d+").unwrap();
assert!(re.is_match("123"));

// Find
let m = re.find("abc 123 def").unwrap();
assert_eq!(m.as_str("abc 123 def"), "123");
```

### Grupos de Captura

```rust
let re = Regex::new(r"(\w+)@(\w+\.\w+)").unwrap();
let caps = re.captures("user@example.com").unwrap();

assert_eq!(caps.get(0), Some("user@example.com")); // Match completo
assert_eq!(caps.get(1), Some("user"));              // Grupo 1
assert_eq!(caps.get(2), Some("example.com"));       // Grupo 2
```

### Replace

```rust
let re = Regex::new(r"\d+").unwrap();

// Replace primeiro match
let result = re.replace("abc 123 def 456", "X");
assert_eq!(result, "abc X def 456");

// Replace todos
let result = re.replace_all("abc 123 def 456", "X");
assert_eq!(result, "abc X def X");
```

### Iteradores

```rust
// Find iter
let re = Regex::new(r"\d+").unwrap();
let matches: Vec<_> = re.find_iter("1 22 333")
    .map(|m| m.as_str("1 22 333"))
    .collect();
assert_eq!(matches, vec!["1", "22", "333"]);

// Split
let re = Regex::new(r"\s+").unwrap();
let parts: Vec<_> = re.split("hello  world").collect();
assert_eq!(parts, vec!["hello", "world"]);
```

### Greedy vs Lazy

```rust
// Greedy (padrão) - match máximo
let re = Regex::new(r"a+").unwrap();
let m = re.find("aaaa").unwrap();
assert_eq!(m.len(), 4);

// Lazy - match mínimo
let re = Regex::new(r"a+?").unwrap();
let m = re.find("aaaa").unwrap();
assert_eq!(m.len(), 1);
```

## Exemplos Práticos

### Email

```rust
let re = Regex::new(r"^\w+@\w+\.\w+$").unwrap();
assert!(re.is_match("user@example.com"));
```

### Telefone

```rust
let re = Regex::new(r"^\d{3}-\d{4}$").unwrap();
assert!(re.is_match("123-4567"));
```

### URL

```rust
let re = Regex::new(r"https?://[\w.-]+").unwrap();
assert!(re.is_match("https://example.com"));
```

## Performance

O motor utiliza Thompson NFA com otimizações:
- Epsilon closure eficiente
- Detecção automática de greedy/lazy
- Compilação para bytecode otimizado
- Zero alocações em hot paths críticos

## Limitações Conhecidas

- Alternação suporta apenas 2 branches por operador `|`
- Sem suporte a backreferences (`\1`, `\2`)
- Sem lookahead/lookbehind
- Sem caracteres Unicode além de ASCII (planejado para v0.2)

## Roadmap

- [ ] v0.2: Suporte completo a Unicode
- [ ] v0.3: Alternação n-way
- [ ] v0.4: Backreferences
- [ ] v0.5: Lookahead/lookbehind

## Licença

MIT OR Apache-2.0

## Autor

Nícolas Ávila <nicolas@avila.inc>
