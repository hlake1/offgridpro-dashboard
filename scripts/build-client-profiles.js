#!/usr/bin/env node
/*
 * Build-client-profiles
 * Generates client reporting profiles (SCL, Autowatch, AUTOID) matching the
 * GFS / OffGrid Pro pattern. Each client gets:
 *   [client]/index.html
 *   [client]/admin/builder.html
 *   [client]/admin/view.html
 *   [client]/assets/auth.js
 *   [client]/assets/reports-store.js
 *   [client]/june-2026/index.html   (placeholder)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ----------------------------------------------------------------------------
// AI report assistant (Cloudflare Worker) — see /cloudflare-worker/README.md
// ----------------------------------------------------------------------------
const AI_WORKER_URL = 'https://tweak-report-ai.herbielakeai.workers.dev';

// ----------------------------------------------------------------------------
// Client config
// ----------------------------------------------------------------------------
const CLIENTS = [
  {
    slug: 'scl',
    NS: 'SCL',                 // JS namespace prefix (window.SCLAuth / SCLReports)
    authKey: 'scl_dashboard_auth',
    reportsKey: 'scl_reports_v1',
    adminClass: 'scl-admin',
    clientCode: 'Scl',         // login access code (client)
    name: 'SCL',
    fullName: 'SCL',
    tagline: 'Secure Communications & Logistics',
    sector: 'Security · Technology',
    location: 'UK',
    accountManager: 'Daniela',
    // Branding: turquoise primary, purple accent, white/black
    c1: '#0f766e',   // deep turquoise
    c2: '#17a697',   // turquoise primary
    c3: '#2dd4bf',   // light turquoise
    accent: '#8b5cf6', // purple accent
    dark: '#0b2e2b',   // near-black turquoise for hero base
    heroA: '#07201d',
    heroB: '#0b3d38',
    heroC: '#17a697',
    previewStats: [
      { label: 'Conversions', value: '—' },
      { label: 'Top Channel', value: '—' },
      { label: 'Site Health', value: '—' },
    ],
  },
  {
    slug: 'autowatch',
    NS: 'Autowatch',
    authKey: 'autowatch_dashboard_auth',
    reportsKey: 'autowatch_reports_v1',
    adminClass: 'autowatch-admin',
    clientCode: 'Autowatch',
    name: 'Autowatch',
    fullName: 'Autowatch',
    tagline: 'Vehicle Security Systems',
    sector: 'Automotive · Security',
    location: 'UK',
    accountManager: 'Louise',
    // Branding: dark navy, silver accent, white/black
    c1: '#1a1a1a',   // dark navy/black
    c2: '#3a3f4a',   // slate
    c3: '#8a94a6',   // silver-blue
    accent: '#c0c0c0', // silver accent
    dark: '#0d0f14',
    heroA: '#0d0f14',
    heroB: '#1a1f2b',
    heroC: '#3a3f4a',
    previewStats: [
      { label: 'Conversions', value: '—' },
      { label: 'Top Channel', value: '—' },
      { label: 'Site Health', value: '—' },
    ],
  },
  {
    slug: 'autoid',
    NS: 'AUTOID',
    authKey: 'autoid_dashboard_auth',
    reportsKey: 'autoid_reports_v1',
    adminClass: 'autoid-admin',
    clientCode: 'Autoid',
    name: 'AUTOID',
    fullName: 'AUTOID',
    tagline: 'Identification & Data Capture',
    sector: 'Technology · AIDC',
    location: 'UK',
    accountManager: 'Louise',
    // Branding: bright blue, white/dark
    c1: '#1e40af',   // deep blue
    c2: '#2563eb',   // bright blue primary
    c3: '#60a5fa',   // light blue
    accent: '#f59e0b', // amber accent for contrast
    dark: '#0a1633',
    heroA: '#0a1633',
    heroB: '#0f2557',
    heroC: '#2563eb',
    previewStats: [
      { label: 'Conversions', value: '—' },
      { label: 'Top Channel', value: '—' },
      { label: 'Site Health', value: '—' },
    ],
  },
  {
    slug: 'offgridpro',
    NS: 'OGP',
    authKey: 'ogp_dashboard_auth',
    reportsKey: 'ogp_reports_v1',
    adminClass: 'ogp-admin',
    clientCode: 'OffGrid',
    name: 'OffGrid Pro',
    fullName: 'OffGrid Pro Ltd.',
    tagline: 'Battery Storage & Microgrids',
    sector: 'Energy · Battery Storage',
    location: 'Southampton, UK',
    accountManager: 'Louise',
    // Branding: matches the original OffGrid Pro dashboard (green/teal/blue accent bar)
    c1: '#a3c94a',
    c2: '#4bc7bf',
    c3: '#5aa5d8',
    accent: '#5aa5d8',
    dark: '#1a1a1a',
    heroA: '#1e293b',
    heroB: '#16202f',
    heroC: '#0f172a',
    previewStats: [
      { label: 'Conversions', value: '—' },
      { label: 'Top Channel', value: '—' },
      { label: 'Site Health', value: '—' },
    ],
  },
  {
    slug: 'gfs',
    NS: 'GFS',
    authKey: 'gfs_dashboard_auth',
    reportsKey: 'gfs_reports_v1',
    adminClass: 'gfs-admin',
    clientCode: 'GFS',
    name: 'GFS',
    fullName: 'Global Freight Solutions',
    tagline: 'Logistics & eCommerce Shipping',
    sector: 'Logistics · eCommerce Shipping',
    location: 'UK',
    accountManager: 'Imogen',
    // Branding: matches the original GFS dashboard (navy/blue accent bar)
    c1: '#004080',
    c2: '#0066b3',
    c3: '#0099cc',
    accent: '#0099cc',
    dark: '#0a1f3d',
    heroA: '#0a1f3d',
    heroB: '#002855',
    heroC: '#004080',
    previewStats: [
      { label: 'Conversions', value: '—' },
      { label: 'Top Channel', value: '—' },
      { label: 'Site Health', value: '—' },
    ],
  },
];

// Every client shares the one AI Worker deployment.
CLIENTS.forEach((c) => { c.aiWorkerUrl = AI_WORKER_URL; });

// ----------------------------------------------------------------------------
// Meta Ads Connect (Cloudflare Worker) — see /meta-ads-worker/README.md
// ----------------------------------------------------------------------------
// Every client shares the one Worker deployment too; what's per-client is
// which team member's connected Meta login the report builder asks it to
// pull with. That's just each client's account manager, lowercased into the
// same "member" slug they'd use with /start?member=<slug> — so once Daniela
// (say) connects her own Meta account once, every client she manages can
// pull through that same connection without asking her to connect per-client.
// Every team member can connect on behalf of any client — nobody's
// personal Meta/Google login is tied to just the clients they manage.
// The builder page shows a "Connecting as" picker (built from this list)
// instead of a fixed per-client member, remembered per browser via
// localStorage so switching clients doesn't mean re-picking every time.
const TEAM_MEMBERS = ['Daniela', 'Imogen', 'Louise', 'Herbie'];
function slugify(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

const META_WORKER_URL = 'https://tweak-meta-ads.herbielakeai.workers.dev';
CLIENTS.forEach((c) => {
  c.metaWorkerUrl = META_WORKER_URL;
  c.teamMembers = TEAM_MEMBERS;
  // Used only as this client's default pick in the "Connecting as" selector —
  // whoever's actually building the report can switch it to anyone on the team.
  c.defaultMember = slugify(c.accountManager || TEAM_MEMBERS[0]);
  c.metaMember = c.defaultMember; // kept for anything still reading the old field name
});

// ----------------------------------------------------------------------------
// Google account connect (Cloudflare Worker) — see /google-oauth-worker/README.md
// ----------------------------------------------------------------------------
// Same "member" convention as Meta above.
const GOOGLE_WORKER_URL = 'https://tweak-google-oauth.herbielakeai.workers.dev';
CLIENTS.forEach((c) => {
  c.googleWorkerUrl = GOOGLE_WORKER_URL;
  c.googleMember = c.metaMember;
});

// ----------------------------------------------------------------------------
// Templates
// ----------------------------------------------------------------------------

function authJS(c) {
  return `/*!
 * ${c.name} Dashboard — Auth gate
 * Simple client-side password protection using sessionStorage.
 *  - "${c.clientCode}" → client role (default view)
 *  - "Tweak"           → admin role (unlocks Monthly Report builder etc.)
 *
 * NOTE: Friction gate for a prototype, not real security.
 * Any real access control must be enforced server-side.
 */
