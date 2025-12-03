# 🚀 Avila Frontend Framework

**O melhor framework web 100% Rust da era tecnológica**

## 🎯 Características

- ✅ **100% Rust puro** - Zero dependências JavaScript
- ✅ **WebAssembly nativo** - Performance máxima
- ✅ **Virtual DOM próprio** - Renderização eficiente
- ✅ **Sistema de componentes** - Button, Card, Input, Grid, Navbar
- ✅ **Gerenciamento de estado** - Reativo e performático
- ✅ **Roteamento SPA** - Navegação sem reload
- ✅ **Sistema de eventos** - onClick, onInput, onChange
- ✅ **CSS moderno** - Gradientes, animações, responsivo

## 🏗️ Arquitetura

```
src/
├── core.rs         - Virtual DOM e renderização
├── components.rs   - Sistema de componentes visuais
├── router.rs       - Roteamento SPA
├── state.rs        - Gerenciamento de estado
├── dom.rs          - Manipulação do DOM
├── events.rs       - Sistema de eventos
└── lib.rs          - Ponto de entrada
```

## 🚀 Build e Run

```bash
# Instalar wasm-pack
cargo install wasm-pack

# Build
wasm-pack build --target web --release

# Servir localmente
python -m http.server 8000
# Ou
npx serve .
```

Acesse: `http://localhost:8000`

## 📦 Componentes

### Button
```rust
Button::new("Clique aqui")
    .variant(ButtonVariant::Primary)
    .size(ButtonSize::Large)
    .render()
```

### Card
```rust
Card::new("Título", "Conteúdo do card")
    .footer("Rodapé opcional")
    .render()
```

### Input
```rust
Input::new("Digite algo...")
    .input_type("text")
    .render()
```

### Grid
```rust
Grid::new(3)  // 3 colunas
    .child(card1)
    .child(card2)
    .child(card3)
    .render()
```

### Navbar
```rust
Navbar::new("Avila")
    .item("Home", "/")
    .item("Sobre", "/about")
    .render()
```

## 🎨 Estilização

CSS moderno com:
- Gradientes lineares
- Backdrop filter (blur)
- Animações suaves
- Responsividade automática
- Dark mode nativo

## 🔥 Performance

- Build otimizado com LTO
- WASM com SIMD
- Virtual DOM eficiente
- Lazy loading de componentes

## 📝 Licença

MIT OR Apache-2.0
