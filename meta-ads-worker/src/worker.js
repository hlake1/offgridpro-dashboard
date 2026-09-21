/*!
 * Tweak Reporting — Meta (Facebook/Instagram) Ads account connect (Cloudflare Worker)
 *
 * Lets each team member connect their own Meta account once, so future
 * report-building steps can pull Ads Manager performance data (spend,
 * clicks, conversions, keyword/creative performance) automatically instead
 * of someone copying numbers in from Ads Manager by hand.
 *
 * This mirrors google-oauth-worker's shape almost exactly — same routes,
 * same KV pattern — but Meta's token model is genuinely different, and
 * that difference matters for anyone maintaining this:
 *
 *   Google issues a refresh_token that's valid indefinitely until revoked,
 *   so getFreshAccessToken() can always mint a new access token silently.
 *
 *   Meta does NOT have an equivalent for standard user access tokens. The
 *   best available is a "long-lived" token that lasts ~60 days and then
 *   simply expires — there is no refresh grant. When it expires, the
 *   person has to click "Connect" again and go through the consent screen
 *   a second time. getFreshAccessToken() below reflects this: it returns
 *   the stored token if still valid, and throws a clear "reconnect needed"
 *   error if not — it can NOT silently refresh the way the Google version
 *   does. (The permanent-token alternative is a Business Manager System
 *   User token, which is a different, business-level setup rather than a
 *   per-person connect flow — not what this Worker does.)
 *
 * This Worker owns the two things that must never reach the browser:
 *   - the Meta App Secret (needed to trade a one-time code for a token,
 *     and to compute appsecret_proof on Graph API calls)
 *   - each team member's long-lived access token (stored in Workers KV,
 *     never sent back to the client)
 *
 * What this file does NOT do yet: actually call the Marketing API's
 * Insights endpoints. That's the next increment — it'll live in this same
 * Worker as new routes that call getFreshAccessToken() below, so a report
 * page never sees a raw Meta token, only the finished data.
 *
 * Flow:
 *   1. Front end sends someone to  /start?member=<slug>
 *   2. This Worker redirects them to Meta's OAuth consent dialog
 *   3. Meta redirects back to  /callback?code=...&state=...
 *   4. This Worker exchanges the code for a short-lived token, then
 *      exchanges THAT for a long-lived (~60 day) token, and stores it in
 *      KV keyed by the team member's slug, alongside its expiry time
 *   5. Front end can poll  /status?member=<slug>  to show "Connected as
 *      you (expires in N days)" instead of a raw "Connect" button, and to
 *      know when to prompt someone to reconnect
 *
 * NOTE on "member": same convention as google-oauth-worker — there's no
 * real per-person login on this site yet, so "member" is just a slug the
 * person types in themselves (e.g. "daniela"). Swap in the real logged-in
 * user's id once that exists; nothing else here changes.
 *
 * NOTE on API version: GRAPH_API_VERSION below should be checked against
 * https://developers.facebook.com/docs/graph-api/changelog when this is
 * set up — Meta deprecates old versions roughly two years after release.
 */

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const OAUTH_DIALOG_BASE = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;

// ads_read is the read-only Marketing API permission — campaign, ad set,
// ad and Insights (spend, clicks, conversions, etc.) data for whichever ad
// accounts the connecting person already has access to. No write scope is
// requested; this app never creates, edits, or pauses anything.
const SCOPES = ['ads_read', 'public_profile'].join(',');

const NONCE_TTL_SECONDS = 600; // 10 minutes to complete the Meta consent screen

