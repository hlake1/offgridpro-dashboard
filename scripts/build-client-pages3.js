#!/usr/bin/env node
/* view.html + june placeholder */

function viewHTML(c) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${c.name} — Monthly Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script src="../assets/auth.js"></script>
<script src="../assets/reports-store.js"></script>
<script>window.${c.NS}Auth.ensureAuth();</script>
<style>
  :root {
    --cl-text: #333;
    --cl-muted: #666;
    --cl-light: #f6f9fc;
    --cl-1: ${c.c1};
    --cl-2: ${c.c2};
    --cl-3: ${c.c3};
    --cl-dark: ${c.dark};
  }
  body {
    font-family: 'Montserrat', Helvetica, Arial, sans-serif;
    color: var(--cl-text);
    background: #ffffff;
  }
  h1, h2, h3 { font-weight: 500; letter-spacing: -0.01em; color: var(--cl-dark); }
  .heading-bold { font-weight:700; }
  .cl-accent-bar {
    height: 4px;
    background: linear-gradient(90deg, var(--cl-1) 0%, var(--cl-2) 50%, var(--cl-3) 100%);
    border-radius: 2px;
  }
  .cl-hero {
    background:
      linear-gradient(rgba(0,0,0,0.55) 0%, rgba(10,10,10,0.45) 100%),
      linear-gradient(135deg, ${c.heroA} 0%, ${c.heroB} 60%, ${c.heroC} 100%);
  }
  .cl-soft-bg {
    background: linear-gradient(135deg, rgba(23,166,151,0.06) 0%, rgba(23,166,151,0.10) 100%);
  }
  .card { background:#fff; border:1px solid #e5e7eb; }
  .stat-pill { background:#f8faf5; border:1px solid #e5e7eb; }
  .status-draft {
    background:#fef3c7; color:#92400e; font-size:10px; letter-spacing:0.15em;
    text-transform:uppercase; padding:4px 10px; border-radius:2px; font-weight:700;
  }
  .status-published {
    background:#dcfce7; color:#166534; font-size:10px; letter-spacing:0.15em;
    text-transform:uppercase; padding:4px 10px; border-radius:2px; font-weight:700;
  }
  .btn { padding: 0.7rem 1.5rem; font-weight:600; letter-spacing:0.02em; border-radius:2px; cursor:pointer; transition: background 0.15s ease, transform 0.15s ease; }
  .btn-approve { background: #059669; color:#fff; border:0; }
  .btn-approve:hover { background:#047857; }
  .btn-revise { background: #fff; color:#1a1a1a; border:1px solid #1a1a1a; }
  .btn-revise:hover { background:#f3f4f6; }
  .btn-ghost { background:transparent; color:#1a1a1a; border:1px solid #e5e7eb; }
  .btn-ghost:hover { background:#f3f4f6; }
  .admin-only { display:none; }
  html.${c.adminClass} .admin-only { display: block; }
  html.${c.adminClass} .admin-only.inline { display: inline-flex; }

  .prose-answer { white-space: pre-wrap; color:#374151; line-height:1.65; }

  .modal-backdrop {
    position: fixed; inset:0; background: rgba(0,0,0,0.55); z-index:1000;
    display:none; align-items:center; justify-content:center; padding:1rem;
  }
  .modal-backdrop.on { display:flex; }
  .modal {
    background:#fff; max-width:520px; width:100%; padding:2rem;
    border-radius:6px; box-shadow: 0 30px 60px rgba(0,0,0,0.35);
  }
</style>
</head>
<body>

<header class="cl-hero text-white">
  <div class="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/10">
    <div class="flex items-center gap-4">
      <a href="../" class="text-white/70 hover:text-white text-xs uppercase tracking-widest">← Dashboard</a>
    </div>
    <div class="flex items-center gap-3">
      <span id="role-indicator" class="bg-white/10 border border-white/20 text-white text-[11px] px-3 py-1.5 rounded-sm uppercase">Report</span>
      <button id="logout-btn" class="text-white/60 hover:text-white text-[11px] uppercase tracking-widest">Sign out</button>
    </div>
  </div>
  <div class="max-w-5xl mx-auto px-6 py-14">
    <p class="text-white/70 text-sm uppercase tracking-[0.2em] mb-3">Monthly performance report · ${c.name}</p>
    <div class="flex items-center gap-4 flex-wrap">
      <h1 id="report-title" class="text-4xl md:text-5xl font-medium text-white leading-tight">—</h1>
      <span id="status-badge"></span>
    </div>
    <div class="cl-accent-bar w-24 mt-5"></div>
    <p id="report-headline" class="text-white/80 mt-5 max-w-3xl text-lg leading-relaxed"></p>
  </div>
</header>

<main class="max-w-5xl mx-auto px-6 py-12 space-y-10">

  <section id="admin-actions" class="admin-only card p-5 flex items-center justify-between flex-wrap gap-3" style="border-left:4px solid var(--cl-dark);">
    <div>
      <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Admin actions</p>
      <p class="text-sm text-gray-700 mt-1" id="admin-hint">Review the draft below. Approve to publish to the client view, or request edits.</p>
    </div>
    <div class="flex items-center gap-3 flex-wrap">
      <a id="edit-link" href="#" class="btn btn-ghost">Edit answers</a>
      <button id="revise-btn" class="btn btn-revise">Suggest edits</button>
      <button id="approve-btn" class="btn btn-approve">✓ APPROVE &amp; Publish</button>
      <button id="unpublish-btn" class="btn btn-ghost" style="display:none;">Unpublish</button>
    </div>
  </section>

  <div id="draft-banner" style="display:none; border-left: 4px solid var(--cl-2);" class="cl-soft-bg p-4">
    <p class="text-sm text-gray-700"><strong class="text-gray-900">Draft</strong> — this report has not yet been published. Only the admin can see it.</p>
  </div>

  <div id="data-banner" style="display:none; border-left: 4px solid #d97706; background: #fffbeb;" class="p-4">
    <p class="text-sm text-gray-800">
      <strong class="text-gray-900">Live API data not yet integrated for this month.</strong>
      The narrative sections below reflect your answers as usual. Numeric sections will populate automatically once the integrations are wired up. This is a prototype limitation, not a bug.
    </p>
  </div>

  <section id="metrics-section" class="card p-8">
    <div class="flex items-center justify-between flex-wrap gap-3 mb-6">
      <div>
        <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Overview</p>
        <h2 class="text-2xl font-medium text-gray-900 mt-1">Google Ads performance</h2>
      </div>
      <p id="metrics-source" class="text-xs text-gray-500"></p>
    </div>
    <div id="metrics-grid" class="grid grid-cols-2 md:grid-cols-4 gap-4"></div>
    <div id="campaigns-list" class="mt-6"></div>
  </section>

  <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div class="card p-6">
      <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Biggest win</p>
      <h3 class="text-lg font-medium text-gray-900 mt-1">The headline</h3>
      <div class="cl-accent-bar w-12 mt-3 mb-4"></div>
      <div id="ans-q1" class="prose-answer"></div>
    </div>
    <div class="card p-6">
      <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Overperformer</p>
      <h3 class="text-lg font-medium text-gray-900 mt-1">Channel that exceeded expectations</h3>
      <div class="cl-accent-bar w-12 mt-3 mb-4"></div>
      <div id="ans-q2" class="prose-answer"></div>
    </div>
  </section>

  <section class="card p-8">
    <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Strategy</p>
    <h2 class="text-2xl font-medium text-gray-900 mt-1">Focus &amp; rationale</h2>
    <div class="cl-accent-bar w-16 mt-3 mb-6"></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <p class="text-sm font-semibold text-gray-900 mb-2">Main strategic focus</p>
        <div id="ans-q4" class="prose-answer"></div>
      </div>
      <div>
        <p class="text-sm font-semibold text-gray-900 mb-2">Why we prioritised this</p>
        <div id="ans-q5" class="prose-answer"></div>
      </div>
    </div>
  </section>

  <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div class="card p-6">
      <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Feedback</p>
      <h3 class="text-lg font-medium text-gray-900 mt-1">Client feedback &amp; anecdotes</h3>
      <div class="cl-accent-bar w-12 mt-3 mb-4"></div>
      <div id="ans-q3" class="prose-answer"></div>
    </div>
    <div class="card p-6">
      <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Challenges</p>
      <h3 class="text-lg font-medium text-gray-900 mt-1">Pivots &amp; obstacles</h3>
      <div class="cl-accent-bar w-12 mt-3 mb-4"></div>
      <div id="ans-q6" class="prose-answer"></div>
    </div>
  </section>

  <section class="card p-8 cl-soft-bg" style="border-left:4px solid var(--cl-1);">
    <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Next month</p>
    <h2 class="text-2xl font-medium text-gray-900 mt-1">Priorities &amp; plans</h2>
    <div class="cl-accent-bar w-16 mt-3 mb-6"></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <p class="text-sm font-semibold text-gray-900 mb-3">Top priorities</p>
        <ol id="priorities-list" class="list-decimal ml-5 text-gray-800 space-y-1"></ol>
        <div id="ans-q7-fallback" class="prose-answer" style="display:none;"></div>
      </div>
      <div>
        <p class="text-sm font-semibold text-gray-900 mb-2">Budget &amp; strategy changes</p>
        <div id="ans-q8" class="prose-answer"></div>
      </div>
    </div>
  </section>

  <section id="extras-section" class="card p-6" style="display:none;">
    <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Additional notes</p>
    <h3 class="text-lg font-medium text-gray-900 mt-1">Also worth highlighting</h3>
    <div class="cl-accent-bar w-12 mt-3 mb-4"></div>
    <div id="ans-q9" class="prose-answer"></div>
  </section>

  <section id="revision-notes-section" class="admin-only card p-6" style="border-left:4px solid #f59e0b;">
    <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Revision notes</p>
    <h3 class="text-lg font-medium text-gray-900 mt-1">Feedback for the next pass</h3>
    <div class="cl-accent-bar w-12 mt-3 mb-4"></div>
    <ul id="revision-notes-list" class="space-y-3"></ul>
  </section>

</main>

<footer class="border-t border-gray-200 mt-16">
  <div class="max-w-5xl mx-auto px-6 py-6 flex justify-between items-center flex-wrap gap-3">
    <p class="text-xs text-gray-500" id="footer-author">Reporting dashboard by Tweak Marketing</p>
    <p class="text-xs text-gray-400" id="footer-meta"></p>
  </div>
</footer>

<div id="revise-modal" class="modal-backdrop">
  <div class="modal">
    <h3 class="text-xl font-medium text-gray-900">Suggest edits</h3>
    <div class="cl-accent-bar w-12 mt-2 mb-4"></div>
    <p class="text-sm text-gray-600 mb-4">Add a note describing what needs to change. This will be attached to the draft and the report will be moved back to draft state (if published).</p>
    <textarea id="revise-text" rows="5" class="w-full p-3 border border-gray-200 rounded" placeholder="e.g. Reduce the section on X, add more colour on Y…"></textarea>
    <div class="flex justify-end gap-3 mt-4">
      <button id="revise-cancel" class="btn btn-ghost">Cancel</button>
      <button id="revise-save" class="btn btn-primary" style="background:var(--cl-dark);color:#fff;">Add note</button>
    </div>
  </div>
</div>

<script>
(function () {
  const qs = new URLSearchParams(location.search);
  const id = qs.get('id');
  const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 });
  const numFmt = new Intl.NumberFormat('en-GB');

  function esc(s){ return (s == null ? '' : String(s)).replace(/[&<>\\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;',"'":'&#39;'}[c])); }

  function applyRole(role) {
    const isAdmin = role === 'admin';
    document.documentElement.classList.toggle('${c.adminClass}', isAdmin);
    const badge = document.getElementById('role-indicator');
    if (badge) badge.textContent = isAdmin ? 'Admin · Tweak' : 'Client view';
    render();
  }

  function render() {
    const report = id ? window.${c.NS}Reports.get(id) : null;

    if (!report) {
      document.getElementById('report-title').textContent = 'Report not found';
      document.getElementById('report-headline').textContent = 'This report does not exist yet.';
      return;
    }

    const isAdmin = window.${c.NS}Auth.isAdmin();

    if (!isAdmin && report.status !== 'published') {
      document.getElementById('report-title').textContent = 'Report not available';
      document.getElementById('report-headline').textContent = 'This report has not yet been published.';
      document.querySelectorAll('main > section').forEach(s => s.style.display = 'none');
      return;
    }

    document.getElementById('report-title').textContent = \`${c.name} — \${window.${c.NS}Reports.monthLabel(report.month)}\`;
    const badge = document.getElementById('status-badge');
    badge.className = report.status === 'published' ? 'status-published' : 'status-draft';
    badge.textContent = report.status;

    const s = report.summary || {};
    document.getElementById('report-headline').textContent = s.headline || '';

    const banner = document.getElementById('draft-banner');
    if (isAdmin && report.status === 'draft') banner.style.display = 'block';

    const dataBanner = document.getElementById('data-banner');
    if (s.dataStatus && s.dataStatus.available === false) {
      dataBanner.style.display = 'block';
    }

    const m = s.metrics;
    const grid = document.getElementById('metrics-grid');
    if (m) {
      grid.innerHTML = \`
        <div class="stat-pill p-4">
          <p class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Impressions</p>
          <p class="font-bold text-gray-900 text-2xl mt-1">\${numFmt.format(m.impressions)}</p>
        </div>
        <div class="stat-pill p-4">
          <p class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Clicks</p>
          <p class="font-bold text-gray-900 text-2xl mt-1">\${numFmt.format(m.clicks)}</p>
        </div>
        <div class="stat-pill p-4">
          <p class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Conversions</p>
          <p class="font-bold text-2xl mt-1" style="color:var(--cl-1);">\${m.conversions}</p>
        </div>
        <div class="stat-pill p-4">
          <p class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Spend</p>
          <p class="font-bold text-gray-900 text-2xl mt-1">\${gbp.format(m.cost)}</p>
        </div>
      \`;
      document.getElementById('metrics-source').textContent = \`Google Ads · CTR \${m.ctr}% · CPC \${gbp.format(m.cpc)}\`;
    } else {
      grid.innerHTML = \`<p class="text-sm text-gray-500 italic col-span-4">No Google Ads data available for this period.</p>\`;
    }

    if (s.topCampaign) {
      document.getElementById('campaigns-list').innerHTML = \`
        <div class="mt-6 flex items-center justify-between flex-wrap gap-3 p-4 border border-gray-200 rounded-sm">
          <div>
            <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Top campaign</p>
            <p class="font-medium text-gray-900 mt-1">\${esc(s.topCampaign.name)}</p>
          </div>
          <div class="flex items-center gap-6 text-sm">
            <div><span class="text-gray-500">Clicks</span> <span class="font-semibold">\${numFmt.format(s.topCampaign.clicks)}</span></div>
            <div><span class="text-gray-500">Conv.</span> <span class="font-semibold">\${s.topCampaign.conversions}</span></div>
            <div><span class="text-gray-500">Spend</span> <span class="font-semibold">\${gbp.format(s.topCampaign.cost)}</span></div>
          </div>
        </div>
      \`;
    }

    const setText = (elId, text) => {
      const el = document.getElementById(elId);
      if (!el) return;
      const t = (text || '').trim();
      if (!t) {
        el.textContent = '—';
        el.style.color = '#9ca3af';
        el.style.fontStyle = 'italic';
      } else {
        el.textContent = t;
      }
    };
    const a = report.answers || {};
    setText('ans-q1', a.q1);
    setText('ans-q2', a.q2);
    setText('ans-q3', a.q3);
    setText('ans-q4', a.q4);
    setText('ans-q5', a.q5);
    setText('ans-q6', a.q6);
    setText('ans-q8', a.q8);

    const list = document.getElementById('priorities-list');
    const fallback = document.getElementById('ans-q7-fallback');
    const priorities = (s.priorities && s.priorities.length) ? s.priorities : [];
    if (priorities.length) {
      list.innerHTML = priorities.map(p => \`<li>\${esc(p)}</li>\`).join('');
      fallback.style.display = 'none';
    } else if ((a.q7 || '').trim()) {
      list.style.display = 'none';
      fallback.style.display = 'block';
      fallback.textContent = a.q7;
    } else {
      list.innerHTML = '<li class="italic text-gray-400">To be defined.</li>';
      list.style.listStyle = 'none';
      list.style.marginLeft = '0';
    }

    if ((a.q9 || '').trim()) {
      document.getElementById('extras-section').style.display = 'block';
      setText('ans-q9', a.q9);
    }

    document.getElementById('footer-author').textContent =
      report.author ? \`Prepared by \${report.author}\` : 'Reporting dashboard by Tweak Marketing';
    const dates = [];
    if (report.publishedAt) dates.push(\`Published \${new Date(report.publishedAt).toLocaleDateString('en-GB')}\`);
    dates.push(\`Updated \${new Date(report.updatedAt).toLocaleDateString('en-GB')}\`);
    document.getElementById('footer-meta').textContent = dates.join(' · ');

    if (isAdmin) {
      document.getElementById('edit-link').href = \`./builder.html?id=\${encodeURIComponent(report.id)}\`;
      const approveBtn = document.getElementById('approve-btn');
      const unpubBtn = document.getElementById('unpublish-btn');
      if (report.status === 'published') {
        approveBtn.style.display = 'none';
        unpubBtn.style.display = 'inline-flex';
        document.getElementById('admin-hint').textContent = 'This report is live in the client view. You can unpublish or request further edits.';
      } else {
        approveBtn.style.display = 'inline-flex';
        unpubBtn.style.display = 'none';
      }

      const notesList = document.getElementById('revision-notes-list');
      const notes = report.revisionNotes || [];
      if (notes.length) {
        notesList.innerHTML = notes.slice().reverse().map(n => \`
          <li class="border-l-2 border-amber-400 pl-4">
            <p class="text-[11px] uppercase tracking-widest text-amber-700 font-semibold">\${new Date(n.ts).toLocaleString('en-GB')}</p>
            <p class="text-gray-800 mt-1 whitespace-pre-wrap">\${esc(n.note)}</p>
          </li>
        \`).join('');
      } else {
        document.getElementById('revision-notes-section').style.display = 'none';
      }
    }
  }

  document.getElementById('approve-btn').addEventListener('click', () => {
    if (!id) return;
    if (!confirm('Approve and publish this report to the client view?')) return;
    window.${c.NS}Reports.publish(id);
    render();
  });

  document.getElementById('unpublish-btn').addEventListener('click', () => {
    if (!id) return;
    if (!confirm('Move this report back to draft? It will be hidden from the client view.')) return;
    window.${c.NS}Reports.unpublish(id);
    render();
  });

  const modal = document.getElementById('revise-modal');
  document.getElementById('revise-btn').addEventListener('click', () => {
    document.getElementById('revise-text').value = '';
    modal.classList.add('on');
  });
  document.getElementById('revise-cancel').addEventListener('click', () => modal.classList.remove('on'));
  document.getElementById('revise-save').addEventListener('click', () => {
    const note = document.getElementById('revise-text').value.trim();
    if (!note) { modal.classList.remove('on'); return; }
    window.${c.NS}Reports.addRevisionNote(id, note);
    modal.classList.remove('on');
    render();
  });

  document.getElementById('logout-btn').addEventListener('click', () => window.${c.NS}Auth.logout('../'));

  document.addEventListener('${c.slug}:auth', (e) => applyRole(e.detail.role));
  if (window.${c.NS}Auth.isAuthed()) applyRole(window.${c.NS}Auth.getRole());
})();
</script>
</body>
</html>
`;
}

function juneHTML(c) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${c.name} — June 2026 Performance Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script src="../assets/auth.js"></script>
<script>window.${c.NS}Auth.ensureAuth();</script>
<style>
  html { scroll-behavior: smooth; }
  body { font-family: 'Montserrat', -apple-system, Helvetica, Arial, sans-serif; color:#333; background:#f9fafb; }
  h1,h2,h3 { font-weight:500; letter-spacing:-0.01em; color:${c.dark}; }
  .gradient-bg { background: linear-gradient(135deg, ${c.heroA} 0%, ${c.heroB} 55%, ${c.heroC} 100%); }
  .accent-bar { height:3px; background: linear-gradient(90deg, ${c.c1} 0%, ${c.c2} 55%, ${c.c3} 100%); border-radius:2px; }
  .card { background:#fff; border:1px solid #e5e7eb; }
  .stat-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .stat-card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(0,0,0,0.08); }
</style>
</head>
<body>

<header class="gradient-bg text-white shadow-xl">
  <div class="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/10">
    <a href="../" class="text-white/70 hover:text-white text-xs uppercase tracking-widest">← Dashboard</a>
    <button id="logout-btn" onclick="window.${c.NS}Auth.logout('../')" class="text-white/60 hover:text-white text-[11px] uppercase tracking-widest">Sign out</button>
  </div>
  <div class="max-w-5xl mx-auto px-6 py-16">
    <p class="text-white/70 text-sm uppercase tracking-[0.2em] mb-3">Monthly performance report · ${c.name}</p>
    <h1 class="text-4xl md:text-5xl font-medium text-white leading-tight">June 2026</h1>
    <div class="accent-bar w-24 mt-5"></div>
    <p class="text-white/80 mt-5 max-w-2xl leading-relaxed">Website analytics, SEO, conversions, social media, and content performance — prepared by Tweak Marketing.</p>
  </div>
</header>

<main class="max-w-5xl mx-auto px-6 py-14 space-y-10">

  <div class="card p-6" style="border-left:4px solid #d97706; background:#fffbeb;">
    <p class="text-sm text-gray-800">
      <strong class="text-gray-900">Report in preparation.</strong>
      Your first monthly report is being set up. Live Google Ads, Analytics and Search Console metrics will populate here automatically once data access is confirmed with ${c.accountManager} · Tweak. This is a placeholder preview.
    </p>
  </div>

  <section class="card p-8">
    <div class="mb-6">
      <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Overview</p>
      <h2 class="text-2xl font-medium text-gray-900 mt-1">Performance at a glance</h2>
      <div class="accent-bar w-16 mt-3"></div>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="stat-card card p-4"><p class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Impressions</p><p class="font-bold text-gray-900 text-2xl mt-1">—</p></div>
      <div class="stat-card card p-4"><p class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Clicks</p><p class="font-bold text-gray-900 text-2xl mt-1">—</p></div>
      <div class="stat-card card p-4"><p class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Conversions</p><p class="font-bold text-2xl mt-1" style="color:${c.c2};">—</p></div>
      <div class="stat-card card p-4"><p class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Spend</p><p class="font-bold text-gray-900 text-2xl mt-1">—</p></div>
    </div>
  </section>

  <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div class="card p-6">
      <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">SEO &amp; Search</p>
      <h3 class="text-lg font-medium text-gray-900 mt-1">Organic visibility</h3>
      <div class="accent-bar w-12 mt-3 mb-4"></div>
      <p class="text-sm text-gray-500 italic">Populates once Search Console access is connected.</p>
    </div>
    <div class="card p-6">
      <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Conversions</p>
      <h3 class="text-lg font-medium text-gray-900 mt-1">Leads &amp; enquiries</h3>
      <div class="accent-bar w-12 mt-3 mb-4"></div>
      <p class="text-sm text-gray-500 italic">Populates once conversion tracking is connected.</p>
    </div>
  </section>

</main>

<footer class="border-t border-gray-200 mt-8">
  <div class="max-w-5xl mx-auto px-6 py-6 flex justify-between items-center flex-wrap gap-3">
    <p class="text-xs text-gray-500">Reporting dashboard by Tweak Marketing</p>
    <p class="text-xs text-gray-400">Placeholder · June 2026</p>
  </div>
</footer>

</body>
</html>
`;
}

module.exports = { viewHTML, juneHTML };
