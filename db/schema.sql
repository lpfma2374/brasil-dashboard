-- Brasil Dashboard — schema da base Cloudflare D1 "brasil-dashboard-db"
-- Aqui vivem as empresas (20 maiores do RJ + 20 maiores de SP), os decisores de TI e a gestão de conta.
-- As propostas vivem na presales-db (tabela records, app PACE) e as stories na stories-db (só leitura).

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,                   -- br-rj-01 … br-sp-20
  name TEXT NOT NULL, legal_name TEXT,
  market TEXT,                           -- setor de atividade (Valor 1000)
  state TEXT NOT NULL CHECK (state IN ('RJ','SP')),
  headquarters TEXT,                     -- cidade da sede
  revenue_brl_m REAL, revenue_year INTEGER,   -- receita líquida em R$ milhões
  national_rank INTEGER,                 -- posição no Valor 1000
  website TEXT, linkedin_url TEXT, source TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_companies_state ON companies(state, revenue_brl_m DESC);

CREATE TABLE IF NOT EXISTS decision_makers (   -- decisores de TI (mesmo formato do LeadSeeker)
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
  full_name TEXT NOT NULL, linkedin_url TEXT, headline TEXT,
  current_title TEXT, role_category TEXT, seniority TEXT, location TEXT,
  email TEXT, email_status TEXT,
  about TEXT,                            -- "Fonte: <url> (data)"
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dm_company ON decision_makers(company_id);

CREATE TABLE IF NOT EXISTS accounts (
  company_id TEXT PRIMARY KEY,           -- companies.id
  owner TEXT, tier TEXT,
  baseline_volume_eur REAL, baseline_year INTEGER, baseline_notes TEXT, target_eur REAL,  -- legado: substituído por account_plans
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT
);

CREATE TABLE IF NOT EXISTS contacts (     -- registo de contacto no formato de ata de reunião
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
  title TEXT NOT NULL, contact_date TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('presencial','videochamada','email','telefone')),
  attendees TEXT,
  agenda_json TEXT,                      -- [{ point, notes }]
  decisions TEXT, next_steps TEXT,
  attachments_json TEXT,                 -- [{ key, name, size, type }] → objetos no R2 (bucket brasil-docs)
  created_by TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id, contact_date DESC);

CREATE TABLE IF NOT EXISTS deals (        -- negócio efetivo (vendas)
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
  ref TEXT NOT NULL, amount_eur REAL NOT NULL, close_date TEXT NOT NULL,
  source TEXT DEFAULT 'manual',          -- manual | pipeline
  pipeline_record_id TEXT UNIQUE,        -- records.id na presales-db quando convertida do PACE
  notes TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_company ON deals(company_id, close_date);

CREATE TABLE IF NOT EXISTS account_plans (   -- plano estratégico de conta, um por empresa e por ano
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
  plan_year INTEGER NOT NULL,            -- ano do plano (target no final deste ano)
  record_date TEXT NOT NULL,             -- data do registo (a "situação atual" refere-se a esta data)
  initial_volume_eur REAL,               -- situação inicial: volume de negócio no final do ano anterior
  current_volume_eur REAL,               -- situação atual: volume de negócio na data do registo
  target_volume_eur REAL,                -- target: volume de negócio pretendido no final do ano
  sat_initial REAL, sat_target REAL, sat_current REAL,   -- satisfação (escala 0 a 10)
  ambition TEXT, objectives TEXT, priorities TEXT, target_offers TEXT, whitespace TEXT,
  initiatives TEXT, risks TEXT, next_review TEXT,
  status TEXT DEFAULT 'rascunho',
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT,
  UNIQUE (company_id, plan_year)
);
CREATE INDEX IF NOT EXISTS idx_plans_year ON account_plans(plan_year);

CREATE TABLE IF NOT EXISTS satisfaction (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL, survey_date TEXT NOT NULL,
  method TEXT, respondent TEXT,
  nps_score INTEGER CHECK (nps_score BETWEEN 0 AND 10),
  csat_score INTEGER CHECK (csat_score BETWEEN 1 AND 5),
  comment TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sat_company ON satisfaction(company_id, survey_date);

CREATE TABLE IF NOT EXISTS pipeline_links (  -- associação manual proposta PACE ↔ empresa ('__none__' = desassociada)
  record_id TEXT PRIMARY KEY, company_id TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')));
INSERT OR IGNORE INTO settings (key, value) VALUES ('sales_target_year', '2026'), ('sales_target_eur', NULL);
