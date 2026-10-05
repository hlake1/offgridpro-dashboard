/*
 * Weekly / no-Ads variant for clients flagged `weekly: true` in
 * build-client-profiles.js (currently SCL only).
 *
 * These helpers post-process the output of the normal generators so every
 * other client's generated files stay byte-identical. Each replacement
 * asserts that its target text exists — if a generator changes later this
 * throws loudly instead of silently producing a half-weekly page.
 *
 * Period ids are ISO weeks written YYYY-WW (e.g. 2026-41, Monday–Sunday),
 * which the reports worker already accepts (/^\d{4}-\d{2}$/), so no worker
 * change is needed.
 */

function rep(s, from, to, label) {
  if (from instanceof RegExp) {
    if (!from.test(s)) throw new Error('weekly-variant: pattern not found: ' + (label || from));
    return s.replace(from, to);
  }
  if (!s.includes(from)) throw new Error('weekly-variant: text not found: ' + (label || from.slice(0, 80)));
  return s.split(from).join(to);
}

// ---------------------------------------------------------------------------
// reports-store.js
// ---------------------------------------------------------------------------
function weeklyStore(js, c) {
  let s = js;
  s = rep(s, 'What went well this month?', 'What went well this week?');
  s = rep(s, "What\\'s the top win this month?", "What\\'s the top win this week?");
  s = rep(s, 'What did you work on this month?', 'What did you work on this week?');
  s = rep(s, "What\\'s the plan for next month?", "What\\'s the plan for next week?");
  s = rep(s, 'The priorities for next month, one per line', 'The priorities for next week, one per line');
  s = rep(s, 'Solid month of steady growth across active campaigns.', 'A steady week of progress.');
  s = rep(s, 'Manages monthly reports created', 'Manages weekly reports created');

  const label = String.raw`  // ---- Weekly periods ------------------------------------------------------
  // ISO weeks (Monday–Sunday). A period id is YYYY-WW, e.g. 2026-41.
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoWeekOf(date) {
    const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y = t.getUTCFullYear();
    const jan1 = new Date(Date.UTC(y, 0, 1));
    return { y, w: Math.ceil(((t - jan1) / 86400000 + 1) / 7) };
  }
  function weekBounds(period) {
    const m = /^(\d{4})-(\d{2})$/.exec(period || '');
    if (!m) return null;
    const y = Number(m[1]), w = Number(m[2]);
    if (w < 1 || w > 53) return null;
    const jan4 = new Date(Date.UTC(y, 0, 4));
    const day = jan4.getUTCDay() || 7;
    const mon = new Date(jan4);
    mon.setUTCDate(jan4.getUTCDate() - day + 1 + (w - 1) * 7);
    const sun = new Date(mon);
    sun.setUTCDate(mon.getUTCDate() + 6);
    const thu = new Date(mon);
    thu.setUTCDate(mon.getUTCDate() + 3);
    const chk = isoWeekOf(thu);
    if (chk.y !== y || chk.w !== w) return null; // e.g. week 53 in a 52-week year
    return { mon, sun };
  }
  function isoDate(d) { return d.toISOString().slice(0, 10); }
  function weekRange(period) {
    const b = weekBounds(period);
    return b ? { since: isoDate(b.mon), until: isoDate(b.sun) } : null;
  }
  function periodForDate(date) { const p = isoWeekOf(date); return p.y + '-' + pad2(p.w); }
  function lastWeekPeriod() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    return periodForDate(d);
  }
  // Name kept as monthLabel so the shared report / index code keeps working;
  // for weekly clients it returns the week label.
  function monthLabel(period) {
    const b = weekBounds(period);
    if (!b) return period || '';
    const sameYear = b.mon.getUTCFullYear() === b.sun.getUTCFullYear();
    const fmt = (d, withYear) => d.toLocaleDateString('en-GB', withYear
      ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
      : { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return 'Week ' + Number(period.slice(5)) + ' · ' + fmt(b.mon, !sameYear) + ' – ' + fmt(b.sun, true);
  }
`;
  s = rep(s, /  function monthLabel\(month\) \{[\s\S]*?\n  \}\n/, label, 'monthLabel fn');
  s = rep(s, 'generateSummary, monthLabel,', 'generateSummary, monthLabel, weekRange, lastWeekPeriod, periodForDate,');
  return s;
}

