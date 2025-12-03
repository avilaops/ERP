# 🚀 Deploy ERP - Status Atual

## ✅ Repositório Configurado

**Nome:** `avilaops/ERP`  
**URL:** https://github.com/avilaops/ERP

---

## 📋 Próximos Passos IMEDIATOS:

### 1️⃣ Verificar GitHub Actions (AGORA!)

Acesse: https://github.com/avilaops/ERP/actions

Você verá os workflows rodando:
- ✅ **Deploy Avila ERP** - em execução

**Possíveis Status:**
- 🟡 **Em andamento** - Aguarde a compilação
- ✅ **Sucesso** - Deploy completo!
- ❌ **Falha** - Veja os logs e ajuste

---

### 2️⃣ Configurar Secret do MongoDB (CRÍTICO!)

⚠️ **O build do backend vai FALHAR sem isso!**

**Passo a passo:**
1. Acesse: https://github.com/avilaops/ERP/settings/secrets/actions
2. Clique em **"New repository secret"**
3. Preencha:
   - **Name:** `MONGO_ATLAS_URI`
   - **Secret:** Sua connection string do MongoDB Atlas
   - Exemplo: `mongodb+srv://usuario:senha@cluster.mongodb.net/erp?retryWrites=true&w=majority`
4. Clique em **"Add secret"**

---

### 3️⃣ Configurar GitHub Pages

**Passo a passo:**
1. Acesse: https://github.com/avilaops/ERP/settings/pages
2. Em **"Source"**, selecione:
   - **Branch:** `gh-pages` (será criado automaticamente após primeiro build)
   - **Folder:** `/ (root)`
3. Clique em **"Save"**

⚠️ **Nota:** Se `gh-pages` ainda não aparecer, aguarde o primeiro workflow completar!

---

## 🎯 URLs do seu ERP:

### Frontend (após deploy):
```
https://avilaops.github.io/ERP/
```

### Backend Container (após build):
```
ghcr.io/avilaops/erp/backend:latest
```

### Para rodar backend local:
```bash
docker pull ghcr.io/avilaops/erp/backend:latest

docker run -p 3000:3000 \
  -e MONGO_ATLAS_URI="sua-connection-string" \
  ghcr.io/avilaops/erp/backend:latest
```

---

## 🔍 Monitoramento do Deploy:

### 1. Acompanhe o Actions:
https://github.com/avilaops/ERP/actions

### 2. Verifique os Jobs:
- **deploy-frontend** → Compila WASM + Deploy GitHub Pages
- **build-backend** → Build Docker + Push GHCR

### 3. Logs úteis:
- Clique no workflow em execução
- Expanda cada step para ver detalhes
- Se falhar, leia a mensagem de erro

---

## ⚠️ Problemas Comuns:

### ❌ Frontend build falha?
**Causa:** Erro de compilação Rust/WASM  
**Solução:** Verifique logs, pode ser dependência faltando

### ❌ Backend build falha?
**Causa:** `MONGO_ATLAS_URI` não configurado  
**Solução:** Configure o Secret (Passo 2️⃣ acima)

### ❌ GitHub Pages não aparece?
**Causa:** Branch `gh-pages` não criado ainda  
**Solução:** Aguarde primeiro workflow completar com sucesso

### ❌ Container não faz push?
**Causa:** Permissão do GHCR  
**Solução:** Vai em Settings → Actions → General → Workflow permissions → "Read and write permissions"

---

## ✨ Checklist Final:

- [ ] ✅ Repositório renomeado para `ERP`
- [ ] ✅ Git remote atualizado
- [ ] ✅ Código pushed
- [ ] ⏳ GitHub Actions em execução
- [ ] ❓ Secret `MONGO_ATLAS_URI` configurado
- [ ] ❓ GitHub Pages configurado
- [ ] ❓ Primeiro build completo
- [ ] ❓ Frontend acessível
- [ ] ❓ Backend container disponível

---

## 🎉 Quando tudo estiver pronto:

1. **Frontend estará em:** https://avilaops.github.io/ERP/
2. **Backend container em:** GHCR (puxe com docker)
3. **Próximo passo:** Hospedar backend em alguma cloud (Railway/Render/Fly.io)

---

**🚀 AÇÃO IMEDIATA:**  
Configure o Secret do MongoDB AGORA para o build não falhar!

https://github.com/avilaops/ERP/settings/secrets/actions
