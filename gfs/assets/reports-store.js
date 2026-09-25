/*!
 * GFS Dashboard — Reports store
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
  const CLIENT_SLUG = 'gfs';

  const QUESTIONS = [
    { id: 'q1', label: 'What was your biggest win this month?', hint: 'The headline result — the thing you\'d lead with in a meeting.' },
    { id: 'q2', label: 'Which campaign or channel exceeded expectations?', hint: 'Name it and say why it outperformed.' },
    { id: 'q3', label: 'Any client feedback or anecdotes worth capturing?', hint: 'Quotes, calls, positive/negative signals from GFS.' },
    { id: 'q4', label: 'What was the main strategic focus this month?', hint: 'The theme you were working towards.' },
    { id: 'q5', label: 'Why did you prioritise these changes?', hint: 'The reasoning behind the pivots or new tests.' },
    { id: 'q6', label: 'Any pivots or challenges?', hint: 'What didn\'t work, what you paused, what you had to work around.' },
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
      .split(/\r?\n|·|•|;|,\s*(?=\d\.)/)
      .map(s => s.replace(/^\s*\d+\.\s*/, '').trim())
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
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return month || '';
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  window.GFSReports = {
    QUESTIONS, list, listPublished, listDrafts, get, upsert,
    publish, unpublish, addRevisionNote, generateSummary, monthLabel,
  };
})();