// ---------------------------------------------------------------------------
// admin/builder.html
// ---------------------------------------------------------------------------
function weeklyBuilder(html, c) {
  let s = html;
  const NS = c.NS;

  s = rep(s, '— Monthly Report Builder</title>', '— Weekly Report Builder</title>');
  s = rep(s, 'Monthly report builder · ', 'Weekly report builder · ');
  s = rep(s, "Next you'll enter the month's metrics, then", "Next you'll add this week's website figures, then");
  s = rep(s, "Step 2 — enter this month's Google Ads figures. These power the metrics + top-campaign panels in the report.",
    "Step 2 — pull or enter this week's website traffic and search figures (and rankings or screenshots if you have them). These power the traffic panels in the report.");

  // Period picker: ISO week instead of month.
  s = rep(s,
    /<label for="month">Report month<\/label>\s*<p class="hint">Which month is this report covering\?<\/p>\s*<input id="month" type="month" required \/>/,
    '<label for="month">Report week</label>\n          <p class="hint">Which week is this report covering? (Monday–Sunday)</p>\n          <input id="month" type="week" placeholder="2026-W41" required />\n          <p class="hint" id="week-hint" style="margin-top:6px;"></p>',
    'period picker');
  s = rep(s, '.qbox input[type="month"]', '.qbox input[type="month"], .qbox input[type="week"]');

  // No Ads / Meta for this client: hide the cards (JS still finds its elements).
  s = rep(s, '<section class="card p-6 mt-6" id="meta-card">', '<section class="card p-6 mt-6" id="meta-card" style="display:none;">', 'meta card');
  s = rep(s,
    /<section class="card p-6 mt-6">(\s*<div class="flex items-start justify-between flex-wrap gap-3">\s*<div>\s*<h2 class="text-xl font-medium">Google Ads metrics<\/h2>)/,
    '<section class="card p-6 mt-6" id="ads-metrics-card" style="display:none;">$1', 'ads metrics card');
  s = rep(s,
    /<section class="card p-6 mt-6">(\s*<div class="flex items-center justify-between flex-wrap gap-2">\s*<div>\s*<h2 class="text-xl font-medium">Campaigns<\/h2>)/,
    '<section class="card p-6 mt-6" id="campaigns-card" style="display:none;">$1', 'campaigns card');
  s = rep(s, '<h2 class="text-xl font-medium">Google Ads &amp; Analytics</h2>', '<h2 class="text-xl font-medium">Google Analytics &amp; Search Console</h2>');
  s = rep(s,
    '<p class="hint mt-2"><strong>Google Ads accounts</strong> (read via <code>adwords</code>):</p>\n          <ul id="google-preview-ads" class="hint" style="margin-left:1.25rem; list-style:disc;"></ul>',
    '<ul id="google-preview-ads" class="hint" style="display:none;"></ul>', 'ads preview list');

  s = rep(s, 'Pull website traffic for this month', 'Pull website traffic for this week');
  s = rep(s, 'report month', 'report week');

  // Period helpers
  s = rep(s, "const monthEl = document.getElementById('month');",
    String.raw`const monthEl = document.getElementById('month');
  // Weekly reports: the input holds an ISO week (2026-W41); the stored period id is 2026-41.
  const WEEK_NATIVE = monthEl.type === 'week';
  function getPeriod() {
    const m = /^(\d{4})-?W?(\d{1,2})$/i.exec((monthEl.value || '').trim());
    return m ? m[1] + '-' + String(m[2]).padStart(2, '0') : '';
  }
  function updateWeekHint() {
    const el = document.getElementById('week-hint');
    if (!el) return;
    const R = window.${NS}Reports.weekRange(getPeriod());
    el.textContent = R ? 'Covers ' + R.since + ' to ' + R.until + '.' : (WEEK_NATIVE ? '' : 'Type the week like 2026-W41.');
  }
  function setPeriod(p) {
    const m = /^(\d{4})-(\d{2})$/.exec(p || '');
    monthEl.value = m ? m[1] + '-W' + m[2] : '';
    updateWeekHint();
  }
  monthEl.addEventListener('change', updateWeekHint);
  monthEl.addEventListener('input', updateWeekHint);`);

  s = rep(s, /  function defaultMonth\(\) \{[\s\S]*?\n  \}\n/,
    "  function defaultMonth() {\n    return window." + NS + "Reports.lastWeekPeriod();\n  }\n", 'defaultMonth');
  s = rep(s, /  function monthToDateRange\(month\) \{[\s\S]*?\n  \}\n/,
    "  function monthToDateRange(period) {\n    return window." + NS + "Reports.weekRange(period) || { since: '', until: '' };\n  }\n", 'monthToDateRange');

  s = rep(s, 'const month = monthEl.value;', 'const month = getPeriod();', 'month reads');
  s = rep(s, 'monthEl.value = defaultMonth();', 'setPeriod(defaultMonth());', 'default set');
  s = rep(s, 'monthEl.value = r.month || defaultMonth();', 'setPeriod(r.month || defaultMonth());', 'existing set');
  return s;
}

// ---------------------------------------------------------------------------
// admin/view.html
// ---------------------------------------------------------------------------
function weeklyView(html, c) {
  let s = html;
  s = rep(s, '— Monthly Report</title>', '— Weekly Report</title>');
  s = rep(s, 'Monthly performance report · ', 'Weekly performance report · ');
  s = rep(s, 'Top win this month', 'Top win this week');
  s = rep(s, 'Plan for next month', 'Plan for next week');
  // No Ads panel / "live API data" notice for this client.
  s = rep(s, '<section id="metrics-section" class="card p-8">', '<section id="metrics-section" class="card p-8" style="display:none;">', 'metrics section');
  s = rep(s, "if (s.dataStatus && s.dataStatus.available === false) {", "if (false) {", 'data banner');
  return s;
}

module.exports = { weeklyStore, weeklyBuilder, weeklyView, rep };
