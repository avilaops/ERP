# Análise de Dependências - Avila ERP

## 🎯 Filosofia: "Next-Level" Autonomia

O projeto Avila ERP segue a filosofia de **usar as próprias ferramentas da Avila** sempre que possível, evitando dependências externas quando existem alternativas no ecossistema Arxis.

## 📊 Status das Dependências

### ✅ Frontend WASM - 100% Avila
```toml
[dependencies]
avila-frontend = { path = "../../../arxis/avila-frontend" }
wasm-bindgen = "0.2"
web-sys = { version = "0.3", features = [...] }
js-sys = "0.3"
```

**Status:** ✅ Completamente autônomo, usa apenas `avila-frontend`

### 🔄 Backend - Dependências Mistas

#### ✅ Substituíveis pela Avila (mas mantidas por compatibilidade):

| Externa | Equivalente Avila | Status | Motivo da Não-Substituição |
|---------|-------------------|--------|----------------------------|
| `serde` | `avila-serde` | ⚠️ Mantido | API não 100% compatível com derives do Axum/SQLx |
| `tokio` | `avila-async` | ⚠️ Mantido | Axum e SQLx dependem diretamente do tokio |
| `tracing` | `avila-telemetry` | ⚠️ Mantido | avila-telemetry ainda usa chrono/serde internamente |
| `anyhow`/`thiserror` | `avila-error` | ⚠️ Mantido | Integração simplificada com ecossistema Rust |
| `uuid` | `avila-id` | ⚠️ Mantido | SQLx usa UUID diretamente |
| `chrono` | `avila-time` | ⚠️ Mantido | SQLx usa DateTime<Utc> de chrono |

#### ❌ Sem Equivalente Avila:

| Dependência | Propósito | Avila tem? |
|-------------|-----------|------------|
| `axum` | Web framework | ❌ Não (avila-web desabilitado) |
| `tower`/`tower-http` | Middleware HTTP | ❌ Não |
| `sqlx` | Database ORM | ❌ Não (aviladb em desenvolvimento) |
| `validator` | Validação de dados | ❌ Não |

## 🔧 Roadmap de Autonomia

### Fase 1: Frontend ✅ CONCLUÍDA
- [x] Usar `avila-frontend` para UI
- [x] VirtualDOM próprio
- [x] Componentes próprios (Button, Card, Input, Grid, Navbar)

### Fase 2: Backend Parcial (Atual)
- [x] Estrutura básica com dependências externas mínimas
- [ ] Migrar para `avila-async` quando Axum não for mais dependente direto
- [ ] Migrar para `avila-serde` quando derives forem 100% compatíveis
- [ ] Migrar para `avila-time` quando SQLx suportar

### Fase 3: Backend Completo
- [ ] Substituir Axum por `avila-http` quando avila-web for estabilizado
- [ ] Substituir SQLx por `aviladb` quando estiver pronto
- [ ] Criar `avila-validator` para validação de dados

### Fase 4: 100% Avila
- [ ] Zero dependências externas
- [ ] Toda a stack em Rust puro
- [ ] Sistema autônomo e auditável

## 📝 Notas Técnicas

### Por que não substituir agora?

1. **avila-serde**: Não exporta derives `Serialize`/`Deserialize` da mesma forma que `serde`
   - Usa `avila_serde::Serialize` em vez de `#[derive(Serialize)]`
   - Requer refatoração de toda a base de código

2. **avila-time**: `DateTime` não é genérico como `chrono::DateTime<Utc>`
   - `avila_time::DateTime` é struct sem generics
   - SQLx espera `chrono::DateTime<Utc>` nas queries

3. **avila-async**: Tokio está profundamente integrado em Axum e SQLx
   - Migração requer fork ou wrapper completo
   - Melhor aguardar `avila-web` estabilizar

### Estratégia de Migração Gradual

```rust
// Futuro: quando avila-web estiver pronto
use avila_web::Server;
use avila_db::Pool;
use avila_serde::{Serialize, Deserialize};
use avila_async::main;

// 100% Avila, zero dependências externas
```

## 🎯 Filosofia Final

> **"Só use externas quando a Avila realmente não consegue"**
>
> Por enquanto, algumas dependências são necessárias por **compatibilidade técnica**, não por falta de equivalentes. A autonomia completa virá quando o ecossistema Arxis estiver 100% estável e interoperável.

## 🔗 Referências

- Arxis: `d:\arxis\`
- avila-frontend: `d:\arxis\avila-frontend\`
- avila-serde: `d:\arxis\avila-serde\`
- avila-time: `d:\arxis\avila-time\`
- avila-async: `d:\arxis\avila-async\`
- avila-error: `d:\arxis\avila-error\`
- avila-id: `d:\arxis\avila-id\`
- avila-telemetry: `d:\arxis\avila-telemetry\`

---

**Criado por:** Nicolas Ávila
**Data:** 2024
**Versão:** 1.0
