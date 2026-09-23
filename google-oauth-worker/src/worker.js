/*!
 * Tweak Reporting — Google account connect (Cloudflare Worker)
 *
 * Lets each team member connect their own Google account once, so future
 * report-building steps can pull GA4 / Search Console / Google Ads data
 * automatically instead of someone copying numbers in by hand.
 *
 * This Worker owns the two things that must never reach the browser:
 *   - the OAuth Client Secret (needed to trade a one-time code for tokens)
 *   - each team member's long-lived refresh token (stored in Workers KV,
 *     never sent back to the client)
 *
 * What this file does NOT do yet: actually call the GA4 / Search Console /
 * Google Ads APIs. That's the next increment — it'll live in this same
 * Worker as new routes that call getFreshAccessToken() below, so a report
 * page never sees a raw Google token, only the finished data.
 *
 * Flow:
 *   1. Front end sends someone to  /start?member=<slug>
 *   2. This Worker redirects them to Google's consent screen
 *   3. Google redirects back to  /callback?code=...&state=...
 *   4. This Worker exchanges the code for tokens and stores the refresh
 *      token in KV, keyed by the team member's slug
 *   5. Front end can poll  /status?member=<slug>  to show "Connected as
 *      you@tweak..." instead of a raw "Connect" button
 *
 * NOTE on "member": there's no real per-person login on this site yet
 * (the admin builder still uses one shared password). Until that exists,
 * "member" is just a slug the person types in themselves (e.g. "jeremy").
 * Once real per-person auth exists, swap that typed slug for the logged-in
 * user's own id — nothing else here needs to change.
 */

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/adwords',
].join(' ');

const NONCE_TTL_SECONDS = 600; // 10 minutes to complete the Google consent screen

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

// Decodes (does NOT cryptographically verify) the id_token JWT to read the
// email address for a friendly "Connected as ___" display. Never used for
// access-control decisions — only display. Real verification would check
// the signature against Google's published JWKS.
function decodeEmailFromIdToken(idToken) {
  try {
    const payload = idToken.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json);
    return claims.email || null;
  } catch {
    return null;
  }
}

async function exchangeCodeForTokens(env, code) {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${data.error || res.status} ${data.error_description || ''}`.trim());
  }
  return data; // { access_token, refresh_token?, expires_in, id_token, scope, token_type }
}

async function refreshAccessToken(env, refreshToken) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${data.error || res.status} ${data.error_description || ''}`.trim());
  }
  return data; // { access_token, expires_in, scope, token_type } — no refresh_token on refresh calls
}

// Used by future data-pull routes in this same Worker: hands back a live
// access token for a connected team member, refreshing it first if needed.
// The raw token never leaves this Worker's process.
async function getFreshAccessToken(env, member) {
  const raw = await env.OAUTH_TOKENS.get(`member:${member}`);
  if (!raw) throw new Error(`No connected Google account for "${member}"`);
  const record = JSON.parse(raw);
  const { access_token } = await refreshAccessToken(env, record.refreshToken);
  return access_token;
}

function buildAuthorizeUrl(env, nonce) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: nonce,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function handleStart(url, env) {
  const member = url.searchParams.get('member');
  if (!isValidMemberSlug(member)) {
    return jsonResponse({ error: 'Missing or invalid "member" — expected a short id like "jeremy"' }, 400);
  }
  const nonce = crypto.randomUUID();
  await env.OAUTH_TOKENS.put(`nonce:${nonce}`, member, { expirationTtl: NONCE_TTL_SECONDS });
  return Response.redirect(buildAuthorizeUrl(env, nonce), 302);
}

