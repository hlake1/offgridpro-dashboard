# GFS Report — Setup Questions

> Companion doc to the interactive setup page at
> https://hlake1.github.io/offgridpro-dashboard/gfs/setup/
>
> Use this to gather answers from Imogen (Tweak) and Isobel (GFS)
> asynchronously — over email, Docs, or in a workshop call.

---

## Section 1 — Access

We need read-only access to each platform to automate the monthly pull.
For each item, please confirm:

1. **Google Ads** — Do we have a Google Ads account for GFS?
   - Customer ID (10-digit, `XXX-XXX-XXXX`):
   - Confirm you can add `herbielakeai@gmail.com` as a read-only user (or grant Tweak MCC access):

2. **Google Analytics (GA4)**
   - GA4 property ID:
   - Confirm Viewer access for our read-only pull:

3. **Google Search Console**
   - Property (e.g. `sc-domain:globalfreightsolutions.com`):
   - Confirm Restricted or Full access for our pull:

4. **HubSpot**
   - Portal ID:
   - Preferred integration method:
     - [ ] Private App API token (read scopes: contacts, deals, forms, analytics)
     - [ ] Add us as a Marketing user seat
   - Notes:

5. **SEO tooling** (site health score, keyword tracking, backlinks)
   Which is the source of truth?
   - [ ] Semrush
   - [ ] Ahrefs
   - [ ] SE Ranking
   - [ ] Screaming Frog
   - [ ] Other:
   - Account/project name and how we get access:

6. **Social media** — which channels are in scope?
   - [ ] LinkedIn (company page)
   - [ ] Instagram
   - [ ] Facebook
   - [ ] X / Twitter
   - [ ] TikTok
   - [ ] YouTube
   - Do we pull directly (LinkedIn API, Meta Graph) or from a scheduler
     (Sprout, Buffer, Hootsuite)?

---

## Section 2 — Report content

7. **Priority KPIs** — which metrics are Sam / Isobel / leadership most
   focused on each month? Pick 3–5 for the executive summary.
   - [ ] High-value conversions
   - [ ] Main contact form submissions
   - [ ] Website users &amp; sessions
   - [ ] Organic search visibility
   - [ ] SEO ranking keywords
   - [ ] LinkedIn follower growth
   - [ ] LinkedIn impressions
   - [ ] Cost per acquisition (CPA)
   - [ ] Return on ad spend (ROAS)
   - [ ] AI presence (mentions in AI search)
   - Anything else? Business goals we should tie the metrics back to:

8. **Business goals for the next 3–6 months** — what is GFS trying to
   achieve this half-year? (New customer acquisition, retention,
   international expansion, product launch, etc.) The report will call
   out progress against these:
   -
   -
   -

9. **Benchmarks &amp; comparisons** — should each metric compare to:
   - [x] Previous month (default)
   - [x] Year-on-year
   - [ ] Progress against quarterly targets
   - [ ] Industry benchmarks (logistics / eCom)
   - [ ] Named competitor tracking
   - Specific competitors or targets to track:

---

## Section 3 — People &amp; access

10. **Stakeholders at GFS** — who should have a personal access code to
    the dashboard? Name / role / email:
    - Isobel — Marketing Manager —
    - Sam — MD/CEO —
    - _(add more)_

11. **Approval workflow** — should each monthly report be reviewed and
    approved by someone at GFS before it publishes to the dashboard?
    - [ ] GFS reviews &amp; approves each month before publish
    - [ ] Tweak reviews internally, then auto-publishes with GFS notified
    - [ ] Auto-publish, no review — GFS reads when convenient
    - [ ] Other:
    - Specific approver or SLA:

---

## Section 4 — Cadence

12. **Report cadence &amp; live metrics**
    - [x] Monthly deep-dive report (like this June '26 one)
    - [ ] Live daily-refresh metrics dashboard (like OffGrid Pro)
    - [ ] Weekly snapshot email
    - [ ] Ad-hoc reporting on request
    - Preferred publish date (e.g. 1st working day of the month):
    - Delivery method (dashboard link + email, Slack, etc.):

---

## Next steps once we have answers

1. Herbie sets up Maton API connections for Google Ads / GA4 / Search
   Console / HubSpot.
2. GitHub Actions workflow added that pulls GFS data daily on the same
   schedule as OffGrid Pro (`.github/workflows/refresh-data.yml` gains
   a `gfs` step).
3. GFS `live/` dashboard goes online (mirroring `offgridpro/live/`).
4. Team roster updated with per-stakeholder access codes.
5. First automated monthly report (July 2026) published in early
   August.

Any questions? Ping Herbie: `herbielakeai@gmail.com`.
