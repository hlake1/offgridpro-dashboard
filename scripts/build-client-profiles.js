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
];

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
 * Manages monthly reports created via the admin builder.
 * State is persisted to localStorage (prototype).
 */
(function () {
  const KEY = '${c.reportsKey}';

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

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { reports: [] };
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.reports)) return { reports: [] };
      return data;
    } catch { return { reports: [] }; }
  }

  function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }

  function list() { return load().reports.slice(); }
  function listPublished() { return load().reports.filter(r => r.status === 'published'); }
  function listDrafts()    { return load().reports.filter(r => r.status === 'draft'); }
  function get(id) { return load().reports.find(r => r.id === id) || null; }

  function upsert(report) {
    const state = load();
    const now = new Date().toISOString();
    report.updatedAt = now;
    const idx = state.reports.findIndex(r => r.id === report.id);
    if (idx >= 0) {
      state.reports[idx] = { ...state.reports[idx], ...report };
    } else {
      report.createdAt = now;
      state.reports.unshift(report);
    }
    save(state);
    return report;
  }

  function remove(id) {
    const state = load();
    state.reports = state.reports.filter(r => r.id !== id);
    save(state);
  }

  function publish(id) {
    const state = load();
    const r = state.reports.find(r => r.id === id);
    if (!r) return null;
    r.status = 'published';
    r.publishedAt = new Date().toISOString();
    r.updatedAt = r.publishedAt;
    save(state);
    return r;
  }

  function unpublish(id) {
    const state = load();
    const r = state.reports.find(r => r.id === id);
    if (!r) return null;
    r.status = 'draft';
    r.updatedAt = new Date().toISOString();
    save(state);
    return r;
  }

  function addRevisionNote(id, note) {
    const state = load();
    const r = state.reports.find(r => r.id === id);
    if (!r) return null;
    r.revisionNotes = r.revisionNotes || [];
    r.revisionNotes.push({ ts: new Date().toISOString(), note });
    r.updatedAt = new Date().toISOString();
    if (r.status === 'published') r.status = 'draft';
    save(state);
    return r;
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

  function exportAll() { return load(); }
  function importAll(data) {
    if (!data || !Array.isArray(data.reports)) throw new Error('Invalid data');
    save(data);
  }

  window.${c.NS}Reports = {
    QUESTIONS, list, listPublished, listDrafts, get, upsert, remove,
    publish, unpublish, addRevisionNote, generateSummary, monthLabel,
    exportAll, importAll,
  };
})();
`;
}

module.exports = { CLIENTS, ROOT, authJS, reportsStoreJS };

if (require.main === module) {
  console.log('This module is imported by build-client-pages.js');
}
