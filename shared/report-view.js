/*!
 * Tweak Reporting: shared monthly report view.
 *
 * One layout for every client. A client's admin/view.html loads its own
 * auth.js and reports-store.js, then calls:
 *   TweakReportView.mount({ auth, store, clientName, authEvent, backHref })
 * Change the layout here and every client's report changes with it.
 * Sections with no data show a "not tracked" note rather than blank space.
 */
(function () {
  'use strict';

  var TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'ads', label: 'Google Ads' },
    { id: 'meta', label: 'Meta' },
    { id: 'seo', label: 'SEO' },
    { id: 'social', label: 'Organic Social' },
    { id: 'content', label: 'Content' }
  ];

  var num = new Intl.NumberFormat('en-GB');
  var gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  var gbp2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function has(v) { return v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && isNaN(v)); }
  function fNum(v) { return has(v) ? num.format(Number(v)) : null; }
  function fGbp0(v) { return has(v) ? gbp0.format(Number(v)) : null; }
  function fGbp2(v) { return has(v) ? gbp2.format(Number(v)) : null; }
  function fPct(v) { return has(v) ? Number(v).toFixed(2) + '%' : null; }
  function fDur(secs) {
    if (!has(secs)) return null;
    var n = Math.round(Number(secs));
    return Math.floor(n / 60) + 'm ' + String(n % 60).padStart(2, '0') + 's';
  }
  // Splits the account manager's text into one item per line.
  function lines(text) {
    return String(text || '').split(/\r?\n/)
      .map(function (s) { return s.replace(/^\s*[-*•]\s*/, '').trim(); })
      .filter(Boolean);
  }
  // The account manager's own answers come first; the generated summary is the fallback.
  function listFor(r, key) {
    var fromAnswers = lines((r.answers || {})[key]);
    if (fromAnswers.length) return fromAnswers;
    var s = r.summary || {};
    return Array.isArray(s[key]) ? s[key] : [];
  }

  function card(inner, extra) {
    return '<section class="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:p-8 ' + (extra || '') + '">' + inner + '</section>';
  }
  function heading(kicker, title, sub) {
    return '<p class="text-xs font-semibold uppercase tracking-widest text-slate-500">' + esc(kicker) + '</p>' +
      '<h2 class="mt-1 text-xl font-extrabold text-slate-900">' + esc(title) + '</h2>' +
      (sub ? '<p class="mt-1 text-sm text-slate-500">' + esc(sub) + '</p>' : '');
  }
  function notTracked(title, text) {
    return '<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 md:p-8">' +
      '<p class="font-semibold text-slate-700">' + esc(title) + '</p>' +
      (text ? '<p class="mt-2 text-sm text-slate-500">' + esc(text) + '</p>' : '') + '</div>';
  }
  function stat(label, value, sub) {
    return '<div class="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">' +
      '<p class="text-xs font-semibold uppercase tracking-wide text-slate-500">' + esc(label) + '</p>' +
      '<p class="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">' + (value == null ? '<span class="text-slate-300">&mdash;</span>' : esc(value)) + '</p>' +
      (sub ? '<p class="mt-0.5 text-xs text-slate-400">' + esc(sub) + '</p>' : '') + '</div>';
  }
  function statGrid(items) {
    return '<div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">' +
      items.map(function (i) { return stat(i[0], i[1], i[2]); }).join('') + '</div>';
  }
  function bullets(items, empty) {
    if (!items.length) return '<p class="mt-4 text-sm text-slate-400">' + esc(empty) + '</p>';
    return '<ul class="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-800">' +
      items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
  }
  function table(headers, rows) {
    if (!rows.length) return '';
    return '<div class="mt-5 overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">' +
      headers.map(function (h) { return '<th class="py-2 pr-4 font-semibold">' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (row) {
        return '<tr class="border-b border-slate-50">' + row.map(function (c) { return '<td class="py-2 pr-4 text-slate-800">' + esc(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ---- Panels ----------------------------------------------------------

  function overviewPanel(r) {
    var m = (r.summary && r.summary.metrics) || {};
    var t = (r.webTraffic && r.webTraffic.totals) || {};
    var a = r.answers || {};
    var s = r.summary || {};
    var conv = m.conversions, cost = m.cost;
    var perConv = (has(cost) && has(conv) && Number(conv) > 0) ? Number(cost) / Number(conv) : null;
    var topWin = a.topWin || s.topWin || s.headline || '';

    var funnel = [
      ['Spend', fGbp0(cost)],
      ['Impressions', fNum(m.impressions)],
      ['Clicks', fNum(m.clicks)],
      ['Website sessions', fNum(t.sessions)],
      ['Conversions', fNum(conv)]
    ].filter(function (f) { return f[1] !== null; });

    var out = '';
    out += card(
      heading('Overview', 'Headline numbers', 'Paid media and website figures for the month') +
      statGrid([
        ['Conversions', fNum(conv), 'paid media'],
        ['Cost per conversion', fGbp2(perConv), null],
        ['Spend', fGbp0(cost), 'paid media'],
        ['Website sessions', fNum(t.sessions), null],
        ['Engagement rate', fPct(t.engagementRate), null]
      ])
    );
    if (funnel.length) {
      out += card(
        heading('Overview', 'Marketing funnel', 'Cross-channel journey for the month') +
        '<div class="mt-6 grid grid-cols-1 gap-3 md:grid-cols-' + funnel.length + '">' +
        funnel.map(function (f) {
          return '<div class="rounded-xl bg-emerald-600 p-4 text-white"><p class="text-[10px] font-semibold uppercase tracking-widest text-white/80">' + esc(f[0]) + '</p><p class="mt-1 text-2xl font-extrabold tabular-nums">' + esc(f[1]) + '</p></div>';
        }).join('') + '</div>'
      );
    }
    if (topWin) {
      out += card(
        heading('Overview', 'Top win this month') +
        '<p class="mt-4 text-lg leading-relaxed text-slate-900">' + esc(topWin) + '</p>',
        'border-l-4 border-l-lime-500'
      );
    }
    out += '<div class="grid grid-cols-1 gap-6 md:grid-cols-2">' +
      card(heading('Overview', 'What went well') + bullets(listFor(r, 'wentWell'), 'Nothing logged for this month.')) +
      card(heading('Overview', 'What needs to be worked on') + bullets(listFor(r, 'needsWork'), 'Nothing logged for this month.')) +
      '</div>';
    out += trafficCard(r);
    return out;
  }

  function trafficCard(r) {
    var w = r.webTraffic || {};
    var t = w.totals || {};
    if (!has(t.sessions) && !has(t.users)) {
      return card(heading('Overview', 'Website traffic') + '<p class="mt-4 text-sm text-slate-400">Website traffic is not tracked for this month.</p>');
    }
    var pages = (w.topPages || []).filter(function (p) { return p.path; }).slice(0, 10);
    return card(
      heading('Overview', 'Website traffic', 'Google Analytics') +
      statGrid([
        ['Users', fNum(t.users), has(t.newUsers) ? fNum(t.newUsers) + ' new' : null],
        ['Sessions', fNum(t.sessions), null],
        ['Pageviews', fNum(t.pageviews), null],
        ['Avg. session', fDur(t.avgSessionDuration), null]
      ]) +
      table(['Page', 'Sessions', 'Pageviews'], pages.map(function (p) {
        return [p.path, fNum(p.sessions) || '0', fNum(p.pageviews) || '0'];
      }))
    );
  }

  function adsPanel(r) {
    var m = (r.summary && r.summary.metrics) || null;
    if (!m) return notTracked('Google Ads not tracked this month', 'No Google Ads figures were entered or pulled for this report.');
    var out = card(
      heading('Google Ads', 'Google Ads performance', 'This month') +
      statGrid([
        ['Impressions', fNum(m.impressions), null],
        ['Clicks', fNum(m.clicks), null],
        ['CTR', fPct(m.ctr), null],
        ['Average CPC', fGbp2(m.cpc), null],
        ['Conversions', fNum(m.conversions), null],
        ['Spend', fGbp0(m.cost), null]
      ])
    );
    var top = (r.summary && r.summary.topCampaign) || null;
    if (top) {
      out += card(
        heading('Google Ads', 'Top campaign') +
        '<p class="mt-3 font-semibold text-slate-900">' + esc(top.name) + '</p>' +
        '<p class="mt-1 text-sm text-slate-600">' + esc(fNum(top.clicks) || '0') + ' clicks &middot; ' + esc(fNum(top.conversions) || '0') + ' conversions &middot; ' + esc(fGbp0(top.cost) || '') + ' spend</p>',
        'mt-6'
      );
    }
    return out;
  }

  function metaPanel() {
    return notTracked('Meta Ads not reported this month', 'No Meta Ads figures were entered for this report.');
  }

  function seoPanel(r) {
    var sc = (r.webTraffic && r.webTraffic.searchConsole) || null;
    var rows = (r.seRankings && r.seRankings.rows) || [];
    var out = '';
    if (sc && sc.totals) {
      out += card(
        heading('SEO', 'Search visibility', 'Google Search Console') +
        statGrid([
          ['Search clicks', fNum(sc.totals.clicks), null],
          ['Impressions', fNum(sc.totals.impressions), null],
          ['Click-through rate', fPct(sc.totals.ctr), null],
          ['Avg. position', has(sc.totals.position) ? String(sc.totals.position) : null, null]
        ]) +
        table(['Query', 'Clicks', 'Impressions'], (sc.topQueries || []).filter(function (q) { return q.query; }).slice(0, 10).map(function (q) {
          return [q.query, fNum(q.clicks) || '0', fNum(q.impressions) || '0'];
        }))
      );
    }
    if (rows.length) {
      out += card(
        heading('SEO', 'Keyword rankings', (r.seRankings.updatedAt ? 'Updated ' + new Date(r.seRankings.updatedAt).toLocaleDateString('en-GB') : '')) +
        table(['Keyword', 'Position', 'Change', 'Volume', 'URL'], rows.map(function (k) {
          return [k.keyword, k.position || '—', k.change || '—', k.volume || '—', k.url || '—'];
        })),
        out ? 'mt-6' : ''
      );
    }
    return out || notTracked('Search visibility not tracked this month', 'No Search Console or keyword ranking figures were entered for this report.');
  }

  function socialPanel() {
    return notTracked('Organic social not tracked this month', 'Follower and engagement figures for social channels were not entered for this report.');
  }

  function contentPanel(r) {
    var shots = (r.seRankings && r.seRankings.screenshots) || [];
    var out = card(heading('Content', 'What we worked on') + bullets(listFor(r, 'workedOn'), 'Nothing logged for this month.'));
    if (shots.length) {
      out += card(
        heading('Content', 'Screenshots') +
        '<div class="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3">' +
        shots.map(function (s) {
          return '<figure class="overflow-hidden rounded-xl border border-slate-100"><img src="' + esc(s.url) + '" alt="' + esc(s.caption || '') + '" loading="lazy" class="h-36 w-full object-cover"><figcaption class="p-2 text-xs text-slate-500">' + esc(s.caption || '') + '</figcaption></figure>';
        }).join('') + '</div>',
        'mt-6'
      );
    }
    return out;
  }

  function nextStepsSection(r) {
    var plan = listFor(r, 'nextMonthPlan');
    var needed = listFor(r, 'neededFromClient');
    return card(
      heading('Next steps', "What's next") +
      '<div class="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">' +
      '<div><p class="text-sm font-semibold text-slate-900">Plan for next month</p>' +
      (plan.length ? '<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-800">' + plan.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ol>' : '<p class="mt-3 text-sm text-slate-400">To be defined.</p>') +
      '</div><div><p class="text-sm font-semibold text-slate-900">Needed from the client</p>' +
      bullets(needed, 'Nothing outstanding.') + '</div></div>',
      'border-l-4 border-l-lime-500'
    );
  }

  // ---- Page shell ------------------------------------------------------

  function adminBar(r) {
    var pub = r.status === 'published';
    return '<section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
      '<div class="flex flex-wrap items-center justify-between gap-3">' +
      '<div><p class="text-xs font-semibold uppercase tracking-widest text-slate-500">Admin</p>' +
      '<p class="mt-1 text-sm text-slate-700">' + (pub ? 'This report is live in the client view.' : 'This report is a draft. Only admins can see it until it is published.') + '</p></div>' +
      '<div class="flex flex-wrap items-center gap-2">' +
      '<a href="./builder.html?id=' + encodeURIComponent(r.id) + '" class="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit answers</a>' +
      '<button type="button" id="btn-revise" class="rounded-md border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">Suggest edits</button>' +
      (pub
        ? '<button type="button" id="btn-unpublish" class="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Unpublish</button>'
        : '<button type="button" id="btn-publish" class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Approve and publish</button>') +
      '</div></div>' +
      '<div id="revise-box" class="mt-4 hidden"><textarea id="revise-text" rows="4" class="w-full rounded-md border border-slate-200 p-3 text-sm" placeholder="What needs to change?"></textarea>' +
      '<div class="mt-2 flex justify-end gap-2"><button type="button" id="revise-cancel" class="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>' +
      '<button type="button" id="revise-save" class="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Add note</button></div></div>' +
      '</section>';
  }

  function revisionNotes(r) {
    var notes = r.revisionNotes || [];
    if (!notes.length) return '';
    return card(
      heading('Admin', 'Feedback for the next pass') +
      '<ul class="mt-4 space-y-3">' + notes.slice().reverse().map(function (n) {
        return '<li class="border-l-2 border-amber-400 pl-4"><p class="text-xs text-amber-700">' + esc(new Date(n.ts).toLocaleString('en-GB')) + '</p><p class="mt-1 whitespace-pre-wrap text-sm text-slate-800">' + esc(n.note) + '</p></li>';
      }).join('') + '</ul>'
    );
  }

  function page(r, isAdmin, o) {
    var s = r.summary || {};
    var period = o.store.monthLabel(r.month);
    var title = (o.clientName ? o.clientName + ' — ' : '') + period;
    var status = r.status === 'published'
      ? '<span class="rounded bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-800">Published</span>'
      : '<span class="rounded bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-800">Draft</span>';

    var header = '<header class="bg-gradient-to-br from-teal-700 via-emerald-600 to-emerald-500 text-white">' +
      '<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">' +
      '<a href="' + esc(o.backHref || '../') + '" class="text-xs uppercase tracking-widest text-white/80 hover:text-white">&larr; All reports</a>' +
      (isAdmin ? '<button type="button" id="logout-btn" class="text-xs uppercase tracking-widest text-white/70 hover:text-white">Sign out</button>' : '') +
      '</div>' +
      '<div class="mx-auto max-w-6xl px-4 pb-10 md:px-6">' +
      '<p class="text-sm uppercase tracking-[0.2em] text-white/80">Monthly performance report</p>' +
      '<div class="mt-2 flex flex-wrap items-center gap-3"><h1 class="text-3xl font-extrabold md:text-4xl">' + esc(title) + '</h1>' + (isAdmin ? status : '') + '</div>' +
      (s.headline ? '<p class="mt-4 max-w-3xl text-lg leading-relaxed text-white/90">' + esc(s.headline) + '</p>' : '') +
      (r.author ? '<p class="mt-4 text-sm text-white/70">Prepared by ' + esc(r.author) + '</p>' : '') +
      '</div></header>';

    var nav = '<nav class="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur"><div class="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 md:px-6">' +
      TABS.map(function (t, i) {
        return '<button type="button" data-tab="' + t.id + '" class="tab-btn whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ' +
          (i === 0 ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-600 hover:text-emerald-700') + '">' + esc(t.label) + '</button>';
      }).join('') + '</div></nav>';

    var panels = {
      overview: overviewPanel(r),
      ads: adsPanel(r),
      meta: metaPanel(r),
      seo: seoPanel(r),
      social: socialPanel(r),
      content: contentPanel(r)
    };
    var body = '<main class="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6">' +
      (isAdmin ? adminBar(r) : '') +
      TABS.map(function (t, i) {
        return '<div class="tab-panel space-y-8" data-panel="' + t.id + '"' + (i === 0 ? '' : ' hidden') + '>' + panels[t.id] + '</div>';
      }).join('') +
      nextStepsSection(r) +
      (isAdmin ? revisionNotes(r) : '') +
      '</main>';
    var footer = '<footer class="py-10 text-center text-xs text-slate-400"><p>' +
      esc(r.author ? 'Prepared by ' + r.author : 'Reporting dashboard by Tweak Marketing') + '</p></footer>';

    return header + nav + body + footer;
  }

  function wire(r, isAdmin, o, reload) {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(function (b) {
          b.classList.remove('border-emerald-600', 'text-emerald-700');
          b.classList.add('border-transparent', 'text-slate-600');
        });
        btn.classList.add('border-emerald-600', 'text-emerald-700');
        btn.classList.remove('border-transparent', 'text-slate-600');
        document.querySelectorAll('.tab-panel').forEach(function (p) {
          p.hidden = p.getAttribute('data-panel') !== btn.getAttribute('data-tab');
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    var logout = document.getElementById('logout-btn');
    if (logout) logout.addEventListener('click', function () { o.auth.logout(o.backHref || '../'); });
    if (!isAdmin) return;

    var pub = document.getElementById('btn-publish');
    if (pub) pub.addEventListener('click', async function () {
      if (!window.confirm('Publish this report to the client view?')) return;
      await o.store.publish(r.id);
      reload();
    });
    var unp = document.getElementById('btn-unpublish');
    if (unp) unp.addEventListener('click', async function () {
      if (!window.confirm('Move this report back to draft? It will be hidden from the client view.')) return;
      await o.store.unpublish(r.id);
      reload();
    });
    var box = document.getElementById('revise-box');
    document.getElementById('btn-revise').addEventListener('click', function () { box.classList.toggle('hidden'); });
    document.getElementById('revise-cancel').addEventListener('click', function () { box.classList.add('hidden'); });
    document.getElementById('revise-save').addEventListener('click', async function () {
      var note = document.getElementById('revise-text').value.trim();
      if (!note) { box.classList.add('hidden'); return; }
      await o.store.addRevisionNote(r.id, note);
      reload();
    });
  }

  function message(title, text) {
    return '<div class="mx-auto max-w-3xl p-8"><p class="text-xs font-semibold uppercase tracking-widest text-slate-500">Tweak Reporting</p>' +
      '<h1 class="mt-2 text-2xl font-extrabold text-slate-900">' + esc(title) + '</h1><p class="mt-2 text-slate-600">' + esc(text) + '</p></div>';
  }

  function mount(o) {
    var app = document.getElementById('app');
    if (!app) { app = document.createElement('div'); app.id = 'app'; document.body.appendChild(app); }
    var id = new URLSearchParams(window.location.search).get('id');

    async function load() {
      if (!id) { app.innerHTML = message('Report not found', 'No report was specified.'); return; }
      var report;
      try { report = await o.store.get(id); }
      catch (err) { app.innerHTML = message('Could not load this report', 'There was a problem reaching the server. Check your connection and reload the page.'); return; }
      if (!report) { app.innerHTML = message('Report not found', 'This report does not exist yet.'); return; }
      var isAdmin = !!o.auth.isAdmin();
      if (!isAdmin && report.status !== 'published') {
        app.innerHTML = message('Report not available', 'This report has not yet been published.');
        return;
      }
      app.innerHTML = page(report, isAdmin, o);
      wire(report, isAdmin, o, load);
    }

    if (o.authEvent) document.addEventListener(o.authEvent, function () { load(); });
    o.auth.ensureAuth();
    if (o.auth.isAuthed && o.auth.isAuthed()) load();
  }

  window.TweakReportView = { mount: mount };
})();