(function () {
  const STORAGE_KEY = '${c.authKey}';
  const PASSWORDS = {
    ${c.clientCode}: 'client',
    Tweak: 'admin',
  };

  function getRole() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { role } = JSON.parse(raw);
        if (role === 'client' || role === 'admin') return role;
      }
    } catch { /* fall through */ }

    // Honour Tweak Reporting portal session (from root landing page)
    try {
      const rawTw = sessionStorage.getItem('tw_session');
      if (rawTw) {
        const s = JSON.parse(rawTw);
        if (s && s.type === 'client') { setRole('client'); return 'client'; }
        if (s && (s.type === 'team' || s.type === 'admin')) { setRole('admin'); return 'admin'; }
      }
    } catch { /* ignore */ }

    return null;
  }

  function setRole(role) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ role, ts: Date.now() }));
  }

  function clearRole() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function paintOverlay(onSubmit) {
    const overlay = document.createElement('div');
    overlay.id = '${c.slug}-auth-overlay';
    overlay.style.cssText = \`
      position:fixed;inset:0;background:#f7f8fa;z-index:99999;
      display:flex;align-items:center;justify-content:center;font-family:'Montserrat',Helvetica,Arial,sans-serif;
    \`;
    overlay.innerHTML = \`
      <form id="${c.slug}-auth-form" style="max-width:380px;width:calc(100% - 3rem);background:#fff;padding:2rem 2.25rem;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 12px 30px rgba(0,0,0,0.06);">
        <div style="font-size:11px;letter-spacing:0.2em;color:#6b7280;text-transform:uppercase;font-weight:600;">Tweak Reporting</div>
        <div style="height:4px;background:linear-gradient(90deg,${c.c1} 0%,${c.c2} 60%,${c.c3} 100%);border-radius:2px;margin:0.75rem 0 1.25rem;"></div>
        <h1 style="font-size:1.5rem;font-weight:500;color:#111;margin:0 0 0.5rem;">${c.name} · Performance Reports</h1>
        <p style="font-size:0.875rem;color:#6b7280;margin:0 0 1.25rem;line-height:1.5;">Enter your access code to continue.</p>
        <input id="${c.slug}-auth-input" type="password" autofocus placeholder="Access code"
          style="width:100%;padding:0.7rem 0.85rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.95rem;font-family:inherit;letter-spacing:0.05em;" />
        <p id="${c.slug}-auth-err" style="color:#dc2626;font-size:0.8rem;margin:0.55rem 0 0;min-height:1em;"></p>
        <button type="submit" style="margin-top:0.9rem;width:100%;background:${c.dark};color:#fff;padding:0.7rem;border:none;border-radius:4px;font-size:0.9rem;font-weight:500;letter-spacing:0.05em;cursor:pointer;">
          Continue
        </button>
      </form>
    \`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('#${c.slug}-auth-form');
    const input = overlay.querySelector('#${c.slug}-auth-input');
    const err = overlay.querySelector('#${c.slug}-auth-err');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = input.value.trim();
      const role = PASSWORDS[val];
      if (!role) { err.textContent = 'Incorrect code. Try again.'; input.select(); return; }
      setRole(role);
      overlay.remove();
      onSubmit(role);
    });
  }

  function isAdmin() { return getRole() === 'admin'; }
  function isClient() { return getRole() === 'client'; }
  function isAuthed() { return isAdmin() || isClient(); }

  function emitAuth(role) {
    document.dispatchEvent(new CustomEvent('${c.slug}:auth', { detail: { role } }));
    if (typeof window.${c.NS}AuthReady === 'function') window.${c.NS}AuthReady(role);
  }

  function ensureAuth(opts) {
    opts = opts || {};
    const role = getRole();
    if (role) {
      document.documentElement.classList.toggle('${c.adminClass}', role === 'admin');
      queueMicrotask(() => emitAuth(role));
      if (typeof opts.onSuccess === 'function') opts.onSuccess(role);
      return role;
    }
    const guard = document.createElement('div');
    guard.id = '${c.slug}-auth-guard';
    guard.style.cssText = 'position:fixed;inset:0;background:#f7f8fa;z-index:99998;';
    document.documentElement.appendChild(guard);
    document.addEventListener('DOMContentLoaded', () => {
      paintOverlay((role) => {
        document.documentElement.classList.toggle('${c.adminClass}', role === 'admin');
        guard.remove();
        emitAuth(role);
        if (typeof opts.onSuccess === 'function') opts.onSuccess(role);
      });
    });
    return null;
  }

  function requireAdmin(redirectTo) {
    if (isAdmin()) return true;
    const target = redirectTo || '../';
    if (isClient()) { location.replace(target); return false; }
    return false;
  }

  window.${c.NS}Auth = {
    ensureAuth,
    getRole,
    setRole,
    clearRole,
    isAdmin,
    isClient,
    isAuthed,
    requireAdmin,
    logout(redirectTo) {
      clearRole();
      try { sessionStorage.removeItem('tw_session'); } catch {}
      window.location.href = redirectTo || '../';
    },
  };
})();
`;
}

