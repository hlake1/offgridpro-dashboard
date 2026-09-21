# Tweak Meta Ads Connect — Cloudflare Worker

Lets each Tweak team member connect their own Meta (Facebook/Instagram)
account once, so future report-building steps can pull Ads Manager
performance data (spend, clicks, conversions, creative performance)
automatically instead of someone copying it in from Ads Manager by hand.

This mirrors `google-oauth-worker` in shape — see `src/worker.js` for the
full explanation of how it works. The one thing to understand before
setting this up: **Meta's token doesn't last forever.** Google's refresh
token is good until revoked; Meta's best option for a per-person connect
flow is a "long-lived" token that expires after about 60 days, at which
point that person has to click "Connect" again. There's no way around
that without switching to a different, business-level setup (a Business
Manager System User token) — see "Why tokens expire" below if that
trade-off matters for how this gets used.

This Worker only handles the "connect your account" step, same as the
Google one. Pulling actual report data (Ads Manager Insights) is the next
piece to build — it'll be added as new routes in this same Worker, reusing
`getFreshAccessToken()` already here.

## One-time setup

### 1. Create the Meta App

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps/) and log in with the Facebook account tied to Tweak's Business Manager (not a personal account you don't want linked to this).
2. **Create App** → choose the **Business** app type → give it a name (e.g. "Tweak Reporting").
3. In **App Settings → Basic**, note the **App ID** and **App Secret** — you'll need both below. Also set:
   - **App Domains**: `tweakreporting.com`
   - **Privacy Policy URL**: `https://tweakreporting.com/privacy.html`
   - **Terms of Service URL**: `https://tweakreporting.com/terms.html`
4. Add two products to the app (left sidebar → **Add Product**):
   - **Facebook Login** — handles the OAuth consent screen itself.
   - **Marketing API** — this is what makes `ads_read` a requestable permission at all.
5. In **Facebook Login → Settings**, set **Valid OAuth Redirect URIs** to the Worker's callback URL (see step 4 below for the exact value once you know your `workers.dev` subdomain).

### 2. Link the app to Tweak's Business Manager and verify the business

Under **App Settings → Advanced** (or the Business settings prompt Meta shows you), associate the app with Tweak's Business Manager. Meta will very likely require **Business Verification** — submitting business documents and/or a phone/domain check — before it grants **Advanced Access** to `ads_read` for ad accounts outside Tweak's own Business Manager (i.e. clients' ad accounts). This can take longer than the app review itself, so start it early. Do this in **Business Settings → Security Centre → Start Verification**.

### 3. Install Wrangler and log in (skip if already done for the Google worker)

```bash
npm install -g wrangler
cd meta-ads-worker
wrangler login
```

### 4. Create the KV namespace

```bash
npx wrangler kv namespace create OAUTH_TOKENS
```

This prints an `id`. Paste it into `wrangler.toml`, replacing
`REPLACE_WITH_KV_NAMESPACE_ID`.

### 5. Fill in the App ID and deploy once to learn your subdomain

Paste the **App ID** from step 1 into `wrangler.toml`, replacing
`REPLACE_WITH_META_APP_ID`. Then:

```bash
wrangler deploy
```

This prints a URL like `https://tweak-meta-ads.<your-subdomain>.workers.dev`.
Update `REDIRECT_URI` in `wrangler.toml` to match that exactly (it defaults
to the `herbielakeai` subdomain — change it if yours differs), and update
the **Valid OAuth Redirect URIs** field in the Facebook Login product
settings (step 1.5 above) to the same value, appending `/callback`. The two
must match exactly or Meta will reject the flow with a redirect URI
mismatch.

### 6. Store the App Secret

```bash
wrangler secret put META_APP_SECRET
```

Paste the App Secret from step 1 when prompted — this keeps it out of the
repo, chat, and shell history, same as the Google worker's client secret.

### 7. Redeploy with everything filled in

```bash
wrangler deploy
```

### 8. Request Advanced Access for `ads_read`

While the app is in Development mode, `ads_read` already works — but only
for ad accounts that belong to Tweak's own Business Manager, or that have
explicitly added this app/Tweak's Business Manager as a tester. To read
data from **client-owned** ad accounts, the app needs **Advanced Access**,
which means going through **App Review**:

1. **App Review → Permissions and Features**, find `ads_read`, click **Request Advanced Access**.
2. Meta will ask for a short written justification (why the app needs this data) and a **screencast** showing the actual OAuth flow and where the data ends up being used — same idea as the Google verification video, and the practice from that one carries over directly.
3. Submit, then wait — this is a manual Google-review-style process on Meta's side and can take anywhere from a few days to a couple of weeks.

Until Advanced Access is granted, this flow will still work fine for
testing with Tweak's own ad accounts or accounts explicitly added as
testers in the app's Business Manager roles.

## Trying it

Once deployed, visiting this in a browser should send you through Meta's
consent screen, then land on a confirmation page:

```
https://tweak-meta-ads.herbielakeai.workers.dev/start?member=daniela
```

("daniela" is a placeholder — same convention as the Google worker: no
real per-person login on the site yet, so this is just a name someone
types in themselves.)

Then check it stuck, from any page on `https://tweakreporting.com`:

```js
fetch('https://tweak-meta-ads.herbielakeai.workers.dev/status?member=daniela')
  .then(r => r.json()).then(console.log);
// { connected: true, name: "Daniela ...", connectedAt: "...", expiresAt: "..." }
```

`expiresAt` is worth surfacing in the UI once this is wired into the
front end — it's the one meaningfully different thing about this flow
compared to the Google one (see "Why tokens expire" below).

## Why tokens expire (and what to do eventually)

Meta doesn't offer a refresh-token grant for standard user access tokens.
The "long-lived" token this Worker stores is the best available for a
one-click-per-person flow, and it's good for roughly 60 days before the
person needs to reconnect. `status` reports `expired: true` once that
happens so the front end can prompt a reconnect rather than silently
failing.

If reconnecting every ~60 days per person becomes annoying, the
alternative is a **Business Manager System User** token: a one-time setup
at the business level (not per-person) that doesn't expire, covering
whichever client ad accounts have granted Tweak's Business Manager partner
access. That's a different flow from this Worker, not an upgrade to it —
worth a separate conversation if/when the 60-day reconnect becomes a real
pain point.

## Redeploying after a change

```bash
cd meta-ads-worker
wrangler deploy
```

The KV namespace and secret persist across deploys.

## Local testing (optional)

```bash
wrangler dev
```

Runs the Worker locally. You'd need to temporarily add a redirect URI
pointing at your local tunnel in the Facebook Login product settings,
since Meta (unlike a quick curl test) needs a real reachable HTTPS URL to
redirect back to.
