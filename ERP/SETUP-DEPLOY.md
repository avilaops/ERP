# 🚀 Setup de Deploy - ERP

## Arquitetura

```
┌─────────────────┐
│  GitHub Pages   │  ← Frontend (WASM)
│  (Static Host)  │
└────────┬────────┘
         │
         │ API Calls
         ▼
┌─────────────────┐
│    Containers   │  ← Backend (Rust + Docker)
│   (Self-hosted) │
└────────┬────────┘
         │
         │ Database
         ▼
┌─────────────────┐
│ MongoDB Atlas   │  ← Database (Cloud)
└─────────────────┘
```

## 1️⃣ Configurar MongoDB Atlas

### Já está configurado! ✅
Você já tem a variável: `MONGO_ATLAS_URI=mongodb+srv://nicolasrosaab_...`

**Verificar:**
1. Acesse: https://cloud.mongodb.com
2. Vá em **Database Access** → Verifique usuário
3. Vá em **Network Access** → Adicione IP `0.0.0.0/0` (todos os IPs)
4. Vá em **Database** → Copie connection string

## 2️⃣ Configurar GitHub Pages

### Passo 1: Habilitar GitHub Pages
1. Vá em: **Settings** → **Pages**
2. Source: `Deploy from a branch`
3. Branch: `gh-pages` (será criada automaticamente)
4. Clique em **Save**

### Passo 2: Configurar Secrets
Vá em: **Settings** → **Secrets and variables** → **Actions**

Adicione:
- `MONGO_ATLAS_URI` - Sua connection string do Atlas

### Passo 3: Executar Deploy
```powershell
# Fazer commit e push
git add .
git commit -m "feat: setup deploy pipeline"
git push origin master
```

O GitHub Actions vai:
1. ✅ Compilar WASM
2. ✅ Deploy no GitHub Pages
3. ✅ Build Docker image e push para GitHub Container Registry

Seu frontend ficará em: `https://avilaops.github.io/ERP/`

## 3️⃣ Deploy Backend com Containers

### Opção A: Deploy Local

```powershell
# Executar deploy automatizado
.\deploy.ps1
```

Serviços em:
- Backend: http://localhost:3000
- Frontend: http://localhost:8080

### Opção B: Deploy em Servidor VPS

```bash
# No servidor (Linux)
# 1. Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 2. Clonar repositório
git clone https://github.com/avilaops/ERP.git
cd ERP

# 3. Configurar .env
cp .env.example .env
nano .env  # Adicionar MONGO_ATLAS_URI

# 4. Deploy
docker-compose up -d

# 5. Ver logs
docker-compose logs -f
```

### Opção C: Usar Imagem do GitHub Container Registry

```powershell
# Pull da imagem
docker pull ghcr.io/avilaops/erp/backend:latest

# Executar
docker run -d \
  -p 3000:3000 \
  -e MONGO_ATLAS_URI="mongodb+srv://..." \
  -e RUST_LOG=info \
  --name erp \
  ghcr.io/avilaops/erp/backend:latest
```

## 4️⃣ Comandos Úteis

### Docker Local

```powershell
# Ver logs
docker-compose logs -f

# Restart serviços
docker-compose restart

# Parar serviços
docker-compose down

# Rebuild completo
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### GitHub Container Registry

```powershell
# Pull última versão
docker pull ghcr.io/avilaops/erp/backend:latest

# Ver imagens disponíveis
# Acesse: https://github.com/avilaops/ERP/pkgs/container/erp%2Fbackend
```

## 5️⃣ Monitoramento

### Health Checks

```powershell
# Backend local
Invoke-WebRequest http://localhost:3000/api/v1/health

# Backend remoto (ajustar URL)
Invoke-WebRequest https://seu-servidor.com/api/v1/health
```

### MongoDB Atlas
1. Acesse: https://cloud.mongodb.com
2. Vá em **Metrics** → Veja performance
3. Vá em **Alerts** → Configure alertas

### Logs Docker

```powershell
# Backend logs
docker logs -f erp-backend

# Todos os logs
docker-compose logs -f
```

## 6️⃣ Backup

### Banco SQLite (se usar local)

```powershell
# Backup manual
docker cp erp-backend:/app/data/avila_erp.db ./backup/avila_erp_$(Get-Date -Format 'yyyyMMdd_HHmmss').db
```

### MongoDB Atlas

Backups automáticos já inclusos! Configure em:
1. Acesse: https://cloud.mongodb.com
2. Vá em **Backup** → Configure snapshot schedule

## 7️⃣ Custos Estimados

| Serviço | Plano | Custo |
|---------|-------|-------|
| GitHub Pages | Free | $0/mês |
| MongoDB Atlas | M0 Sandbox | $0/mês (512MB) |
| GitHub Container Registry | Free (público) | $0/mês |
| VPS (opcional) | DigitalOcean Droplet | $6/mês |

**Total**: **$0-6/mês** dependendo do hosting do backend

## 8️⃣ Checklist de Deploy

- [ ] MongoDB Atlas configurado
- [ ] GitHub Pages habilitado
- [ ] GitHub Secret `MONGO_ATLAS_URI` configurado
- [ ] Backend container rodando (local ou servidor)
- [ ] Frontend deployed no GitHub Pages
- [ ] Health checks passando
- [ ] Testes manuais feitos
- [ ] Backup configurado
- [ ] Monitoramento ativo

## 📞 Recursos

- **MongoDB Atlas**: https://docs.atlas.mongodb.com
- **GitHub Pages**: https://docs.github.com/pages
- **Docker**: https://docs.docker.com
- **GitHub Actions**: https://docs.github.com/actions

---

**🦀 Pronto para produção!**