function reportsStoreJS(c) {
  return `/*!
 * ${c.name} Dashboard — Reports store
 *
 * Manages monthly reports created via the admin builder. Reports are
 * stored centrally via the Tweak Reports Worker (Cloudflare Worker +
 * Supabase), so a published report is visible from any device or
 * browser — not just the one that created it.
 *
 * Every method here is async (returns a Promise) and needs an
 * Authorization session (tw_session, set by the root login page).
 */
(function () {
  const WORKER_URL = 'https://tweak-reports.herbielakeai.workers.dev';
  const CLIENT_SLUG = '${c.slug}';

  const QUESTIONS = [
    { id: 'q1', label: 'What was your biggest win this month?', hint: 'The headline result — the thing you\\'d lead with in a meeting.' },
    { id: 'q2', label: 'Which campaign or channel exceeded expectations?', hint: 'Name it and say why it outperformed.' },
    { id: 'q3', label: 'Any client feedback or anecdotes worth capturing?', hint: 'Quotes, calls, positive/negative signals from ${c.name}.' },
    { id: 'q4', label: 'What was the main strategic focus this month?', hint: 'The theme you were working towards.' },
    { id: 'q5', label: 'Why did you prioritise these changes?', hint: 'The reasoning behind the pivots or new tests.' },
    { id: 'q6', label: 'Any pivots or challenges?', hint: 'What didn\\'t work, what you paused, what you had to work around.' },
    { id: 'q7', label: 'Top 3 priorities for next month?', hint: 'List them clearly — these become the "Next Steps" section.' },
    { id: 'q8', label: 'Budget or strategy changes planned?', hint: 'Reallocations, new tests, paused campaigns.' },
    { id: 'q9', label: 'Anything else to highlight?', hint: 'Optional. Notes, credits, footnotes, upcoming launches.' },
  ];

  function getToken() {
    try {
      const raw = sessionStorage.getItem('tw_session');
      if (!raw) return null;
      const s = JSON.parse(raw);
      return (s && s.token) || null;
    } catch { return null; }
  }

  async function apiFetch(path, opts) {
    opts = opts || {};
    const token = getToken();
    const headers = Object.assign({}, opts.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(WORKER_URL + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* ignore */ }
    if (!res.ok) throw new Error((json && json.error) || ('Request failed (' + res.status + ')'));
    return json;
  }

  function fromRow(row) {
    if (!row) return null;
    return {
      id: row.period,
      month: row.period,
      title: row.title || '',
      author: row.author || '',
      status: row.status,
      answers: row.answers || {},
      seRankings: row.se_rankings || null,
      manualData: row.manual_data || null,
      summary: row.generated || null,
      revisionNotes: row.revision_notes || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
    };
  }

  function toRow(report) {
    return {
      client: CLIENT_SLUG,
      period: report.id || report.month,
      title: report.title || null,
      author: report.author || null,
      status: report.status || 'draft',
      answers: report.answers || {},
      seRankings: report.seRankings || null,
      manualData: report.manualData || null,
      generated: report.summary || null,
      revisionNotes: report.revisionNotes || [],
    };
  }

  async function list() {
    const { reports } = await apiFetch('/reports/list?client=' + encodeURIComponent(CLIENT_SLUG));
    return (reports || []).map(fromRow);
  }
  async function listPublished() { return (await list()).filter(r => r.status === 'published'); }
  async function listDrafts()    { return (await list()).filter(r => r.status === 'draft'); }

  async function get(id) {
    if (!id) return null;
    const { report } = await apiFetch('/reports/one?client=' + encodeURIComponent(CLIENT_SLUG) + '&period=' + encodeURIComponent(id));
    return fromRow(report);
  }

  async function upsert(report) {
    const { report: saved } = await apiFetch('/reports/save', { method: 'POST', body: toRow(report) });
    return fromRow(saved);
  }

  async function publish(id) {
    const r = await get(id);
    if (!r) return null;
    r.status = 'published';
    return upsert(r);
  }

  async function unpublish(id) {
    const r = await get(id);
    if (!r) return null;
    r.status = 'draft';
    return upsert(r);
  }

  async function addRevisionNote(id, note) {
    const r = await get(id);
    if (!r) return null;
    r.revisionNotes = r.revisionNotes || [];
    r.revisionNotes.push({ ts: new Date().toISOString(), note });
    if (r.status === 'published') r.status = 'draft';
    return upsert(r);
  }

  function generateSummary(answers, adsData) {
    const totals = adsData?.totals || null;
    const campaigns = (adsData?.campaigns || []).slice().sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
    const topCampaign = campaigns.find(c => c.status === 'ENABLED') || campaigns[0] || null;
    const activeCampaigns = campaigns.filter(c => c.status === 'ENABLED');

    const priorities = (answers.q7 || '')
      .split(/\\r?\\n|·|•|;|,\\s*(?=\\d\\.)/)
      .map(s => s.replace(/^\\s*\\d+\\.\\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 5);

    const headline = (answers.q1 || '').trim() || 'Solid month of steady growth across active campaigns.';
    const focus = (answers.q4 || '').trim();
    const rationale = (answers.q5 || '').trim();
    const challenges = (answers.q6 || '').trim();
    const feedback = (answers.q3 || '').trim();
    const budget = (answers.q8 || '').trim();
    const overperformer = (answers.q2 || '').trim();
    const extras = (answers.q9 || '').trim();

    return {
      headline, overperformer, feedback, focus, rationale, challenges,
      priorities, budget, extras,
      metrics: totals,
      topCampaign,
      activeCampaigns: activeCampaigns.map(c => c.name),
      generatedAt: new Date().toISOString(),
    };
  }

  function monthLabel(month) {
    if (!month || !/^\\d{4}-\\d{2}$/.test(month)) return month || '';
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  window.${c.NS}Reports = {
    QUESTIONS, list, listPublished, listDrafts, get, upsert,
    publish, unpublish, addRevisionNote, generateSummary, monthLabel,
  };
})();
`;
}

module.exports = { CLIENTS, ROOT, authJS, reportsStoreJS, TEAM_MEMBERS };

if (require.main === module) {
  console.log('This module is imported by build-client-pages.js');
}
