# SIGEP 18º BPM — v2 (produção)

Migração do SIGEP do Google Apps Script para arquitetura de produção, no mesmo
padrão do **pequeno-aprendiz**.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma ·
PostgreSQL (Neon) · NextAuth.js · Cloudflare R2 · deploy na Vercel.

---

## As 5 fases

1. **Preparação** — criar repo, banco Neon, conta R2 e exportar o Sheets. *(você está aqui)*
2. **Banco de dados** — modelar tabelas (`prisma/schema.prisma`) e importar os CSV.
3. **Backend** — API Routes que substituem o `doGet`/`doPost`.
4. **Frontend** — recriar o visual em React, ligado às APIs.
5. **Corte** — testar, sincronizar e aposentar o Apps Script.

O Apps Script atual **continua intacto** durante todas as fases.

---

## ✅ Fase 1 — passo a passo

### Parte A — o que SÓ você faz (contas e serviços)

#### 1. Criar o banco no Neon

1. Acesse https://neon.tech e entre com o GitHub.
2. **New Project** → nome `sigep_producao` → região mais próxima (us-east).
3. Em **Connection string**, copie a opção **Pooled connection**.
4. Guarde — vai virar a `DATABASE_URL` no `.env` e no Vercel.

#### 2. Criar o bucket no Cloudflare R2

1. Acesse https://dash.cloudflare.com → menu **R2**.
2. Ative o R2 (pede cartão, mas o plano gratuito cobre PDFs/fotos por muito tempo).
3. **Create bucket** → nome `sigep-documentos`.
4. **Manage R2 API Tokens** → **Create API Token** (permissão *Object Read & Write*).
5. Anote: **Account ID**, **Access Key ID** e **Secret Access Key**.

#### 3. Exportar o Sheets para CSV (backup)

1. Abra o `scripts/exportarSheetsParaCsv.gs` deste projeto.
2. Cole o conteúdo no **seu Apps Script atual** (junto do `Code.gs`).
3. Salve e rode a função **`exportarTudoParaCsv`**.
4. Ele cria uma pasta no seu Drive com um `.csv` por aba. Confira que nada sumiu.
5. **Guarde essa pasta** — é o backup oficial antes da migração.

#### 4. Criar o repositório no GitHub

1. No GitHub: **New repository** → nome `sigep-v2` → **Private** → *sem* README.
2. No seu computador, dentro desta pasta:

   ```bash
   git init
   git add .
   git commit -m "Fase 1: scaffold do SIGEP v2"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/sigep-v2.git
   git push -u origin main
   ```

> O `.gitignore` já protege o `.env` e a pasta de CSV. Eles **não** vão para o GitHub.

---

### Parte B — o que já está pronto neste projeto

```text
sigep-v2/
├── prisma/schema.prisma          ← modelo de dados (Fase 2)
├── scripts/
│   ├── exportarSheetsParaCsv.gs  ← exportador do Sheets (Fase 1)
│   └── importar-csv.mjs          ← importador CSV → Neon (Fase 2)
├── src/
│   ├── app/
│   │   ├── login/                ← tela de login (pronta)
│   │   ├── dashboard/            ← painel (esqueleto)
│   │   └── api/                  ← efetivo, upload, auth
│   ├── lib/                      ← prisma, auth (NextAuth), r2
│   └── components/Providers.tsx
└── middleware.ts                 ← protege as rotas
```

---

### Rodar localmente (depois de A1 e A2)

```bash
npm install
cp .env.example .env      # preencha DATABASE_URL, NEXTAUTH_SECRET e as chaves R2
npm run db:push           # cria as tabelas no Neon
npm run dev               # abre em http://localhost:3000
```

Para criar o primeiro usuário (você, como ADMIN) enquanto o cadastro pela tela
não existe, use o `npm run db:studio` e insira um registro na tabela `usuarios`
com a senha já em hash bcrypt — fechamos isso direitinho na Fase 3.

---

### ✔ Fim da Fase 1

Infraestrutura pronta, SIGEP atual intacto, dados exportados com segurança e o
esqueleto do v2 já no GitHub. Próximo passo: **Fase 2** — fechar o schema com as
colunas reais do CSV e importar os ~218 militares para o Neon.
