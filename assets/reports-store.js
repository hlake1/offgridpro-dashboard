/*!
 * OffGrid Pro Dashboard — Reports store
 *
 * Manages monthly reports created via the admin builder.
 * State is persisted to localStorage (prototype). Each report has:
 *   {
 *     id: "2026-07",
 *     month: "2026-07",
 *     title: "July 2026",
 *     status: "draft" | "published",
 *     createdAt, updatedAt, publishedAt,
 *     answers: { q1: "...", q2: "...", ... },
 *     revisionNotes: [{ ts, note }],
 *     summary: { ... auto-generated }
 *   }
 *
 * We also expose the list of *published* reports for the client-facing
 * index page to render alongside the pre-built June 2026 report.
 */
(function () {
  const KEY = 'ogp_reports_v1';

  const QUESTIONS = [
    { id: 'q1', label: 'What was your biggest win this month?', hint: 'The headline result — the thing you\'d lead with in a meeting.' },
    { id: 'q2', label: 'Which campaign or channel exceeded expectations?', hint: 'Name it and say why it outperformed.' },
    { id: 'q3', label: 'Any client feedback or anecdotes worth capturing?', hint: 'Quotes, calls, positive/negative signals from OffGrid Pro.' },
    { id: 'q4', label: 'What was the main strategic focus this month?', hint: 'The theme you were working towards.' },
    { id: 'q5', label: 'Why did you prioritise these changes?', hint: 'The reasoning behind the pivots or new tests.' },
    { id: 'q6', label: 'Any pivots or challenges?', hint: 'What didn\'t work, what you paused, what you had to work around.' },
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

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

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
    // Sending back to draft when edits are suggested
    if (r.status === 'published') r.status = 'draft';
    save(state);
    return r;
  }

  /**
   * Build a "summary" object from form answers + live Google Ads data.
   * This is what powers the auto-generated draft report view.
   */
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
      headline,
      overperformer,
      feedback,
      focus,
      rationale,
      challenges,
      priorities,
      budget,
      extras,
      metrics: totals,
      topCampaign,
      activeCampaigns: activeCampaigns.map(c => c.name),
      generatedAt: new Date().toISOString(),
    };
  }

  function monthLabel(month) {
    // month is "YYYY-MM"
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return month || '';
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  function exportAll() {
    return load();
  }

  function importAll(data) {
    if (!data || !Array.isArray(data.reports)) throw new Error('Invalid data');
    save(data);
  }

  window.OGPReports = {
    QUESTIONS,
    list,
    listPublished,
    listDrafts,
    get,
    upsert,
    remove,
    publish,
    unpublish,
    addRevisionNote,
    generateSummary,
    monthLabel,
    exportAll,
    importAll,
  };
})();
