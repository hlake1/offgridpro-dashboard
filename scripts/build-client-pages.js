#!/usr/bin/env node
/* Generates all client profile files. Run: node scripts/build-client-pages.js */
const fs = require('fs');
const path = require('path');
const { CLIENTS, ROOT, authJS, reportsStoreJS } = require('./build-client-profiles.js');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

// ---------------------------------------------------------------------------
// index.html (client-facing dashboard)
// ---------------------------------------------------------------------------
function indexHTML(c) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${c.name} — Performance Reports</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script src="./assets/auth.js"></script>
<script src="./assets/reports-store.js"></script>
<script>window.${c.NS}Auth.ensureAuth();</script>
<style>
  :root {
    --cl-1: ${c.c1};
    --cl-2: ${c.c2};
    --cl-3: ${c.c3};
    --cl-accent: ${c.accent};
    --cl-text: #333;
    --cl-muted: #666;
    --cl-dark: ${c.dark};
  }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'Montserrat', Helvetica, Arial, sans-serif;
    color: var(--cl-text);
    background: #ffffff;
    font-weight: 400;
  }
  h1, h2, h3, h4 { font-weight: 500; letter-spacing: -0.01em; color: var(--cl-dark); }
  .heading-bold { font-weight: 700; }

  .cl-accent-bar {
    height: 4px;
    background: linear-gradient(90deg, var(--cl-1) 0%, var(--cl-2) 55%, var(--cl-3) 100%);
    border-radius: 2px;
  }
  .cl-soft-bg { background: linear-gradient(135deg, rgba(23,166,151,0.06) 0%, rgba(23,166,151,0.10) 100%); }
  .cl-hero {
    background:
      linear-gradient(rgba(0,0,0,0.55) 0%, rgba(10,10,10,0.45) 100%),
      linear-gradient(135deg, ${c.heroA} 0%, ${c.heroB} 60%, ${c.heroC} 100%);
  }
  .report-card { transition: transform 0.25s ease, box-shadow 0.25s ease; border: 1px solid #e5e7eb; }
  .report-card:hover { transform: translateY(-3px); box-shadow: 0 20px 40px rgba(0,0,0,0.08); border-color: var(--cl-2); }
  .btn-primary {
    background: var(--cl-dark); color: #fff; padding: 0.65rem 1.4rem; font-weight: 500;
    letter-spacing: 0.02em; transition: background 0.2s ease;
  }
  .btn-primary:hover { filter: brightness(1.25); }
  .prototype-badge {
    background: rgba(255,255,255,0.12); backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.25); font-weight: 500; letter-spacing: 0.08em;
  }
  .stat-pill { background: #f6f9fc; border: 1px solid #e5e7eb; }

  .admin-only { display: none; }
  html.${c.adminClass} .admin-only { display: block; }
  html.${c.adminClass} .admin-only.flex-row { display: flex; }
  .admin-badge { background: var(--cl-dark); color:#fff; font-size:10px; letter-spacing:0.15em; text-transform:uppercase; padding: 3px 8px; border-radius: 2px; font-weight:600; }

  .status-pill {
    display:inline-flex; align-items:center; gap:0.4rem; padding: 3px 10px;
    font-size:11px; letter-spacing:0.1em; text-transform:uppercase; font-weight:600;
    border-radius: 999px;
  }
  .status-pending { background:#fef3c7; color:#92400e; }
  .status-active  { background:#dcfce7; color:#166534; }

  .admin-panel { background: #f6f9fc; border: 1px solid #e5e7eb; border-left: 4px solid var(--cl-dark); border-radius: 4px; }
  .report-status-published { background:#dcfce7; color:#166534; font-size:10px; letter-spacing:0.12em; text-transform:uppercase; padding:3px 9px; border-radius:2px; font-weight:700; }
  .report-status-draft { background:#fef3c7; color:#92400e; font-size:10px; letter-spacing:0.12em; text-transform:uppercase; padding:3px 9px; border-radius:2px; font-weight:700; }
  .line-clamp-3 { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
</style>
</head>
<body>

<header class="cl-hero text-white relative overflow-hidden">
  <div class="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/10">
    <div class="flex items-center gap-3">
      <div class="flex flex-col">
        <div class="flex items-baseline gap-1.5">
          <span class="text-white text-xl font-bold tracking-tight">${c.name}</span>
          <span class="text-white/70 text-[10px] uppercase tracking-widest">${c.tagline}</span>
        </div>
        <div class="cl-accent-bar w-full mt-1"></div>
        <p class="text-[10px] uppercase tracking-widest text-white/60 mt-1">${c.sector}</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span id="role-indicator" class="prototype-badge text-white text-[11px] px-3 py-1.5 rounded-sm uppercase">Dashboard</span>
      <button id="logout-btn" onclick="window.${c.NS}Auth.logout()" class="text-white/60 hover:text-white text-[11px] uppercase tracking-widest" title="Sign out">Sign out</button>
    </div>
  </div>

  <div class="max-w-6xl mx-auto px-6 py-20 relative">
    <p class="text-white/70 text-sm uppercase tracking-[0.2em] mb-4">Tweak Marketing · Client Reporting</p>
    <h1 class="text-4xl md:text-5xl font-medium text-white leading-tight max-w-3xl">
      Performance reports for <span class="heading-bold">${c.name}</span>
    </h1>
    <div class="cl-accent-bar w-32 mt-6"></div>
    <p class="text-white/80 mt-6 max-w-2xl leading-relaxed">
      Monthly deep-dive reports covering website analytics, SEO, conversions, social media, and content performance. Live metrics coming once data access is set up.
    </p>
  </div>
</header>

<main class="max-w-6xl mx-auto px-6 py-16 space-y-16">

  <!-- Client Info Strip -->
  <section class="cl-soft-bg rounded-none p-8 border-l-4" style="border-left-color: var(--cl-2);">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
      <div>
        <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Client</p>
        <p class="font-medium text-gray-900 mt-1.5">${c.fullName}</p>
      </div>
      <div>
        <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Sector</p>
        <p class="font-medium text-gray-900 mt-1.5">${c.sector}</p>
      </div>
      <div>
        <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Reporting Cycle</p>
        <p class="font-medium text-gray-900 mt-1.5">Monthly</p>
      </div>
      <div>
        <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Account Manager</p>
        <p class="font-medium text-gray-900 mt-1.5">${c.accountManager} · Tweak</p>
      </div>
    </div>
  </section>

  <!-- Monthly report entry -->
  <section>
    <div class="mb-8">
      <p class="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-semibold mb-2">Your reports</p>
      <h2 class="text-3xl font-medium text-gray-900">Monthly performance reports</h2>
      <div class="cl-accent-bar w-24 mt-4"></div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

      <!-- June 2026 Report (placeholder / coming soon) -->
      <div class="report-card block bg-white p-8 group relative overflow-hidden opacity-95">
        <div class="absolute top-0 right-0 bottom-0 w-1" style="background: linear-gradient(180deg, var(--cl-1), var(--cl-2), var(--cl-3));"></div>
        <div class="flex items-start justify-between mb-6">
          <div>
            <p class="text-[11px] uppercase tracking-widest font-semibold" style="color: var(--cl-2);">First monthly report</p>
            <h3 class="text-2xl font-medium text-gray-900 mt-2">June 2026</h3>
            <p class="text-sm text-gray-500 mt-1">Being prepared</p>
          </div>
          <span class="status-pill status-pending">◐ In progress</span>
        </div>
        <div class="cl-accent-bar w-full mb-6"></div>
        <p class="text-sm text-gray-700 leading-relaxed mb-6">Your first report is being set up. It will cover website analytics, SEO, conversions, social media, and content performance. Once your ${c.accountManager} completes onboarding it will appear here.</p>
        <div class="flex items-center justify-between">
          <p class="text-sm text-gray-600">Analytics · SEO · Conversions · Social · Content</p>
          <a href="./june-2026/" class="text-sm font-semibold group-hover:translate-x-1 transition-transform inline-block" style="color: var(--cl-dark);">Preview →</a>
        </div>
      </div>

      <!-- Onboarding info card -->
      <div class="report-card block bg-white p-8 group relative overflow-hidden">
        <div class="flex items-start justify-between mb-6">
          <div>
            <p class="text-[11px] uppercase tracking-widest font-semibold" style="color: var(--cl-2);">Onboarding</p>
            <h3 class="text-2xl font-medium text-gray-900 mt-2">Getting set up</h3>
            <p class="text-sm text-gray-500 mt-1">What we need to unlock live metrics</p>
          </div>
          <span class="status-pill status-pending">◐ In progress</span>
        </div>
        <div class="cl-accent-bar w-full mb-6"></div>
        <ul class="text-sm text-gray-700 space-y-2 mb-6">
          <li class="flex items-start gap-2"><span class="text-gray-400 mt-0.5">□</span><span>Google Ads · Search Console · Analytics access</span></li>
          <li class="flex items-start gap-2"><span class="text-gray-400 mt-0.5">□</span><span>Conversion tracking integration</span></li>
          <li class="flex items-start gap-2"><span class="text-gray-400 mt-0.5">□</span><span>Priority KPIs &amp; reporting frequency</span></li>
          <li class="flex items-start gap-2"><span class="text-gray-400 mt-0.5">□</span><span>Stakeholder access &amp; approvals</span></li>
        </ul>
        <div class="flex items-center justify-between">
          <p class="text-sm text-gray-600">Coordinated with ${c.accountManager} · Tweak</p>
        </div>
      </div>

    </div>

    <!-- Next month placeholder -->
    <div class="mt-6 report-card block bg-white p-5 opacity-70">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-4">
          <div class="text-2xl">🗓️</div>
          <div>
            <p class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Coming next</p>
            <p class="font-medium text-gray-600">July 2026 report</p>
          </div>
        </div>
        <p class="text-xs text-gray-500 italic">Will be published in early August once data access is confirmed.</p>
      </div>
    </div>
  </section>

  <!-- Published reports (visible to everyone once published) — placeholder, none yet -->
  <section id="published-reports-section" class="mt-12" style="display:none;">
    <div class="mb-6">
      <p class="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-semibold mb-2">Published</p>
      <h2 class="text-3xl font-medium text-gray-900">Monthly reports</h2>
      <div class="cl-accent-bar w-24 mt-4"></div>
    </div>
    <div id="published-reports-list" class="grid grid-cols-1 md:grid-cols-2 gap-6"></div>
  </section>

  <!-- =============================================================== -->
  <!-- ADMIN ONLY: Monthly Report Builder Panel                        -->
  <!-- =============================================================== -->
  <section class="admin-only mt-12">
    <div class="admin-panel p-8">
      <div class="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <span class="admin-badge">Admin · Tweak</span>
            <p class="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-semibold">Report builder</p>
          </div>
          <h2 class="text-3xl font-medium text-gray-900">Monthly Report</h2>
          <div class="cl-accent-bar w-24 mt-4"></div>
          <p class="text-gray-600 mt-4 max-w-2xl">Build the next monthly report by answering a short set of questions, then entering the month's metrics. We'll assemble a draft you can review, tweak and publish.</p>
        </div>
        <a href="./admin/builder.html" class="btn-primary rounded-sm no-underline whitespace-nowrap">
          + New monthly report
        </a>
      </div>

      <div id="admin-drafts-wrap">
        <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Drafts &amp; recent</p>
        <div id="admin-drafts-list" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
        <p id="admin-drafts-empty" class="text-sm text-gray-500 italic mt-2" style="display:none;">No drafts yet. Click “New monthly report” to start one.</p>
      </div>
    </div>
  </section>

</main>

<footer class="border-t border-gray-100 mt-16 py-8 text-center text-xs text-gray-400 tracking-wide">
  Tweak Marketing · Client Reporting Prototype · <a href="../" class="hover:text-gray-600">← Back to Tweak Reporting</a>
</footer>

<script>
  (function () {
    function esc(s){ return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

    function renderPublished() {
      const section = document.getElementById('published-reports-section');
      const wrap = document.getElementById('published-reports-list');
      if (!wrap || !window.${c.NS}Reports) return;
      const items = window.${c.NS}Reports.listPublished();
      if (!items.length) { section.style.display = 'none'; return; }
      section.style.display = 'block';
      wrap.innerHTML = items.map(r => {
        const label = window.${c.NS}Reports.monthLabel(r.month);
        const headline = esc(r.summary?.headline || '');
        return \`
          <a href="./admin/view.html?id=\${encodeURIComponent(r.id)}" class="report-card block bg-white p-8 group">
            <div class="flex items-start justify-between mb-4">
              <div>
                <p class="text-[11px] uppercase tracking-widest font-semibold" style="color: var(--cl-2);">Monthly report</p>
                <h3 class="text-2xl font-medium text-gray-900 mt-2">\${esc(label)}</h3>
                <p class="text-sm text-gray-500 mt-1">Published</p>
              </div>
              <span class="report-status-published">Published</span>
            </div>
            <div class="cl-accent-bar w-full mb-4"></div>
            <p class="text-sm text-gray-700 leading-relaxed line-clamp-3">\${headline}</p>
            <p class="text-sm font-semibold mt-4" style="color: var(--cl-dark);">Open report →</p>
          </a>\`;
      }).join('');
    }

    function renderAdminDrafts() {
      const list = document.getElementById('admin-drafts-list');
      const empty = document.getElementById('admin-drafts-empty');
      if (!list || !window.${c.NS}Reports) return;
      const items = window.${c.NS}Reports.list().sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''));
      if (!items.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
      empty.style.display = 'none';
      list.innerHTML = items.map(r => {
        const label = window.${c.NS}Reports.monthLabel(r.month);
        const statusClass = r.status === 'published' ? 'report-status-published' : 'report-status-draft';
        const notes = (r.revisionNotes && r.revisionNotes.length) ? \`\${r.revisionNotes.length} revision note\${r.revisionNotes.length>1?'s':''}\` : '';
        return \`
          <div class="bg-white p-5 border border-gray-200 rounded-sm flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="\${statusClass}">\${r.status}</span>
                \${notes ? \`<span class="text-[10px] uppercase tracking-widest text-amber-700 font-semibold">\${notes}</span>\` : ''}
              </div>
              <p class="font-medium text-gray-900">\${esc(label)}</p>
              <p class="text-xs text-gray-500 mt-1">Updated \${r.updatedAt ? new Date(r.updatedAt).toLocaleString('en-GB') : '—'}</p>
            </div>
            <div class="flex flex-col gap-1 text-sm shrink-0">
              <a class="font-semibold hover:underline" style="color: var(--cl-2);" href="./admin/view.html?id=\${encodeURIComponent(r.id)}">Review →</a>
              <a class="text-gray-500 hover:underline" href="./admin/builder.html?id=\${encodeURIComponent(r.id)}">Edit</a>
            </div>
          </div>\`;
      }).join('');
    }

    function apply(role) {
      const isAdmin = role === 'admin';
      document.documentElement.classList.toggle('${c.adminClass}', isAdmin);
      const badge = document.getElementById('role-indicator');
      if (badge) badge.textContent = isAdmin ? 'Admin · Tweak' : 'Client view';
      renderPublished();
      if (isAdmin) renderAdminDrafts();
    }

    const role = window.${c.NS}Auth.getRole();
    if (role) apply(role);
    document.addEventListener('${c.slug}:auth', (e) => apply(e.detail.role));
    window.${c.NS}AuthReady = apply;
  })();
</script>

</body>
</html>
`;
}

module.exports = { indexHTML, ensureDir };
