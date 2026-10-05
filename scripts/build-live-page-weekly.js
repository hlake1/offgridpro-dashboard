/*
 * Weekly "Live Metrics" page for clients flagged `weekly: true` (currently
 * SCL). Replaces the Google Ads live page for clients that don't run ads:
 * shows the chosen Monday–Sunday week of website traffic (Google Analytics)
 * and search visibility (Search Console), with a comparison to the week
 * before. The GA4 property / Search Console site are matched automatically
 * per client by the google-oauth-worker (/web-config).
 */
const WORKER_URL = 'https://tweak-google-oauth.herbielakeai.workers.dev';

function weeklyLiveHTML(c) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${c.name} — Weekly Metrics</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script src="../assets/auth.js"></script>
<script>window.${c.NS}Auth.ensureAuth();</script>
<style>
  :root { --lm-text:#444; --lm-accent-1:${c.c1}; --lm-accent-2:${c.c2}; --lm-accent-3:${c.c3}; --lm-dark:${c.dark}; }
  body { font-family:'Montserrat',Helvetica,Arial,sans-serif; color:var(--lm-text); background:#fff; font-weight:400; }
  h1,h2,h3,h4 { font-weight:500; letter-spacing:-0.01em; color:var(--lm-dark); }
  .heading-bold { font-weight:700; }
  .lm-accent-bar { height:4px; background:linear-gradient(90deg,var(--lm-accent-1) 0%,var(--lm-accent-2) 50%,var(--lm-accent-3) 100%); border-radius:2px; }
  .lm-hero { background:linear-gradient(rgba(0,0,0,0.65) 0%,rgba(10,10,10,0.55) 100%),linear-gradient(135deg,${c.heroA} 0%,${c.heroB} 100%); }
  .stat-card { background:#fff; border:1px solid #e5e7eb; transition:transform .2s ease, box-shadow .2s ease; }
  .stat-card:hover { transform:translateY(-2px); box-shadow:0 10px 25px rgba(0,0,0,0.06); }
  .metric-value { font-variant-numeric:tabular-nums; }
  .prototype-badge { background:rgba(255,255,255,0.12); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.25); font-weight:500; letter-spacing:.08em; }
  .wk-btn { background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.25); color:#fff; font-size:12px; font-weight:600; padding:8px 16px; border-radius:999px; cursor:pointer; transition:background .2s; }
  .wk-btn:hover:not(:disabled) { background:rgba(255,255,255,0.2); }
  .wk-btn:disabled { opacity:.4; cursor:default; }
  .delta-up { color:#059669; } .delta-down { color:#dc2626; } .delta-flat { color:#6b7280; }
  .admin-only { display:none; }
  html.${c.adminClass} .admin-only { display:block; }
  .admin-badge { background:var(--lm-dark); color:#fff; font-size:10px; letter-spacing:.15em; text-transform:uppercase; padding:3px 8px; border-radius:2px; font-weight:600; }
  .admin-panel { background:#f6f9fc; border:1px solid #e5e7eb; border-left:4px solid var(--lm-dark); border-radius:4px; }
  table.lm-table th { text-align:left; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#6b7280; font-weight:600; padding:8px 12px; border-bottom:1px solid #e5e7eb; }
  table.lm-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; font-size:14px; }
  table.lm-table td.num, table.lm-table th.num { text-align:right; font-variant-numeric:tabular-nums; }
</style>
</head>
<body>

<header class="lm-hero text-white relative overflow-hidden">
  <div class="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/10">
    <div class="flex flex-col">
      <span class="text-white text-xl font-bold tracking-tight">${c.name}</span>
      <div class="lm-accent-bar w-full mt-1"></div>
      <p class="text-[10px] uppercase tracking-widest text-white/60 mt-1">${c.tagline}</p>
    </div>
    <div class="flex items-center gap-3">
      <a href="../" class="text-xs text-white/70 hover:text-white uppercase tracking-widest">&larr; Home</a>
      <span class="prototype-badge text-white text-[11px] px-3 py-1.5 rounded-sm uppercase">Weekly metrics</span>
    </div>
  </div>
  <div class="max-w-6xl mx-auto px-6 py-14 relative">
    <p class="text-white/70 text-sm uppercase tracking-[0.2em] mb-4">Website &middot; Search &middot; Week by week</p>
    <h1 class="text-4xl md:text-5xl font-medium text-white leading-tight max-w-3xl"><span class="heading-bold">Weekly</span> performance</h1>
    <div class="lm-accent-bar w-32 mt-6"></div>
    <p class="text-white/80 mt-6 max-w-2xl leading-relaxed">How people found and used the ${c.name} website, week by week. Weeks run Monday to Sunday and are compared with the week before.</p>
    <div class="mt-8 flex items-center gap-3 flex-wrap">
      <button id="prev-week" class="wk-btn">&larr; Previous week</button>
      <span id="week-label" class="text-white text-sm font-semibold min-w-[220px] text-center">Loading&hellip;</span>
      <button id="next-week" class="wk-btn">Next week &rarr;</button>
    </div>
  </div>
</header>

<main class="max-w-6xl mx-auto px-6 py-12 space-y-12">

  <section class="admin-only">
    <div class="admin-panel p-5">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <span class="admin-badge">Admin &middot; Tweak</span>
          <p class="text-sm text-gray-700 mt-2" id="admin-sources">Checking data sources&hellip;</p>
        </div>
        <a href="../admin/builder.html" class="text-sm font-semibold underline" style="color:var(--lm-dark);">Open the weekly report builder &rarr;</a>
      </div>
    </div>
  </section>

  <div id="state-msg" class="hidden"></div>

  <section id="traffic-section" class="hidden">
    <p class="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-semibold mb-2">Website traffic</p>
    <h2 class="text-2xl font-medium text-gray-900">Who visited</h2>
    <div class="lm-accent-bar w-16 mt-3 mb-6"></div>
    <div id="traffic-grid" class="grid grid-cols-2 md:grid-cols-3 gap-4"></div>
    <div class="mt-8">
      <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Most visited pages</h3>
      <div class="overflow-x-auto stat-card"><table class="lm-table w-full"><thead><tr><th>Page</th><th class="num">Visits</th><th class="num">Pageviews</th></tr></thead><tbody id="pages-rows"></tbody></table></div>
    </div>
  </section>

  <section id="search-section" class="hidden">
    <p class="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-semibold mb-2">Search visibility</p>
    <h2 class="text-2xl font-medium text-gray-900">How people found you on Google</h2>
    <div class="lm-accent-bar w-16 mt-3 mb-6"></div>
    <div id="search-grid" class="grid grid-cols-2 md:grid-cols-4 gap-4"></div>
    <div class="mt-8">
      <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Top search queries</h3>
      <div class="overflow-x-auto stat-card"><table class="lm-table w-full"><thead><tr><th>Query</th><th class="num">Clicks</th><th class="num">Impressions</th></tr></thead><tbody id="queries-rows"></tbody></table></div>
    </div>
  </section>

  <p class="text-xs text-gray-400" id="foot-note"></p>
</main>

<footer class="border-t border-gray-100 mt-8 py-8 text-center text-xs text-gray-400 tracking-wide">
  Tweak Marketing &middot; Client Reporting &middot; <a href="../" class="hover:text-gray-600">&larr; Back to ${c.name}</a>
</footer>

<script>
(function () {
  const WORKER = '${WORKER_URL}';
  const SLUG = '${c.slug}';
  const num = new Intl.NumberFormat('en-GB');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  // ---- ISO weeks (Monday–Sunday), as UTC dates -------------------------
  const DAY = 86400000;
  function mondayOf(d) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    return t;
  }
  const iso = (d) => d.toISOString().slice(0, 10);
  const fmt = (d, y) => d.toLocaleDateString('en-GB', y ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' });
  function isoWeekNo(mon) {
    const t = new Date(mon.getTime() + 3 * DAY);
    const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - jan1) / DAY + 1) / 7);
  }
  const lastFullMonday = new Date(mondayOf(new Date()).getTime() - 7 * DAY);
  let monday = lastFullMonday;

  let cfg = null;
  const cache = {};

  function weekRange(mon) { return { start: iso(mon), end: iso(new Date(mon.getTime() + 6 * DAY)) }; }

  async function getJson(url) {
    if (cache[url]) return cache[url];
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    cache[url] = data;
    return data;
  }
  const ga4 = (mon) => { const r = weekRange(mon); return getJson(WORKER + '/ga4-report?member=' + encodeURIComponent(cfg.member) + '&property=' + encodeURIComponent(cfg.ga4Property) + '&start=' + r.start + '&end=' + r.end); };
  const gsc = (mon) => { const r = weekRange(mon); return getJson(WORKER + '/searchconsole-report?member=' + encodeURIComponent(cfg.member) + '&site=' + encodeURIComponent(cfg.gscSite) + '&start=' + r.start + '&end=' + r.end); };

  function delta(cur, prev, invert) {
    if (prev == null || cur == null || prev === 0) return '<span class="delta-flat text-xs">vs previous week: &mdash;</span>';
    const pct = ((cur - prev) / prev) * 100;
    if (Math.abs(pct) < 0.5) return '<span class="delta-flat text-xs">&#9644; No change vs previous week</span>';
    const up = pct > 0;
    const good = invert ? !up : up;
    return '<span class="' + (good ? 'delta-up' : 'delta-down') + ' text-xs font-semibold">' + (up ? '&#9650; ' : '&#9660; ') + Math.abs(pct).toFixed(0) + '%</span> <span class="text-xs text-gray-400">vs previous week</span>';
  }
  function card(label, value, d) {
    return '<div class="stat-card p-5"><p class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">' + label + '</p><p class="metric-value font-bold text-gray-900 text-3xl mt-2">' + value + '</p><p class="mt-2">' + d + '</p></div>';
  }
  const dur = (s) => { const n = Math.round(s || 0); return Math.floor(n / 60) + 'm ' + String(n % 60).padStart(2, '0') + 's'; };

  function showMsg(html) { const el = $('state-msg'); el.className = 'stat-card p-8'; el.innerHTML = html; }
  function hideMsg() { $('state-msg').className = 'hidden'; }

  function updateLabel() {
    const sun = new Date(monday.getTime() + 6 * DAY);
    $('week-label').textContent = 'Week ' + isoWeekNo(monday) + ' · ' + fmt(monday, monday.getUTCFullYear() !== sun.getUTCFullYear()) + ' – ' + fmt(sun, true);
    $('next-week').disabled = monday.getTime() >= lastFullMonday.getTime();
  }

  async function render() {
    updateLabel();
    hideMsg();
    $('traffic-section').classList.add('hidden');
    $('search-section').classList.add('hidden');
    if (!cfg) return;
    if (!cfg.ga4Property && !cfg.gscSite) {
      showMsg('<h3 class="text-lg font-medium text-gray-900">Weekly metrics aren&rsquo;t connected yet for ${c.name}</h3><p class="text-sm text-gray-600 mt-2">Your Tweak Marketing team is linking the website&rsquo;s Google Analytics and Search Console. Weekly figures will appear here as soon as that is done.</p>');
      return;
    }
    const prev = new Date(monday.getTime() - 7 * DAY);
    const errors = [];
    if (cfg.ga4Property) {
      try {
        const [cur, pre] = await Promise.all([ga4(monday), ga4(prev).catch(() => null)]);
        const t = cur.totals || {}, p = pre && pre.totals;
        $('traffic-grid').innerHTML =
          card('Visits (sessions)', num.format(t.sessions || 0), delta(t.sessions, p && p.sessions)) +
          card('Visitors', num.format(t.users || 0), delta(t.users, p && p.users)) +
          card('New visitors', num.format(t.newUsers || 0), delta(t.newUsers, p && p.newUsers)) +
          card('Pages viewed', num.format(t.pageviews || 0), delta(t.pageviews, p && p.pageviews)) +
          card('Engaged visits', (t.engagementRate || 0) + '%', delta(t.engagementRate, p && p.engagementRate)) +
          card('Avg. time on site', dur(t.avgSessionDuration), delta(t.avgSessionDuration, p && p.avgSessionDuration));
        $('pages-rows').innerHTML = (cur.topPages || []).slice(0, 8).map((r) => '<tr><td>' + esc(r.path) + '</td><td class="num">' + num.format(r.sessions || 0) + '</td><td class="num">' + num.format(r.pageviews || 0) + '</td></tr>').join('') || '<tr><td colspan="3" class="text-gray-400">No page data for this week.</td></tr>';
        $('traffic-section').classList.remove('hidden');
      } catch (e) { errors.push('website traffic (' + (e.message || e) + ')'); }
    }
    if (cfg.gscSite) {
      try {
        const [cur, pre] = await Promise.all([gsc(monday), gsc(prev).catch(() => null)]);
        const t = cur.totals || {}, p = pre && pre.totals;
        $('search-grid').innerHTML =
          card('Clicks from Google', num.format(t.clicks || 0), delta(t.clicks, p && p.clicks)) +
          card('Times shown in search', num.format(t.impressions || 0), delta(t.impressions, p && p.impressions)) +
          card('Click-through rate', (t.ctr || 0) + '%', delta(t.ctr, p && p.ctr)) +
          card('Average position', String(t.position || 0), delta(t.position, p && p.position, true));
        $('queries-rows').innerHTML = (cur.topQueries || []).slice(0, 8).map((r) => '<tr><td>' + esc(r.query) + '</td><td class="num">' + num.format(r.clicks || 0) + '</td><td class="num">' + num.format(r.impressions || 0) + '</td></tr>').join('') || '<tr><td colspan="3" class="text-gray-400">No search queries recorded for this week.</td></tr>';
        $('search-section').classList.remove('hidden');
      } catch (e) { errors.push('search visibility (' + (e.message || e) + ')'); }
    }
    if (errors.length) showMsg('<p class="text-sm text-gray-700">We couldn&rsquo;t load the ' + esc(errors.join(' or ')) + ' just now. Please try again shortly.</p>');
    $('foot-note').textContent = 'Source: Google Analytics' + (cfg.gscSite ? ' and Google Search Console' : '') + '. Data for a week is final a few days after it ends.';
  }

  $('prev-week').addEventListener('click', () => { monday = new Date(monday.getTime() - 7 * DAY); render(); });
  $('next-week').addEventListener('click', () => { if (monday.getTime() < lastFullMonday.getTime()) { monday = new Date(monday.getTime() + 7 * DAY); render(); } });

  (async function init() {
    updateLabel();
    try {
      cfg = await getJson(WORKER + '/web-config?client=' + encodeURIComponent(SLUG));
    } catch (e) {
      showMsg('<p class="text-sm text-gray-700">We couldn&rsquo;t reach the metrics service just now. Please try again shortly.</p>');
      return;
    }
    $('admin-sources').textContent = 'Analytics property: ' + (cfg.ga4Name || cfg.ga4Property || 'not matched yet') + '  ·  Search Console site: ' + (cfg.gscSite || 'not matched yet');
    render();
  })();
})();
</script>
</body>
</html>
`;
}

module.exports = { weeklyLiveHTML };