async function handleCallback(url, env) {
  const error = url.searchParams.get('error');
  if (error) {
    return htmlResponse(`<p>Google sign-in was cancelled or failed: ${error}. You can close this tab and try again.</p>`, 200);
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

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(env, code);
  } catch (err) {
    return htmlResponse(`<p>Couldn't complete the connection: ${String(err.message || err)}. Close this tab and try again.</p>`, 502);
  }

  const email = decodeEmailFromIdToken(tokens.id_token) || member;

  // Google only returns a refresh_token on the FIRST consent for a given
  // account (or when prompt=consent forces re-issue, which /start always
  // sets — so this should normally be present). If it's ever missing and
  // we don't already have one stored, the person needs to revoke Tweak
  // Reporting's access at myaccount.google.com/permissions and reconnect,
  // since there's nothing usable to store.
  let refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    const existingRaw = await env.OAUTH_TOKENS.get(`member:${member}`);
    if (existingRaw) refreshToken = JSON.parse(existingRaw).refreshToken;
  }
  if (!refreshToken) {
    return htmlResponse(
      `<p>Google didn't issue a refresh token this time. Visit <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>, remove "Tweak Reporting", then try connecting again.</p>`,
      502
    );
  }

  await env.OAUTH_TOKENS.put(`member:${member}`, JSON.stringify({
    email,
    refreshToken,
    scope: tokens.scope,
    connectedAt: new Date().toISOString(),
  }));

  return htmlResponse(`
    <!doctype html><meta charset="utf-8">
    <body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;text-align:center;color:#111;">
      <p style="font-size:2rem;margin:0;">✓</p>
      <h1 style="font-size:1.25rem;">Connected as ${email}</h1>
      <p style="color:#555;">You can close this tab and go back to Tweak Reporting.</p>
    </body>
  `);
}

// Used by the /preview route: a couple of small, real, read-only calls
// that exercise each granted scope, so there's something genuine to show
// happening after "Connect" — both for the Google verification demo video
// and for anyone sanity-checking a connection actually works.
async function fetchAnalyticsAccounts(accessToken) {
  const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Analytics Admin API error (${res.status})`);
  }
  const accounts = (data.accountSummaries || []).map((a) => ({
    account: a.displayName,
    properties: (a.propertySummaries || []).map((p) => p.displayName),
  }));
  return accounts;
}

async function fetchGoogleAdsAccounts(accessToken, developerToken) {
  if (!developerToken) {
    throw new Error('Google Ads developer token not configured on this Worker yet (set GOOGLE_ADS_DEVELOPER_TOKEN)');
  }
  const res = await fetch('https://googleads.googleapis.com/v19/customers:listAccessibleCustomers', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message || (Array.isArray(data) && data[0]?.error?.message) || `Google Ads API error (${res.status})`;
    throw new Error(msg);
  }
  // resourceNames look like "customers/1234567890"
  return (data.resourceNames || []).map((rn) => rn.split('/')[1]).filter(Boolean);
}

async function fetchSearchConsoleSites(accessToken) {
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Search Console API error (${res.status})`);
  }
  return (data.siteEntry || []).map((s) => ({ url: s.siteUrl, permission: s.permissionLevel }));
}

async function handlePreview(url, env, origin) {
  const member = url.searchParams.get('member');
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
  if (!isValidMemberSlug(member)) {
    return jsonResponse({ error: 'Missing or invalid "member"' }, 400, headers);
  }

  let accessToken;
  try {
    accessToken = await getFreshAccessToken(env, member);
  } catch (err) {
    return jsonResponse({ error: String(err.message || err), reconnectNeeded: true }, 409, headers);
  }

  const [analytics, searchConsole, ads] = await Promise.all([
    fetchAnalyticsAccounts(accessToken).then(
      (accounts) => ({ ok: true, accounts }),
      (err) => ({ ok: false, error: String(err.message || err) })
    ),
    fetchSearchConsoleSites(accessToken).then(
      (sites) => ({ ok: true, sites }),
      (err) => ({ ok: false, error: String(err.message || err) })
    ),
    fetchGoogleAdsAccounts(accessToken, env.GOOGLE_ADS_DEVELOPER_TOKEN).then(
      (customerIds) => ({ ok: true, customerIds }),
      (err) => ({ ok: false, error: String(err.message || err) })
    ),
  ]);

  return jsonResponse({ analytics, searchConsole, ads }, 200, headers);
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
  return jsonResponse({ connected: true, email: record.email, connectedAt: record.connectedAt }, 200, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env.ALLOWED_ORIGIN) });
    }

    if (!env.GOOGLE_CLIENT_SECRET) {
      return jsonResponse({ error: 'Worker is missing GOOGLE_CLIENT_SECRET — run: wrangler secret put GOOGLE_CLIENT_SECRET' }, 500);
    }

    if (url.pathname === '/start') return handleStart(url, env);
    if (url.pathname === '/callback') return handleCallback(url, env);
    if (url.pathname === '/status') return handleStatus(url, env, origin);
    if (url.pathname === '/preview') return handlePreview(url, env, origin);

    return jsonResponse({ error: 'Not found' }, 404);
  },
  // Exported for the data-pull routes we'll add next.
  _internal: { getFreshAccessToken },
};
