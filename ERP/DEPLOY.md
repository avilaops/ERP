# 🚀 Guia de Deploy - ERP

## Pré-requisitos

- Docker Desktop instalado
- Docker Compose disponível
- Variável de ambiente `MONGO_ATLAS_URI` configurada (opcional)

## Deploy Local com Docker

### 1. Configuração Inicial

```powershell
# Criar arquivo .env a partir do exemplo
Copy-Item .env.example .env

# Editar .env com suas configurações
notepad .env
```

### 2. Deploy Automático

```powershell
# Executar script de deploy
.\deploy.ps1
```

O script vai:
1. ✅ Verificar Docker
2. ✅ Compilar frontend WASM
3. ✅ Construir imagens Docker
4. ✅ Iniciar containers
5. ✅ Verificar saúde dos serviços

### 3. Acesso

- **Backend API**: http://localhost:3000
- **Frontend Web**: http://localhost:8080
- **Health Check**: http://localhost:3000/api/v1/health

## Deploy Manual

### Compilar Frontend

```powershell
cd frontend-wasm
.\build.ps1
cd ..
```

### Build e Start

```powershell
# Construir imagens
docker-compose build

# Iniciar serviços
docker-compose up -d

# Ver logs
docker-compose logs -f
```

## Comandos Úteis

### Logs

```powershell
# Todos os serviços
docker-compose logs -f

# Apenas backend
docker-compose logs -f backend

# Apenas frontend
docker-compose logs -f frontend
```

### Restart

```powershell
# Reiniciar todos os serviços
docker-compose restart

# Reiniciar apenas backend
docker-compose restart backend
```

### Stop/Start

```powershell
# Parar serviços
docker-compose stop

# Iniciar serviços
docker-compose start

# Parar e remover containers
docker-compose down
```

### Rebuild

```powershell
# Rebuild completo
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Deploy em Produção

### 1. Railway.app

```yaml
# railway.toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "/app/avila-erp-server"
healthcheckPath = "/api/v1/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[[services]]
name = "backend"
port = 3000

[[services]]
name = "frontend"
port = 8080
```

### 2. Fly.io

```toml
# fly.toml
app = "avila-erp"
primary_region = "gru"

[build]
  dockerfile = "Dockerfile"

[env]
  RUST_LOG = "info"

[[services]]
  protocol = "tcp"
  internal_port = 3000
  processes = ["app"]

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

[[services]]
  protocol = "tcp"
  internal_port = 8080
  processes = ["app"]
```

### 3. DigitalOcean App Platform

```yaml
# .do/app.yaml
name: avila-erp
services:
- name: backend
  dockerfile_path: Dockerfile
  github:
    repo: avilaops/Controle-Roncatin
    branch: master
    deploy_on_push: true
  health_check:
    http_path: /api/v1/health
  http_port: 3000
  instance_count: 1
  instance_size_slug: basic-xxs
  routes:
  - path: /api
  envs:
  - key: RUST_LOG
    value: info
  - key: MONGO_ATLAS_URI
    value: ${MONGO_ATLAS_URI}
    type: SECRET

- name: frontend
  image:
    registry_type: DOCKER_HUB
    registry: nginx
    tag: alpine
  github:
    repo: avilaops/Controle-Roncatin
    branch: master
  http_port: 80
  instance_count: 1
  instance_size_slug: basic-xxs
  routes:
  - path: /
```

### 4. AWS ECS (Fargate)

```bash
# Build e push para ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

docker build -t avila-erp .
docker tag avila-erp:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/avila-erp:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/avila-erp:latest

# Deploy com ECS CLI
ecs-cli compose --file docker-compose.yml service up
```

### 5. Kubernetes (GKE/EKS/AKS)

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: avila-erp-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: avila-erp-backend
  template:
    metadata:
      labels:
        app: avila-erp-backend
    spec:
      containers:
      - name: backend
        image: <your-registry>/avila-erp:latest
        ports:
        - containerPort: 3000
        env:
        - name: RUST_LOG
          value: "info"
        - name: MONGO_ATLAS_URI
          valueFrom:
            secretKeyRef:
              name: mongo-secret
              key: uri
        livenessProbe:
          httpGet:
            path: /api/v1/health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
---
apiVersion: v1
kind: Service
metadata:
  name: avila-erp-backend
spec:
  selector:
    app: avila-erp-backend
  ports:
  - port: 3000
    targetPort: 3000
  type: LoadBalancer
```

## Variáveis de Ambiente

| Variável | Descrição | Padrão | Obrigatória |
|----------|-----------|--------|-------------|
| `RUST_LOG` | Nível de log | `info` | Não |
| `DATABASE_URL` | URL do SQLite | `sqlite:///app/data/avila_erp.db` | Não |
| `MONGO_ATLAS_URI` | MongoDB Atlas URI | - | Não |
| `HOST` | Host do servidor | `0.0.0.0` | Não |
| `PORT` | Porta do backend | `3000` | Não |

## Backup

### Banco SQLite

```powershell
# Backup manual
docker cp avila-erp-backend:/app/data/avila_erp.db ./backup/avila_erp_$(Get-Date -Format 'yyyyMMdd_HHmmss').db
```

### Backup Automático (cron)

```bash
# Adicionar ao crontab
0 2 * * * docker cp avila-erp-backend:/app/data/avila_erp.db /backups/avila_erp_$(date +\%Y\%m\%d).db
```

## Monitoramento

### Logs

```powershell
# Logs em tempo real
docker-compose logs -f --tail=100

# Logs de erro
docker-compose logs | Select-String "ERROR"
```

### Métricas

```powershell
# Status dos containers
docker-compose ps

# Uso de recursos
docker stats
```

### Health Check

```powershell
# Verificar saúde do backend
Invoke-WebRequest -Uri "http://localhost:3000/api/v1/health" | Select-Object StatusCode

# Verificar dashboard
Invoke-WebRequest -Uri "http://localhost:3000/api/v1/dashboard" | Select-Object StatusCode
```

## Troubleshooting

### Container não inicia

```powershell
# Ver logs do container
docker-compose logs backend

# Entrar no container
docker-compose exec backend /bin/bash
```

### Porta em uso

```powershell
# Verificar portas em uso
netstat -ano | Select-String "3000"
netstat -ano | Select-String "8080"

# Matar processo
Stop-Process -Id <PID> -Force
```

### Rebuild completo

```powershell
# Limpar tudo e reconstruir
docker-compose down -v
docker system prune -a
.\deploy.ps1
```

## Segurança

### HTTPS com Caddy

```dockerfile
# Adicionar ao docker-compose.yml
  caddy:
    image: caddy:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    restart: unless-stopped
```

```caddyfile
# Caddyfile
seu-dominio.com {
    reverse_proxy frontend:80
    reverse_proxy /api/* backend:3000
}
```

### Firewall

```bash
# Permitir apenas portas necessárias
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw enable
```

---

**🦀 Feito com Rust e ❤️**
