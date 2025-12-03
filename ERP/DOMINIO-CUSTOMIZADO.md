# 🌐 Configuração do Domínio Customizado

## ✅ Configurado no Repositório:
- Domínio: **arcsat.com.br**
- Arquivo CNAME criado
- Workflow atualizado

---

## 🔧 Configuração DNS Necessária:

No seu provedor de DNS (onde você gerencia arcsat.com.br), configure:

### Opção 1: Usar Subdominios (Recomendado para GitHub Pages)

**Para www.arcsat.com.br:**
```
CNAME   www   avilaops.github.io.
```

**Para arcsat.com.br (apex):**
```
A       @     185.199.108.153
A       @     185.199.109.153
A       @     185.199.110.153
A       @     185.199.111.153
```

### Opção 2: Usar apenas WWW
```
CNAME   www   avilaops.github.io.
```

E redirecionar `arcsat.com.br` → `www.arcsat.com.br` no seu DNS

---

## 📍 Após Configurar DNS:

1. **Aguarde propagação DNS** (5 min - 48 horas)
2. **Verifique em:** https://arcsat.com.br
3. **Configure HTTPS:**
   - Vá em: https://github.com/avilaops/ERP/settings/pages
   - Marque: ✅ "Enforce HTTPS"

---

## 🎯 URLs do seu ERP:

### Frontend:
- **Domínio Customizado:** https://arcsat.com.br
- **GitHub Pages (fallback):** https://avilaops.github.io/ERP/

### Backend:
- **Container:** ghcr.io/avilaops/erp/backend:latest
- **MongoDB Atlas:** Cluster configurado

---

## 🚀 Deploy Final:

### Onde hospedar o backend (container):
1. **Railway.app** (grátis, fácil) - Recomendado
2. **Render.com** (grátis)
3. **Fly.io** (grátis)
4. **Azure Container Instances**
5. **AWS ECS**
6. **Google Cloud Run**

### Próximo Passo:
Após deploy do backend, ajuste a URL da API no frontend de `localhost:3000` para a URL do backend em produção.

---

## ⚙️ Testando DNS:

```bash
# Verificar CNAME
nslookup www.arcsat.com.br

# Verificar A records
nslookup arcsat.com.br
```

---

🎉 **Seu ERP estará disponível em arcsat.com.br após configurar o DNS!**
