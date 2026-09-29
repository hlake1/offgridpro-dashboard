/*
 * Generic "Live Metrics" page, shared by every client that pulls Google Ads
 * data through the OAuth connect flow (google-oauth-worker) rather than
 * Maton. OffGrid Pro is NOT built from this template — it already has its
 * own hand-built page wired to its Maton-based data.json.
 *
 * The page fetches JSON straight from the worker's /metrics route (no
 * per-client data.json file, no GitHub Action commit step — the worker's
 * own daily Cron Trigger + KV cache does that job). Three states:
 *   - configured: false                -> friendly "not connected yet" message
 *   - configured: true, data present   -> render totals + campaign table
 *   - fetch/network error              -> render error message
 */

const WORKER_URL = 'https://tweak-google-oauth.herbielakeai.workers.dev';

function liveHTML(c) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${c.name} — Live Metrics</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script src="../assets/auth.js"></script>
<script>window.${c.NS}Auth.ensureAuth();</script>
<style>
  :root {
    --lm-text: #444;
    --lm-muted: #666;
    --lm-accent-1: ${c.c1};
    --lm-accent-2: ${c.c2};
    --lm-accent-3: ${c.c3};
    --lm-dark: ${c.dark};
  }
  body { font-family: 'Montserrat', Helvetica, Arial, sans-serif; color: var(--lm-text); background: #ffffff; font-weight: 400; }
  h1, h2, h3, h4 { font-weight: 500; letter-spacing: -0.01em; color: var(--lm-dark); }
  .heading-bold { font-weight: 700; }
  .lm-accent-bar { height: 4px; background: linear-gradient(90deg, var(--lm-accent-1) 0%, var(--lm-accent-2) 50%, var(--lm-accent-3) 100%); border-radius: 2px; }
  .lm-hero { background: linear-gradient(rgba(0,0,0,0.65) 0%, rgba(10,10,10,0.55) 100%), linear-gradient(135deg, ${c.heroA} 0%, ${c.heroB} 100%); }
  .stat-card { background: #fff; border: 1px solid #e5e7eb; transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .stat-card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(0,0,0,0.06); }
  .metric-value { font-variant-numeric: tabular-nums; }
  .prototype-badge { background: rgba(255,255,255,0.12); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.25); font-weight: 500; letter-spacing: 0.08em; }
</style>
</head>
<body>

<header class="lm-hero text-white relative overflow-hidden">
  <div class="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/10">
    <div class="flex items-center gap-3">
      <div class="flex flex-col">
        <span class="text-white text-xl font-bold tracking-tight">${c.name}</span>
        <div class="lm-accent-bar w-full mt-1"></div>
        <p class="text-[10px] uppercase tracking-widest text-white/60 mt-1">${c.tagline}</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <a href="../" class="text-xs text-white/70 hover:text-white uppercase tracking-widest">&larr; Home</a>
      <span class="prototype-badge text-white text-[11px] px-3 py-1.5 rounded-sm uppercase">Live Metrics</span>
    </div>
  </div>

  <div class="max-w-6xl mx-auto px-6 py-16 relative">
    <div class="flex items-center gap-3 mb-4">
      <span class="relative flex h-3 w-3">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
      </span>
      <p class="text-white/70 text-sm uppercase tracking-[0.2em]">Live &middot; Google Ads &middot; Real-time</p>
    </div>
    <h1 class="text-4xl md:text-5xl font-medium text-white leading-tight max-w-3xl">
      <span class="heading-bold">Live</span> performance metrics
    </h1>
    <div class="lm-accent-bar w-32 mt-6"></div>
    <p class="text-white/80 mt-6 max-w-2xl leading-relaxed">
      Real-time Google Ads campaign data for ${c.name} — last 28 days on a rolling window.
      Pulled directly from the Google Ads API once a day.
    </p>
    <div class="mt-6 flex items-center gap-4 flex-wrap">
      <span class="text-xs text-white/60" id="lastUpdated">Loading&hellip;</span>
      <button onclick="loadLiveData(true)" class="text-xs bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-4 py-2 rounded-full transition">&#8635; Refresh now</button>
    </div>
  </div>
</header>

<main class="max-w-6xl mx-auto px-6 py-16 space-y-12">
  <div id="liveDataContent">
    <div class="text-center py-16 text-gray-400">Loading live Google Ads data&hellip;</div>
  </div>
</main>

<footer class="border-t border-gray-200 mt-8">
  <div class="max-w-6xl mx-auto px-6 py-8 flex justify-between items-center flex-wrap gap-4">
    <div class="flex items-center gap-3">
      <div class="flex flex-col">
        <span class="text-gray-900 text-sm font-bold tracking-tight">${c.name}</span>
        <div class="lm-accent-bar w-full mt-0.5"></div>
      </div>
      <p class="text-xs text-gray-500">Live metrics &middot; Reporting by Tweak Marketing</p>
    </div>
    <p class="text-xs text-gray-400">Data source: Google Ads API &middot; Read-only</p>
  </div>
</footer>

<script>
  const WORKER_URL = '${WORKER_URL}';
  const CLIENT_SLUG = '${c.slug}';
  const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 });
  const numFmt = new Intl.NumberFormat('en-GB');

  function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const now = Date.now();
    const mins = Math.round((now - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return \`\${mins} min\${mins === 1 ? '' : 's'} ago\`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return \`\${hrs} hour\${hrs === 1 ? '' : 's'} ago\`;
    const days = Math.round(hrs / 24);
    return \`\${days} day\${days === 1 ? '' : 's'} ago\`;
  }

  function statusBadge(status) {
    if (status === 'ENABLED') return '<span class="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Active</span>';
    if (status === 'PAUSED') return '<span class="text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Paused</span>';
    return \`<span class="text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">\${status}</span>\`;
  }

  function renderNotConfigured(reason) {
    document.getElementById('liveDataContent').innerHTML = \`
      <div class="stat-card rounded-xl p-10 text-center">
        <p class="font-semibold text-gray-800">Live Metrics isn't connected yet for ${c.name}</p>
        <p class="text-sm mt-2 text-gray-500 max-w-md mx-auto">\${reason || 'Once a team member connects their Google account and a Google Ads Customer ID is set for this client, numbers will appear here automatically.'}</p>
      </div>\`;
    document.getElementById('lastUpdated').textContent = 'Not connected';
  }

  function renderError(msg) {
    document.getElementById('liveDataContent').innerHTML = \`
      <div class="stat-card rounded-xl p-8 text-center">
        <p class="font-semibold text-red-600">Couldn't load live data</p>
        <p class="text-xs mt-2 text-red-500">\${msg}</p>
      </div>\`;
    document.getElementById('lastUpdated').textContent = 'Update failed';
  }

  function renderLive(payload) {
    const data = payload.data;
    const t = data.totals;
    const activeCampaigns = data.campaigns.filter(c => c.status === 'ENABLED');
    const period = data.meta.period;

    const html = \`
      <section class="p-6 border-l-4 flex items-center justify-between flex-wrap gap-4" style="background: linear-gradient(135deg, color-mix(in srgb, var(--lm-accent-3) 20%, white) 0%, color-mix(in srgb, var(--lm-accent-1) 12%, white) 100%); border-left-color: var(--lm-accent-2);">
        <div>
          <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Reporting Period</p>
          <p class="text-lg font-medium text-gray-900 mt-1">\${period.label || \`\${period.start} &rarr; \${period.end}\`}</p>
          <p class="text-xs text-gray-500 mt-1">\${period.start} &rarr; \${period.end}</p>
        </div>
        <div class="text-right">
          <p class="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Customer</p>
          <p class="text-lg font-medium text-gray-900 mt-1">\${data.meta.customer.name || '${c.name}'}</p>
          <p class="text-xs text-gray-500">\${[data.meta.customer.currency, data.meta.customer.timezone].filter(Boolean).join(' &middot; ')}</p>
        </div>
      </section>

      <section>
        <div class="mb-6">
          <p class="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-semibold mb-2">Key metrics</p>
          <h2 class="text-2xl font-medium text-gray-900">Campaign performance at a glance</h2>
          <div class="lm-accent-bar w-16 mt-3"></div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div class="stat-card rounded-xl p-5">
            <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Total Clicks</p>
            <p class="text-3xl font-bold text-gray-900 mt-2 metric-value">\${numFmt.format(t.clicks)}</p>
          </div>
          <div class="stat-card rounded-xl p-5">
            <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Impressions</p>
            <p class="text-3xl font-bold text-gray-900 mt-2 metric-value">\${numFmt.format(t.impressions)}</p>
          </div>
          <div class="stat-card rounded-xl p-5">
            <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Conversions</p>
            <p class="text-3xl font-bold mt-2 metric-value" style="color: var(--lm-accent-1);">\${t.conversions}</p>
          </div>
          <div class="stat-card rounded-xl p-5">
            <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Total Spend</p>
            <p class="text-3xl font-bold text-gray-900 mt-2 metric-value">\${gbp.format(t.cost)}</p>
          </div>
          <div class="stat-card rounded-xl p-5">
            <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Avg CPC</p>
            <p class="text-3xl font-bold text-gray-900 mt-2 metric-value">\${gbp.format(t.cpc)}</p>
          </div>
        </div>
      </section>

      <section>
        <div class="mb-6">
          <p class="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-semibold mb-2">Campaigns</p>
          <h2 class="text-2xl font-medium text-gray-900">All campaign performance</h2>
          <div class="lm-accent-bar w-16 mt-3"></div>
        </div>
        <div class="stat-card rounded-xl p-6 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th class="py-3 pr-4">Campaign</th>
                <th class="py-3 px-3 text-right">Impressions</th>
                <th class="py-3 px-3 text-right">Clicks</th>
                <th class="py-3 px-3 text-right">CTR</th>
                <th class="py-3 px-3 text-right">Avg CPC</th>
                <th class="py-3 px-3 text-right">Spend</th>
                <th class="py-3 px-3 text-right">Conversions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              \${data.campaigns.map(c => \`
                <tr class="\${c.status === 'PAUSED' ? 'opacity-60' : ''}">
                  <td class="py-3 pr-4">
                    <div class="flex items-center gap-2">
                      <span class="font-semibold text-gray-900">\${c.name}</span>
                      \${statusBadge(c.status)}
                    </div>
                  </td>
                  <td class="py-3 px-3 text-right tabular-nums text-gray-700">\${numFmt.format(c.impressions)}</td>
                  <td class="py-3 px-3 text-right tabular-nums text-gray-700">\${numFmt.format(c.clicks)}</td>
                  <td class="py-3 px-3 text-right tabular-nums text-gray-700">\${c.ctr}%</td>
                  <td class="py-3 px-3 text-right tabular-nums text-gray-700">\${gbp.format(c.cpc)}</td>
                  <td class="py-3 px-3 text-right tabular-nums text-gray-700">\${gbp.format(c.cost)}</td>
                  <td class="py-3 px-3 text-right tabular-nums font-semibold" style="color: var(--lm-accent-1);">\${c.conversions || '&mdash;'}</td>
                </tr>
              \`).join('')}
            </tbody>
            <tfoot>
              <tr class="font-bold border-t-2 border-gray-200">
                <td class="py-3 pr-4 text-gray-900">Total <span class="text-xs font-normal text-gray-500">(\${activeCampaigns.length} active, \${data.campaigns.length - activeCampaigns.length} paused)</span></td>
                <td class="py-3 px-3 text-right tabular-nums text-gray-900">\${numFmt.format(t.impressions)}</td>
                <td class="py-3 px-3 text-right tabular-nums text-gray-900">\${numFmt.format(t.clicks)}</td>
                <td class="py-3 px-3 text-right tabular-nums text-gray-900">\${t.ctr}%</td>
                <td class="py-3 px-3 text-right tabular-nums text-gray-900">\${gbp.format(t.cpc)}</td>
                <td class="py-3 px-3 text-right tabular-nums text-gray-900">\${gbp.format(t.cost)}</td>
                <td class="py-3 px-3 text-right tabular-nums" style="color: var(--lm-accent-1);">\${t.conversions}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p class="text-xs text-gray-400 italic text-center pt-6 border-t border-gray-100">
        &#10003; Google Ads data pulled directly from the Google Ads API. Read-only access.
        <br>Data source updated \${timeAgo(data.meta.pulledAt)} &middot; Auto-refreshes daily at 06:00 UTC.
      </p>
    \`;
    document.getElementById('liveDataContent').innerHTML = html;
    document.getElementById('lastUpdated').textContent = \`Data pulled \${timeAgo(payload.cachedAt || data.meta.pulledAt)}\`;
  }

  async function loadLiveData(force) {
    try {
      const path = force ? '/metrics/refresh' : '/metrics';
      const url = \`\${WORKER_URL}\${path}?client=\${encodeURIComponent(CLIENT_SLUG)}\`;
      const res = await fetch(url, { cache: 'no-store' });
      const payload = await res.json();
      if (!payload.configured) {
        renderNotConfigured(payload.reason);
        return;
      }
      renderLive(payload);
    } catch (e) {
      renderError(e.message);
    }
  }

  loadLiveData();
</script>

</body>
</html>
`;
}

module.exports = { liveHTML };
