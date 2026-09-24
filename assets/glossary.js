/*!
 * Tweak Reporting — Terminology glossary ("What is?")
 *
 * One shared set of term definitions used across every client's report.
 * Add a button like:
 *   <button class="tw-glossary-btn" type="button" data-term="CTR">?</button>
 * next to any label, then call window.TweakGlossary.init() after the
 * surrounding HTML exists (safe to call repeatedly — already-wired
 * buttons are skipped).
 */
(function () {
  const TERMS = {
    'Impressions': 'The number of times your ad or page was shown, whether or not anyone clicked it.',
    'Clicks': 'The number of times someone clicked through to your website from an ad.',
    'CTR': 'Click-Through Rate — the percentage of people who saw your ad and clicked it (Clicks ÷ Impressions).',
    'CPC': 'Cost Per Click — the average amount you pay each time someone clicks your ad.',
    'Conversions': 'Completed actions that matter to the business — a form submission, call or purchase, for example.',
    'Spend': 'The total advertising budget used in the period shown.',
    'CPA': 'Cost Per Acquisition — the average amount spent to generate one conversion.',
    'ROAS': 'Return On Ad Spend — the revenue earned for every £1 spent on ads.',
    'CPM': 'Cost Per Mille — the cost for every 1,000 times an ad is shown.',
    'Position': 'Where a page ranks in Google’s search results for a given keyword — 1 is the top result.',
    'Search volume': 'How many times a keyword is searched for, on average, each month.',
    'Organic traffic': 'Visitors who arrive at your site from unpaid search results, not ads.',
    'Bounce rate': 'The percentage of visitors who leave after viewing only one page.',
    'Engagement rate': 'How often people interact — likes, comments, shares — relative to how many saw the post.',
    'Reach': 'The number of unique people who saw a post or ad, each counted once.',
    'Impression share': 'The percentage of times your ad was eligible to show that it actually did show.',
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  let openPop = null;
  function closeOpen() {
    if (openPop) { openPop.remove(); openPop = null; }
  }
  document.addEventListener('click', function () { closeOpen(); });

  function attach(btn) {
    if (btn.dataset.twGlossaryInit) return;
    btn.dataset.twGlossaryInit = '1';
    const term = btn.getAttribute('data-term');
    const def = TERMS[term];
    if (!def) { btn.style.display = 'none'; return; }
    btn.setAttribute('aria-label', 'What is ' + term + '?');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openPop && openPop._term === term) { closeOpen(); return; }
      closeOpen();
      const el = document.createElement('div');
      el.className = 'tw-glossary-pop';
      el.setAttribute('role', 'tooltip');
      el.innerHTML = '<strong>' + esc(term) + '</strong><p>' + esc(def) + '</p>';
      el._term = term;
      document.body.appendChild(el);
      const r = btn.getBoundingClientRect();
      const top = r.bottom + 6 + window.scrollY;
      const left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - 260));
      el.style.position = 'absolute';
      el.style.top = top + 'px';
      el.style.left = left + 'px';
      openPop = el;
    });
  }

  function init(root) {
    (root || document).querySelectorAll('.tw-glossary-btn').forEach(attach);
  }

  if (!document.getElementById('tw-glossary-style')) {
    const style = document.createElement('style');
    style.id = 'tw-glossary-style';
    style.textContent =
      '.tw-glossary-btn{display:inline-flex;align-items:center;justify-content:center;' +
      'width:15px;height:15px;border-radius:50%;background:#e5e7eb;color:#4b5563;' +
      'font-size:10px;font-weight:700;line-height:1;border:none;cursor:pointer;' +
      'margin-left:5px;vertical-align:middle;padding:0;}' +
      '.tw-glossary-btn:hover{background:#d1d5db;}' +
      '.tw-glossary-pop{z-index:100000;max-width:250px;background:#111827;color:#f9fafb;' +
      'padding:0.6rem 0.75rem;border-radius:6px;font-size:0.78rem;line-height:1.4;' +
      'box-shadow:0 8px 20px rgba(0,0,0,0.18);font-family:"Montserrat",Helvetica,Arial,sans-serif;}' +
      '.tw-glossary-pop strong{display:block;margin-bottom:0.2rem;font-size:0.78rem;}' +
      '.tw-glossary-pop p{margin:0;color:#e5e7eb;}';
    document.head.appendChild(style);
  }

  window.TweakGlossary = { init: init, TERMS: TERMS };
})();
