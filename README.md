# OffGrid Pro Reporting Dashboard

Live performance reporting for **OffGrid Pro Ltd.** — built by Tweak Marketing, powered by the Google Ads API (via Maton) and hosted on GitHub Pages.

**Live:** https://hlake1.github.io/offgridpro-dashboard/

---

## Structure

```
/                          Homepage — lists all monthly reports
/june-2026/                June 2026 report
  ├── index.html           Static dashboard shell
  └── data.json            Live Google Ads data (auto-refreshed)

/scripts/
  └── pull-google-ads.js   Fetches live data from Maton, writes data.json

/.github/workflows/
  └── refresh-data.yml     Daily cron that runs the pull + commits data
```

## Data sources

| Section | Source | Live? |
|---|---|---|
| Google Ads campaigns, keywords, search terms | Google Ads API via Maton | ✅ Live |
| Technical SEO | SEMrush / manual | Manual (for now) |
| LinkedIn / Facebook / Instagram | Manual | Manual (for now) |
| Web analytics (Top pages, users) | Google Analytics — pending client access | Manual (for now) |
| Conversions detail | Google Ads + CRM | Manual (for now) |

Read-only access — the automation never mutates ad data.

## Refreshing data locally

```bash
export MATON_API_KEY="<your key>"
node scripts/pull-google-ads.js 2026-06
```

Writes `june-2026/data.json` and the dashboard picks it up.

## Automated refresh

GitHub Actions runs `refresh-data.yml`:
- **Daily** at 06:00 UTC
- **Manually** via Actions tab (choose any month)

Requires GitHub secret `MATON_API_KEY` set at repo level.

## Security

- `MATON_API_KEY` is stored as a GitHub Actions secret, never committed.
- Maton connection uses OAuth scoped for **read-only** Google Ads access on `herbielakeai@gmail.com`.
- Rule: this project **only reads and pulls data**. No writes, edits, updates, deletes, or budget changes to Google Ads via this integration.
