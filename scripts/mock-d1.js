// Mock local da API HTTP do Cloudflare D1 e do R2 (testes e dev-server, sem credenciais).
// Usa o SQLite nativo do Node (node:sqlite). Cada base é um SQLite em memória com o schema real e dados de exemplo.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const Database = DatabaseSync;
const { DB } = require('../api/_lib');

function seed() {
  const br = new Database(':memory:');
  br.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  const ins = br.prepare('INSERT INTO companies (id,name,market,state,headquarters,revenue_brl_m,revenue_year,national_rank) VALUES (?,?,?,?,?,?,?,?)');
  [['br-rj-01', 'Petrobras', 'Petróleo e Gás', 'RJ', 'Rio de Janeiro', 497549, 2025, 1],
    ['br-sp-01', 'JBS', 'Alimentos e Bebidas', 'SP', 'São Paulo', 480583, 2025, 2],
    ['br-rj-02', 'Vale', 'Mineração', 'RJ', 'Rio de Janeiro', 213595, 2025, 4],
    ['br-rj-11', 'Globo', 'Comunicação e Gráfica', 'RJ', 'Rio de Janeiro', 18283.4, 2025, 80],
    ['br-sp-15', 'Claro', 'TI & Telecom', 'SP', 'São Paulo', 51812.1, 2025, 27]]
    .forEach((r) => ins.run(...r));
  br.prepare("INSERT INTO companies (id,name,market,state,headquarters,segment) VALUES ('br-cli-prudential','Prudential do Brasil','Seguros','RJ','Rio de Janeiro','cliente')").run();
  const dm = br.prepare('INSERT INTO decision_makers (id,company_id,full_name,linkedin_url,current_title,seniority,email) VALUES (?,?,?,?,?,?,?)');
  dm.run('dm1', 'br-rj-11', 'Ana Exemplo', 'https://br.linkedin.com/in/ana-exemplo', 'CIO', 'C-Level', 'ana@exemplo.com.br');
  dm.run('dm2', 'br-rj-11', 'Rui Teste', 'https://www.linkedin.com/in/rui-teste', 'Head of IT', 'Head', null);
  dm.run('dm3', 'br-sp-01', 'Marta Demo', 'javascript:alert(1)', 'CDO', 'C-Level', null);
  br.prepare("INSERT INTO decision_makers (id,company_id,full_name,current_title,seniority,about) VALUES ('dm4','br-sp-15','Diretor TI','Diretor de Tecnologia','Director','Fonte: https://www.claro.com.br/institucional/x (2025-10-30)')").run();

  const ps = new Database(':memory:');
  ps.exec(`CREATE TABLE records (id TEXT PRIMARY KEY, scope TEXT, client TEXT NOT NULL, ref TEXT, status TEXT, price REAL, effort REAL,
            total_cost REAL, start_date TEXT, end_date TEXT, description TEXT, created_time TEXT)`);
  const rec = ps.prepare('INSERT INTO records (id,scope,client,ref,status,price,start_date,end_date) VALUES (?,?,?,?,?,?,?,?)');
  rec.run('r1', 'IT Advisory', 'TV GLOBO', 'Framework DevOps', 'Ganha', 60000, '2025-11-08', '2026-04-04');
  rec.run('r2', 'Proposta', 'TV GLOBO', 'AMS 3 anos', 'Em negociação', 900000, '2026-09-01', '2026-10-01');
  rec.run('r3', 'Proposta', 'JBS S.A.', 'Testing Managed Services', 'Perdida', 400000, '2025-03-01', '2025-04-01');
  rec.run('r4', 'Proposta', 'Worten', 'RFI Sourcing', 'Em qualificação', null, '2026-05-15', null);
  rec.run('r5', 'Paper', 'QMDA', 'Testing Managed Services (Sonae)', 'Entregue', null, '2025-03-04', '2025-03-28');
  rec.run('r6', 'Proposta', 'GALP', 'Integration Platforms', 'Ganha', 515000, '2026-08-07', '2026-08-14');

  const st = new Database(':memory:');
  st.exec(`CREATE TABLE stories (id TEXT PRIMARY KEY, title TEXT, client TEXT, industry TEXT, geo TEXT, serviceType TEXT, bu TEXT, status TEXT,
            date TEXT, techStack TEXT, challenge TEXT, solution TEXT, metrics TEXT, qualitativeResults TEXT, clientQuote TEXT, clientQuoteAuthor TEXT)`);
  st.prepare("INSERT INTO stories VALUES ('s1','Quality Engineering na Claro','Claro Brasil','consumer_goods','europe','managed_services','QMDA','published','2025-01-01','Selenium','Desafio','Solução','[]','[]','','')").run();

  return { [DB.brasil()]: br, [DB.presales()]: ps, [DB.stories()]: st };
}

function install() {
  process.env.CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || 'test-account';
  process.env.CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'test-token';
  process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret';
  const dbs = seed();
  const r2 = new Map();
  const realFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const u = String(url);
    const m = u.match(/\/d1\/database\/([^/]+)\/query$/);
    if (m) {
      const db = dbs[m[1]];
      if (!db) return new Response(JSON.stringify({ success: false, errors: [{ message: 'DB desconhecida' }] }));
      const { sql, params } = JSON.parse(init.body);
      try {
        const stmts = sql.split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)/).map((s) => s.trim()).filter(Boolean);
        const result = stmts.map((s) => {
          const st = db.prepare(s);
          const p = (params || []).map((v) => (typeof v === 'boolean' ? Number(v) : v === undefined ? null : v));
          return { results: st.columns().length ? st.all(...p) : (st.run(...p), []), success: true };
        });
        return new Response(JSON.stringify({ success: true, result }));
      } catch (e) {
        return new Response(JSON.stringify({ success: false, errors: [{ message: e.message }] }));
      }
    }
    if (/r2\.cloudflarestorage\.com/.test(u)) {
      const key = decodeURIComponent(new URL(u).pathname.split('/').slice(2).join('/'));
      if (init.method === 'PUT') { r2.set(key, init.body); return new Response('', { status: 200 }); }
      if (init.method === 'DELETE') { r2.delete(key); return new Response('', { status: 204 }); }
    }
    return realFetch(url, init);
  };
  return { dbs, r2 };
}

module.exports = { install };
