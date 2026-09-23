# Tweak Google Account Connect — Cloudflare Worker

Lets each Tweak team member connect their own Google account once, so future
report-building steps can pull GA4 / Search Console / Google Ads data
automatically instead of typing numbers in by hand. See `src/worker.js` for
the full explanation of how it works — the short version: it holds the
OAuth Client Secret and every team member's refresh token server-side, and
never sends either of those back to the browser.

This Worker only handles the "connect your account" step. Pulling actual
report data (GA4/Search Console/Ads) is the next piece to build — it'll be
added as new routes in this same Worker, reusing the tokens already stored
here.

## One-time setup

You've already created the Google Cloud project ("Tweak Reporting"), added
the `analytics.readonly` / `webmasters.readonly` / `adwords` scopes on the
OAuth consent screen, and created a Web application OAuth client with:
- Authorized JavaScript origin: `https://hlake1.github.io`
- Authorized redirect URI: `https://tweak-google-oauth.herbielakeai.workers.dev/callback`

**Getting real account managers connected before Google's verification is
approved:** keep the OAuth consent screen's publishing status set to
**Testing** (Audience tab in Cloud Console) and add each account manager's
Google email under "Test users" there. Test users can grant every scope
above — including the restricted `adwords` one — with zero Google review,
they just click through the "unverified app" warning the same way you do
as the project owner. The only trade-off: a test user's connection expires
after 7 days and needs reconnecting. Once full verification is approved,
flip the consent screen to "In production" and that 7-day limit goes away
for everyone.

**Google Ads specifically also needs a developer token** — see
"Pulling report data" below.

1. **Create the KV namespace** that stores each team member's connection:
   ```bash
   cd google-oauth-worker
   npx wrangler kv namespace create OAUTH_TOKENS
   ```
   This prints an `id`. Paste it into `wrangler.toml`, replacing
   `REPLACE_WITH_KV_NAMESPACE_ID`.

2. **Store the Google Client Secret** — this prompts you to paste it
   directly into the terminal, so it never touches this repo, chat, or
   shell history:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   Paste the Client Secret from the Google Cloud console when prompted.

3. **Deploy:**
   ```bash
   npx wrangler deploy
   ```
   This should confirm the URL `https://tweak-google-oauth.herbielakeai.workers.dev`
   — if your workers.dev subdomain isn't `herbielakeai`, update `REDIRECT_URI`
   in `wrangler.toml` *and* the Authorized redirect URI in Google Cloud
   console to match exactly before deploying, since Google rejects any
   mismatch.

## Trying it

Once deployed, visiting this in a browser should send you through Google's
consent screen (you'll see the "unverified app" warning we discussed —
click Advanced → "Go to Tweak Reporting (unsafe)"), then land on a
confirmation page:

```
https://tweak-google-oauth.herbielakeai.workers.dev/start?member=jeremy
```

("jeremy" is a placeholder — there's no real per-person login on the site
yet, so for now this is just a name someone types in themselves. Swap in
the real logged-in user's id once that exists; nothing else here changes.)

Then check it stuck, from any page on `https://hlake1.github.io`:

```js
fetch('https://tweak-google-oauth.herbielakeai.workers.dev/status?member=jeremy')
  .then(r => r.json()).then(console.log);
// { connected: true, email: "jeremy@...", connectedAt: "..." }
```

## Pulling report data

`GET /preview?member=<slug>` returns a small, real, read-only slice of
data via each granted scope — used both to sanity-check a connection and
to give Google's verification demo video something genuine to show
happening after "Connect" (not just the consent screen):

```json
{
  "analytics": { "ok": true, "accounts": [{ "account": "...", "properties": ["..."] }] },
  "searchConsole": { "ok": true, "sites": [{ "url": "...", "permission": "..." }] },
  "ads": { "ok": true, "customerIds": ["1234567890"] }
}
```

Any of the three can come back `{ "ok": false, "error": "..." }` instead —
e.g. if an API isn't enabled yet on the Cloud project, or (for `ads`)
`GOOGLE_ADS_DEVELOPER_TOKEN` isn't set. 409 + `reconnectNeeded: true` means
the member's connection expired (the 7-day Testing-mode limit, most likely)
and they need to click "Connect" again.

**Google Ads needs one more secret** — a developer token from
`ads.google.com/aw/apicenter` (Google Ads' own approval, separate from
OAuth verification; see the main project notes on the new, faster
Cloud-Console-based Basic Access process). Once you have one:
```bash
npx wrangler secret put GOOGLE_ADS_DEVELOPER_TOKEN
```
Until that's set, the `ads` field in `/preview` just reports it's missing
— Analytics and Search Console work independently of it.

## Redeploying after a change

```bash
cd google-oauth-worker
npx wrangler deploy
```
The KV namespace and secret persist across deploys.

## Tests

```bash
node --experimental-vm-modules /tmp/qa/oauth_worker_test.mjs
```
(or wherever you keep the test file — it only imports `src/worker.js` and
mocks Google's token endpoint and Workers KV, no live network calls.)