function corsHeaders(origin, allowedOrigin) {
  const headers = { 'Vary': 'Origin' };
  if (origin === allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
  return headers;
}

function jsonResponse(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

function htmlResponse(body, status) {
  return new Response(body, { status: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function isValidMemberSlug(s) {
  return typeof s === 'string' && /^[a-z0-9][a-z0-9._-]{1,63}$/i.test(s);
}

// Meta's Graph API expects appsecret_proof (HMAC-SHA256 of the access
// token, keyed by the App Secret) on server-side calls once "Require App
// Secret" is enabled for the app — and it's good practice even when it
// isn't strictly required. Computed here so the raw App Secret never has
// to leave this function.
async function computeAppSecretProof(env, accessToken) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.META_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(accessToken));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function exchangeCodeForShortLivedToken(env, code) {
  const params = new URLSearchParams({
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri: env.REDIRECT_URI,
    code,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Meta token exchange failed: ${data.error?.message || res.status}`);
  }
  return data; // { access_token, token_type, expires_in } — short-lived, ~1-2 hours
}

// Trades the short-lived token from the callback for a long-lived one
// (~60 days). This is the only "extension" Meta offers for a standard
// user token — see the file header note on why there's no true refresh.
async function exchangeForLongLivedToken(env, shortLivedToken) {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Meta long-lived token exchange failed: ${data.error?.message || res.status}`);
  }
  return data; // { access_token, token_type, expires_in } — long-lived, ~5,184,000s (60 days)
}

async function fetchProfile(env, accessToken) {
  const proof = await computeAppSecretProof(env, accessToken);
  const params = new URLSearchParams({ access_token: accessToken, appsecret_proof: proof, fields: 'id,name' });
  const res = await fetch(`${GRAPH_BASE}/me?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta profile lookup failed: ${data.error?.message || res.status}`);
  return data; // { id, name }
}

// Used by future data-pull routes in this same Worker: hands back a live
// access token for a connected team member. Unlike the Google version,
// this can NOT silently mint a new token once the stored one has expired
// — it throws instead, and the caller should surface a "reconnect" prompt.
async function getFreshAccessToken(env, member) {
  const raw = await env.OAUTH_TOKENS.get(`member:${member}`);
  if (!raw) throw new Error(`No connected Meta account for "${member}"`);
  const record = JSON.parse(raw);
  if (Date.now() >= record.expiresAt) {
    throw new Error(`Meta connection for "${member}" expired on ${new Date(record.expiresAt).toISOString()} — they need to reconnect`);
  }
  return record.accessToken;
}

function buildAuthorizeUrl(env, nonce) {
  const params = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: env.REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    state: nonce,
  });
  return `${OAUTH_DIALOG_BASE}?${params.toString()}`;
}

async function handleStart(url, env) {
  const member = url.searchParams.get('member');
  if (!isValidMemberSlug(member)) {
    return jsonResponse({ error: 'Missing or invalid "member" — expected a short id like "daniela"' }, 400);
  }
  const nonce = crypto.randomUUID();
  await env.OAUTH_TOKENS.put(`nonce:${nonce}`, member, { expirationTtl: NONCE_TTL_SECONDS });
  return Response.redirect(buildAuthorizeUrl(env, nonce), 302);
}

async function handleCallback(url, env) {
  const error = url.searchParams.get('error');
  if (error) {
    const reason = url.searchParams.get('error_reason') || error;
    return htmlResponse(`<p>Meta sign-in was cancelled or failed: ${reason}. You can close this tab and try again.</p>`, 200);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return htmlResponse('<p>Missing code or state on callback. Close this tab and try connecting again.</p>', 400);
  }

  const member = await env.OAUTH_TOKENS.get(`nonce:${state}`);
  if (!member) {
    return htmlResponse('<p>This connection link expired or was already used. Close this tab and click "Connect" again.</p>', 400);
  }
  await env.OAUTH_TOKENS.delete(`nonce:${state}`);

  let longLived, profile;
  try {
    const shortLived = await exchangeCodeForShortLivedToken(env, code);
    longLived = await exchangeForLongLivedToken(env, shortLived.access_token);
    profile = await fetchProfile(env, longLived.access_token);
  } catch (err) {
    return htmlResponse(`<p>Couldn't complete the connection: ${String(err.message || err)}. Close this tab and try again.</p>`, 502);
  }

  const expiresAt = Date.now() + (longLived.expires_in || 0) * 1000;

  await env.OAUTH_TOKENS.put(`member:${member}`, JSON.stringify({
    name: profile.name,
    accessToken: longLived.access_token,
    expiresAt,
    scope: SCOPES,
    connectedAt: new Date().toISOString(),
  }));

  const daysLeft = Math.round((expiresAt - Date.now()) / 86400000);

  return htmlResponse(`
    <!doctype html><meta charset="utf-8">
    <body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;text-align:center;color:#111;">
      <p style="font-size:2rem;margin:0;">✓</p>
      <h1 style="font-size:1.25rem;">Connected as ${profile.name}</h1>
      <p style="color:#555;">This connection lasts about ${daysLeft} days, then you'll need to reconnect.</p>
      <p style="color:#555;">You can close this tab and go back to Tweak Reporting.</p>
    </body>
  `);
}

async function handleStatus(url, env, origin) {
  const member = url.searchParams.get('member');
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
  if (!isValidMemberSlug(member)) {
    return jsonResponse({ error: 'Missing or invalid "member"' }, 400, headers);
  }
  const raw = await env.OAUTH_TOKENS.get(`member:${member}`);
  if (!raw) return jsonResponse({ connected: false }, 200, headers);
  const record = JSON.parse(raw);
  const expired = Date.now() >= record.expiresAt;
  return jsonResponse({
    connected: !expired,
    expired,
    name: record.name,
    connectedAt: record.connectedAt,
    expiresAt: new Date(record.expiresAt).toISOString(),
  }, 200, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env.ALLOWED_ORIGIN) });
    }

    if (!env.META_APP_SECRET) {
      return jsonResponse({ error: 'Worker is missing META_APP_SECRET — run: wrangler secret put META_APP_SECRET' }, 500);
    }

    if (url.pathname === '/start') return handleStart(url, env);
    if (url.pathname === '/callback') return handleCallback(url, env);
    if (url.pathname === '/status') return handleStatus(url, env, origin);

    return jsonResponse({ error: 'Not found' }, 404);
  },
  // Exported for the data-pull routes we'll add next.
  _internal: { getFreshAccessToken },
};
