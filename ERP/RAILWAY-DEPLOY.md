# 🚂 Deploy Railway - Guia Rápido

## ✅ Arquivos criados:
- `railway.json` - Configuração do Railway
- `Dockerfile.railway` - Build otimizado para Railway

---

## 🔧 Configuração no Railway (5 minutos):

### 1️⃣ Adicionar Serviço GitHub

No projeto Railway (já aberto no navegador):

1. Clique em **"+ New"** ou **"New Service"**
2. Selecione **"GitHub Repo"**
3. Escolha: **avilaops/ERP**
4. Confirme

---

### 2️⃣ Configurar Variáveis de Ambiente

No serviço criado, vá em **"Variables"** e adicione:

```env
MONGO_ATLAS_URI=$MONGO_ATLAS_URI (usar a mesma do ambiente local)
PORT=3000
RUST_LOG=info
DATABASE_URL=sqlite:///app/database/erp.db
```

⚠️ **IMPORTANTE:** Pegue o valor de `MONGO_ATLAS_URI` do seu ambiente local (já está configurado). 
NÃO commitar credenciais no Git!

---

### 3️⃣ Configurar Settings

Em **"Settings"**:

1. **Root Directory:** (deixe vazio ou `/`)
2. **Dockerfile Path:** `Dockerfile.railway`
3. **Build Command:** (deixe vazio, usa Dockerfile)
4. **Start Command:** (deixe vazio, usa CMD do Dockerfile)

---

### 4️⃣ Deploy!

1. Clique em **"Deploy"** (ou espere deploy automático)
2. Aguarde build (~5-10 min)
3. Quando completar, clique em **"Settings"** → **"Networking"**
4. Clique em **"Generate Domain"**
5. Copie a URL gerada (ex: `erp-production.up.railway.app`)

---

## 🎯 Próximo Passo: Atualizar Frontend

Após obter a URL do Railway, você precisará atualizar o frontend para usar essa URL em vez de `localhost:3000`.

A URL será algo como:
```
https://erp-production-xxxx.up.railway.app
```

---

## 📊 Resumo da Infraestrutura Final:

```
┌─────────────────────┐
│   arcsat.com.br     │  ← Frontend (GitHub Pages)
│   (WASM/HTML/CSS)   │
└──────────┬──────────┘
           │
           │ HTTPS API Calls
           ↓
┌─────────────────────┐
│   Railway.app       │  ← Backend (Rust + Axum)
│ erp-production.xxx  │     projeto: 0d07c0b1-50b0...
└──────────┬──────────┘
           │
           │ MongoDB Driver
           ↓
┌─────────────────────┐
│   MongoDB Atlas     │  ← Database
│   Cluster0          │
└─────────────────────┘
```

---

## ✅ Checklist:

- [ ] Serviço GitHub adicionado no Railway
- [ ] Variáveis de ambiente configuradas
- [ ] Settings do Dockerfile configurados
- [ ] Deploy iniciado/completo
- [ ] Domain gerado
- [ ] URL do backend copiada
- [ ] Frontend atualizado com URL do backend

---

## 🐛 Troubleshooting:

### Build falha?
- Verifique logs no Railway
- Confirme que `Dockerfile.railway` está na raiz
- Verifique variáveis de ambiente

### Backend não responde?
- Verifique se a porta 3000 está exposta
- Confirme que `MONGO_ATLAS_URI` está correto
- Veja logs em "Deployments" → último deploy → "View Logs"

---

**Projeto Railway:** https://railway.app/project/0d07c0b1-50b0-4317-873a-c59220a0606d

🚀 **Assim que o deploy completar, me avise para eu atualizar o frontend com a URL!**
