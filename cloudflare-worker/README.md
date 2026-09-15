# Tweak Report AI — Cloudflare Worker

Proxies the "Generate draft report" button (SCL / Autowatch / AUTOID admin
builders) to the Anthropic API. Holds the API key server-side so it never
sits in the browser's JavaScript. See `src/worker.js` for what it actually
does — the short version: it rewrites the account manager's rough notes
into client-ready copy and writes a few data-grounded insight bullets from
the real campaign numbers. It never invents figures; the numbers shown in
the report are still computed locally in the browser, same as before.

## One-time setup

You'll need a (free) Cloudflare account and an Anthropic API key — you've
already created both (key name: `tweak-report`).

1. **Install Wrangler** (Cloudflare's CLI), if you don't have it:
   ```bash
   npm install -g wrangler
   ```

2. **Log in** (opens a browser window to authorize):
   ```bash
   cd cloudflare-worker
   wrangler login
   ```

3. **Store the Anthropic key as a secret** — this prompts you to paste it
   directly into the terminal, so it never touches this repo, chat, or
   shell history:
   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   ```
   Paste the `tweak-report` key when prompted, press enter.

4. **Deploy:**
   ```bash
   wrangler deploy
   ```
   This prints a URL that looks like:
   `https://tweak-report-ai.<your-subdomain>.workers.dev`

5. **Wire it into the site.** Copy that URL and send it to me (or paste it
   into `AI_WORKER_URL` at the top of `scripts/build-client-profiles.js`
   yourself) — the builder pages need it baked in so they know where to
   call. After it's set, re-run `node scripts/build-all.js` from the repo
   root and commit the regenerated `admin/builder.html` / `admin/view.html`
   files for SCL, Autowatch and AUTOID.

## Recommended safety nets (do these once, in the Cloudflare / Anthropic
dashboards — not code changes)

This site has no real user accounts, so the Worker can only lean on an
Origin check (already built in — it rejects any request whose `Origin`
header isn't `https://hlake1.github.io`). That stops casual/browser-based
abuse but not a determined script spoofing headers directly against the
Worker's public URL. Two cheap backstops close that gap:

- **Set a monthly spend cap on the Anthropic API key** (console.anthropic.com
  → the `tweak-report` key → usage limits). This is the real safety net —
  whatever else happens, your bill can't exceed this number.
- **Add a Cloudflare Rate Limiting Rule** on the Worker's route (dashboard
  → your zone → Security → WAF → Rate limiting rules) — e.g. 20 requests
  per hour per IP is far more than this admin tool will ever need
  legitimately.

Both take under a minute and need no further changes here.

## Redeploying after a prompt/code change

```bash
cd cloudflare-worker
wrangler deploy
```

The secret persists across deploys — you only run `wrangler secret put`
again if you rotate the key.

## Local testing (optional)

```bash
wrangler dev
```
Runs the Worker locally. You'd need to temporarily point a local copy of
`builder.html` at `http://localhost:8787` and loosen `ALLOWED_ORIGIN`
(or just test with `curl`) since your real browser session's Origin will
be `https://hlake1.github.io`, not localhost.
