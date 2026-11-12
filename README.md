# Brasil Dashboard

Gestão das contas das **20 maiores empresas do Rio de Janeiro** e das **20 maiores de São Paulo** (Noesis Brasil):
interações (contactos no formato de ata de reunião), pipeline de propostas, plano estratégico da conta, volume de negócio
efetivo, decisores de TI e experiência (success stories), com os KPIs no header. Mesmas funcionalidades do
[Norte Dashboard](https://github.com/lpfma2374/norte-dashboard).

Site: **https://brasil.luispedroalvim.dev** (CNAME proxied na Cloudflare → Vercel), atrás do **Cloudflare Access**
(aplicação "Brasil Dashboard", política própria com acesso exclusivo a `luis.alvim@noesis.pt`, sessão de 24h).
Os URLs `*.vercel.app` ficam com Vercel Authentication.

---

## 1. Tech stack

| Camada | Tecnologia | Notas |
|---|---|---|
| Frontend | **HTML + CSS + JavaScript puro** (sem build) | Igual ao Norte Dashboard (Apple, azul `#0071e3`). PDFs das atas e das stories gerados no browser com jsPDF. |
| API | **Vercel Serverless Functions** (Node 24, zero dependências em produção) | Falam com o D1 pela API HTTP da Cloudflare, sempre com queries parametrizadas. |
| Base de dados | **Cloudflare D1** `brasil-dashboard-db` (`bee56b85-e407-4c50-8957-5b806a377129`) | Empresas, decisores de TI e gestão de conta: `companies`, `decision_makers`, `accounts`, `contacts`, `deals`, `account_plans`, `satisfaction`, `pipeline_links`, `settings` (ver `db/schema.sql`). |
| Pipeline | **Cloudflare D1** `presales-db` (app PACE) | Só leitura. Propostas associadas às empresas pelo nome do cliente (ex.: `TV GLOBO` → Globo), com correção manual. |
| Stories | **Cloudflare D1** `stories-db` | Experiência da Noesis por cliente (ex.: TV Globo, Claro Brasil). |
| Documentos | **Cloudflare R2** bucket `brasil-docs` | Anexos dos contactos (até 3 MB), URL assinado de 5 minutos. |
| Recolha | **Firecrawl + Claude** | Ranking: Valor 1000 (edição 2026, receita líquida 2025, coluna Sede). Decisores: LinkedIn, sites oficiais e imprensa. |

```text
 Browser (index.html + js/app.js)
   │ fetch JSON
   ▼
 Vercel Functions  /api/dashboard · contacts · pipeline · account · decision-makers · settings · files · stories
   │ HTTP D1 API (CF_ACCOUNT_ID + CLOUDFLARE_API_TOKEN)          │ S3 API (R2_ACCESS_KEY_ID / SECRET)
   ▼                                                             ▼
 D1 brasil-dashboard-db · presales-db · stories-db                R2 brasil-docs
```

## 2. Página

Igual ao Norte Dashboard, com estas diferenças:

| Elemento | Brasil |
|---|---|
| Lista | 40 empresas ordenadas por receita líquida (coluna **# Estado** = posição no RJ ou em SP), seguidas dos **clientes Noesis fora do top 20** (marcados **C**): Banco ABC Brasil, Prudential do Brasil e PROTESTE. |
| Filtros | Mercado, **Estado** (RJ / SP), Sede (cidade), Empresa, Atividade. |
| Receita da empresa | Em reais (`R$ 497,5 bi`), fonte Valor 1000. |
| Valores Noesis | Planos, vendas e pipeline em **euros**, para ficarem comparáveis com o PACE. |
| Decisores | Só cargos de TI (CIO, CTO, CDO, CISO, diretores de TI/tecnologia/digital), com LinkedIn público ou fonte oficial. |

KPIs: atingimento do target de Sales, Net Revenue Retention, volume do pipeline, conversões em venda e satisfação do cliente
(cálculo igual ao Norte, ver "Como é calculado" em cada KPI).

## 3. API

| Endpoint | Métodos |
|---|---|
| `/api/dashboard` | `GET` empresas com agregados + KPIs |
| `/api/contacts` | `GET ?company_id=` · `GET ?id=` · `POST` · `PUT ?id=` · `DELETE ?id=` |
| `/api/pipeline` | `GET ?company_id=` · `POST {action: link \| unlink \| convert, record_id, company_id}` |
| `/api/account` | `GET ?company_id=` · `PUT {section: account \| plan}` · `POST {kind: deal \| survey}` · `DELETE &deal= \| &survey= \| &plan=` |
| `/api/decision-makers` | `GET ?company_id=` |
| `/api/settings` | `GET` · `PUT {sales_target_year, sales_target_eur}` |
| `/api/files` | `POST {company_id, name, type, data(base64)}` · `GET ?key=` · `DELETE ?key=` |
| `/api/stories` | `GET` · `GET ?id=` |

## 4. Variáveis de ambiente (Vercel)

| Variável | Obrigatória | Notas |
|---|---|---|
| `CF_ACCOUNT_ID` | sim | Account ID Cloudflare |
| `CLOUDFLARE_API_TOKEN` | sim | Token com **D1 Edit** (lê presales/stories e escreve na brasil-dashboard-db) |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | para anexos | Credenciais S3 do R2 com acesso ao bucket `brasil-docs` |
| `BRASIL_DB_ID`, `PRESALES_DB_ID`, `STORIES_DB_ID`, `R2_BUCKET` | não | Já têm os valores de produção por defeito |

## 5. Desenvolvimento

```bash
npm install
npm test          # Vitest: API contra um mock D1/R2 em SQLite em memória (node:sqlite, Node ≥ 22.5)
npm run dev       # http://localhost:3000 com dados de exemplo (MOCK_D1=1)
```

## 6. Dados

- `db/schema.sql`: schema completo. `db/seed-companies.sql`: as 40 empresas (Valor 1000 2026, sede RJ/SP; Valor exclui bancos e seguradoras).
- `db/seed-clientes.sql`: coluna `companies.segment` (`top20` | `cliente`) e os 3 clientes Noesis fora do ranking, com decisores.
- `db/seed-decision-makers.sql`: decisores de TI recolhidos com Firecrawl (fonte em `decision_makers.about` como `Fonte: <url>`).
- Para acrescentar decisores, correr a recolha no Project "Ask My Database" e inserir em `decision_makers` com o `company_id` (`br-rj-01` … `br-sp-20`).
