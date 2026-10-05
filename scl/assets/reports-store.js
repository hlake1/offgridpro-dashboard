/*!
 * SCL Dashboard — Reports store
 *
 * Manages weekly reports created via the admin builder. Reports are
 * stored centrally via the Tweak Reports Worker (Cloudflare Worker +
 * Supabase), so a published report is visible from any device or
 * browser — not just the one that created it.
 *
 * Every method here is async (returns a Promise) and needs an
 * Authorization session (tw_session, set by the root login page).
 */
(function () {
  const WORKER_URL = 'https://tweak-reports.herbielakeai.workers.dev';
  const CLIENT_SLUG = 'scl';

  const QUESTIONS = [
    { id: 'wentWell', label: 'What went well this week?', hint: 'One item per line — these appear as a table on the Overview.', rows: 4 },
    { id: 'needsWork', label: 'What needs to be worked on?', hint: 'One item per line — these appear as a table on the Overview.', rows: 4 },
    { id: 'topWin', label: 'What\'s the top win this week?', hint: 'The single headline result — this leads the report.', rows: 3 },
    { id: 'workedOn', label: 'What did you work on this week?', hint: 'Summarise the work carried out — this appears on the Content page.', rows: 4 },
    { id: 'neededFromClient', label: 'Do you need anything from SCL?', hint: 'Outstanding approvals, assets, access, or anything else you\'re waiting on. One per line — leave blank if nothing.', rows: 4 },
    { id: 'nextMonthPlan', label: 'What\'s the plan for next week?', hint: 'The priorities for next week, one per line — these appear in Next Steps.', rows: 4 },
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
      webTraffic: row.web_traffic || null,
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
      webTraffic: report.webTraffic || null,
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

  async function uploadScreenshot(period, file) {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(WORKER_URL + '/reports/screenshot?client=' + encodeURIComponent(CLIENT_SLUG) + '&period=' + encodeURIComponent(period), {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      body: form,
    });
    let json = null;
    try { json = await res.json(); } catch { /* ignore */ }
    if (!res.ok) throw new Error((json && json.error) || ('Upload failed (' + res.status + ')'));
    return json; // { path, url }
  }

  async function deleteScreenshot(path) {
    return apiFetch('/reports/screenshot', { method: 'DELETE', body: { path } });
  }

  async function addRevisionNote(id, note) {
    const r = await get(id);
    if (!r) return null;
    r.revisionNotes = r.revisionNotes || [];
    r.revisionNotes.push({ ts: new Date().toISOString(), note });
    if (r.status === 'published') r.status = 'draft';
    return upsert(r);
  }

  function splitList(text, max) {
    return (text || '')
      .split(/\r?\n|·|•|;|,\s*(?=\d\.)/)
      .map(s => s.replace(/^\s*[-*]\s*/, '').replace(/^\s*\d+\.\s*/, '').trim())
      .filter(Boolean)
      .slice(0, max || 8);
  }

  function generateSummary(answers, adsData) {
    const totals = adsData?.totals || null;
    const campaigns = (adsData?.campaigns || []).slice().sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
    const topCampaign = campaigns.find(c => c.status === 'ENABLED') || campaigns[0] || null;
    const activeCampaigns = campaigns.filter(c => c.status === 'ENABLED');

    const wentWell = splitList(answers.wentWell);
    const needsWork = splitList(answers.needsWork);
    const neededFromClient = splitList(answers.neededFromClient);
    const nextMonthPlan = splitList(answers.nextMonthPlan, 5);

    const topWin = (answers.topWin || '').trim() || 'A steady week of progress.';
    const workedOn = (answers.workedOn || '').trim();

    return {
      // "headline" is kept as an alias of topWin — the hero banner and the
      // dashboard's report-card preview both read summary.headline.
      headline: topWin,
      topWin, workedOn, wentWell, needsWork, neededFromClient, nextMonthPlan,
      metrics: totals,
      topCampaign,
      activeCampaigns: activeCampaigns.map(c => c.name),
      generatedAt: new Date().toISOString(),
    };
  }

  // ---- Weekly periods ------------------------------------------------------
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

  window.SCLReports = {
    QUESTIONS, list, listPublished, listDrafts, get, upsert,
    publish, unpublish, addRevisionNote, generateSummary, monthLabel, weekRange, lastWeekPeriod, periodForDate,
    uploadScreenshot, deleteScreenshot,
  };
})();
