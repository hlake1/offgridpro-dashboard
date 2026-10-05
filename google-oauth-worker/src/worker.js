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
 * This file also pulls actual Google Ads metrics for clients whose team
 * member has connected their account (see CLIENTS_CONFIG + /metrics below),
 * so a client's Live Metrics page never sees a raw Google token — only the
 * finished numbers. A Cron Trigger (see wrangler.toml [triggers]) refreshes
 * every configured client once a day; /metrics just serves that cached
 * result so the page loads instantly.
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
  if (origin === allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    // Needed for the browser's preflight on JSON POSTs (e.g. saving a client's Google Ads account).
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
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

// ---------------------------------------------------------------------------
// Live Metrics — daily Google Ads pull per client
// ---------------------------------------------------------------------------
// Maps each Tweak Reporting client slug to which connected team member's
// Google account to pull through, and that client's real Google Ads
// Customer ID (10 digits, no dashes). Fill in customerId once you have it —
// until then /metrics reports that client as "not configured yet" instead
// of erroring, and the live page shows a friendly message.
//
// managerCustomerId is only needed if the connected account reaches this
// customer THROUGH a manager (MCC) account rather than being added
// directly to the client's own Google Ads account — set it to that
// manager account's id if Google Ads comes back with a permission error
// that mentions "login-customer-id".
//
// offgridpro is intentionally not listed here — it already has its own
// working Live Metrics page powered by Maton (see /offgridpro/live and
// scripts/pull-google-ads.js at the repo root). Don't add it here too.
const CLIENTS_CONFIG = {
  // Imogen's stored Google login lacks the Google Ads scope ("insufficient authentication scopes"),
  // so GFS pulls through Daniela's login, which can see GFS Deliver via the Tweak UK manager account.
  gfs:          { member: 'daniela' },
  scl:          { member: 'daniela' },
  autowatch:    { member: 'louise' },
  autoid:       { member: 'louise' },
  stjarnagloss: { member: 'daniela' },
  aslotel:      { member: 'daniela' },
};

// The Google Ads Customer ID (and, if needed, the manager/MCC account id
// used to reach it) is looked up here instead of hardcoded above, because
// one connected Google login can see MULTIPLE clients' ad accounts — e.g.
// Daniela connects once, but SCL, Stjärnagloss and Aslotel each need their
// OWN customer id so the daily pull never mixes up whose numbers are
// whose. Set from the admin page's "Live Metrics" panel (POST
// /customer-id), which lists the connected login's accessible accounts
// via /google-ads-accounts so a person picks the right one per client.
async function getClientCustomerConfig(env, slug) {
  const raw = await env.OAUTH_TOKENS.get(`customerid:${slug}`);
  if (!raw) return { customerId: null, managerCustomerId: null };
  return JSON.parse(raw);
}

function isValidCustomerId(s) {
  return typeof s === 'string' && /^\d{6,12}$/.test(s);
}

const GOOGLE_ADS_API_VERSION = 'v24'; // v19 was retired by Google in Feb 2026; v24 is supported until ~May 2027

// Google returns an HTML page (not JSON) when an API version is retired or an
// API isn't enabled; surface that as a readable error instead of a JSON parse failure.
async function readGoogleJson(res, label) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`${label} returned a non-JSON response (HTTP ${res.status}) — the API version may be retired or the API not enabled for this Cloud project`); }
}

async function googleAdsSearch(accessToken, customerId, managerCustomerId, developerToken, query) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  if (developerToken) headers['developer-token'] = developerToken;
  if (managerCustomerId) headers['login-customer-id'] = managerCustomerId;
  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query }) }
  );
  const data = await readGoogleJson(res, 'Google Ads API');
  if (!res.ok) {
    const err = data.error || (Array.isArray(data) && data[0]?.error) || {};
    let msg = err.message || `Google Ads API error (${res.status})`;
    // Google's top-level message is often generic ("invalid argument"); the real reason is in details.
    const detail = (err.details || []).flatMap((d) => d.errors || []).map((e) => `${Object.entries(e.errorCode || {}).map(([k, v]) => `${k}=${v}`).join(',')}: ${e.message || ''}`).filter(Boolean).slice(0, 2).join(' | ');
    if (detail) msg += ` [${detail}]`;
    throw new Error(msg);
  }
  return data.results || [];
}

function round2(n) { return Math.round((n || 0) * 100) / 100; }

// Pulls last-28-days campaign performance for one client and shapes it the
// same way scripts/pull-google-ads.js shapes OffGrid Pro's data.json, so
// both Live Metrics page templates can share the same rendering logic.
async function fetchGoogleAdsMetrics(accessToken, customerId, managerCustomerId, developerToken) {
  // GAQL has no LAST_28_DAYS literal, so use an explicit rolling window.
  const now = new Date();
  const start = new Date(now.getTime() - 28 * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  const [customerRows, campaignRows] = await Promise.all([
    googleAdsSearch(
      accessToken, customerId, managerCustomerId, developerToken,
      'SELECT customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1'
    ),
    googleAdsSearch(
      accessToken, customerId, managerCustomerId, developerToken,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
              metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros,
              metrics.ctr, metrics.average_cpc
       FROM campaign
       WHERE segments.date BETWEEN '${iso(start)}' AND '${iso(now)}'
       ORDER BY metrics.clicks DESC`
    ),
  ]);

  const customer = customerRows[0]?.customer || {};
  const campaigns = campaignRows.map((r) => ({
    id: r.campaign.id,
    name: r.campaign.name,
    status: r.campaign.status,
    channelType: r.campaign.advertisingChannelType,
    impressions: Number(r.metrics.impressions || 0),
    clicks: Number(r.metrics.clicks || 0),
    conversions: Number(r.metrics.conversions || 0),
    cost: round2(Number(r.metrics.costMicros || 0) / 1e6),
    ctr: round2(Number(r.metrics.ctr || 0) * 100),
    cpc: round2(Number(r.metrics.averageCpc || 0) / 1e6),
  }));

  const totals = campaigns.reduce(
    (acc, c) => {
      acc.impressions += c.impressions;
      acc.clicks += c.clicks;
      acc.conversions += c.conversions;
      acc.cost += c.cost;
      return acc;
    },
    { impressions: 0, clicks: 0, conversions: 0, cost: 0 }
  );
  totals.cost = round2(totals.cost);
  totals.ctr = totals.impressions ? round2((totals.clicks / totals.impressions) * 100) : 0;
  totals.cpc = totals.clicks ? round2(totals.cost / totals.clicks) : 0;

  return {
    meta: {
      pulledAt: now.toISOString(),
      source: 'Google Ads API (connected via Tweak Reporting)',
      period: { mode: 'rolling', label: 'Last 28 days', start: iso(start), end: iso(now), days: 28 },
      customer: {
        id: customerId,
        name: customer.descriptiveName || null,
        currency: customer.currencyCode || null,
        timezone: customer.timeZone || null,
      },
      readOnly: true,
    },
    totals,
    campaigns,
  };
}

async function computeMetricsForClient(env, slug) {
  const cfg = CLIENTS_CONFIG[slug];
  if (!cfg) return { configured: false, reason: `Unknown client "${slug}"` };

  const { customerId, managerCustomerId } = await getClientCustomerConfig(env, slug);
  if (!customerId) return { configured: false, reason: 'No Google Ads Customer ID set for this client yet — connect and pick an account in the panel above' };

  const statusRaw = await env.OAUTH_TOKENS.get(`member:${cfg.member}`);
  if (!statusRaw) return { configured: false, reason: `${cfg.member} hasn't connected a Google account yet` };

  const accessToken = await getFreshAccessToken(env, cfg.member);
  const data = await fetchGoogleAdsMetrics(accessToken, customerId, managerCustomerId, env.GOOGLE_ADS_DEVELOPER_TOKEN);
  return { configured: true, data };
}

// Lists the Google Ads accounts visible to a connected member's login, with
// a best-effort descriptive name for each — so the admin page can show
// "OffGrid Pro Ltd (1540152294)" instead of a bare number, making it much
// harder to pick the wrong client's account by mistake. A name lookup that
// fails (e.g. an account only reachable through a manager/MCC login this
// Worker isn't told about) still lists the id, just without a name.
// Maps every enabled client account reachable through a manager (MCC) account
// the login can see: { customerId: { name, manager } }.
async function buildAccountHierarchy(accessToken, ids, developerToken) {
  const hierarchy = {};
  await Promise.all(ids.map(async (mgrId) => {
    try {
      const rows = await googleAdsSearch(accessToken, mgrId, mgrId, developerToken,
        "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.status = 'ENABLED'");
      for (const r of rows) {
        const c = r.customerClient || {};
        if (c.id && !c.manager) hierarchy[String(c.id)] = { name: c.descriptiveName || null, manager: mgrId };
      }
    } catch { /* not a manager, or no access: ignore */ }
  }));
  return hierarchy;
}

async function listGoogleAdsAccountsForMember(env, member) {
  const accessToken = await getFreshAccessToken(env, member);
  const ids = await fetchGoogleAdsAccounts(accessToken, env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const hierarchy = await buildAccountHierarchy(accessToken, ids, env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const accounts = await Promise.all(ids.map(async (id) => {
    try {
      const rows = await googleAdsSearch(accessToken, id, null, env.GOOGLE_ADS_DEVELOPER_TOKEN, 'SELECT customer.descriptive_name FROM customer LIMIT 1');
      return { id, name: rows[0]?.customer?.descriptiveName || hierarchy[id]?.name || null };
    } catch (err) {
      if (hierarchy[id]) return { id, name: hierarchy[id].name, viaManager: hierarchy[id].manager };
      // nameError is for diagnosing why a name couldn't be read; the picker UI ignores it.
      return { id, name: null, nameError: String(err.message || err).slice(0, 300) };
    }
  }));
  // Client accounts that sit under a manager but aren't in the directly-accessible list.
  for (const [id, h] of Object.entries(hierarchy)) {
    if (!ids.includes(id)) accounts.push({ id, name: h.name, viaManager: h.manager });
  }
  return accounts;
}

async function handleGoogleAdsAccounts(url, env, origin) {
  const member = url.searchParams.get('member');
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
  if (!isValidMemberSlug(member)) {
    return jsonResponse({ error: 'Missing or invalid "member"' }, 400, headers);
  }
  try {
    const accounts = await listGoogleAdsAccountsForMember(env, member);
    return jsonResponse({ accounts }, 200, headers);
  } catch (err) {
    return jsonResponse({ error: String(err.message || err), reconnectNeeded: true }, 409, headers);
  }
}

async function handleGetCustomerId(url, env, origin) {
  const slug = url.searchParams.get('client');
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
  if (!slug || !CLIENTS_CONFIG[slug]) {
    return jsonResponse({ error: 'Unknown or missing "client"' }, 400, headers);
  }
  const cfg = await getClientCustomerConfig(env, slug);
  return jsonResponse(cfg, 200, headers);
}

async function handleSetCustomerId(request, env, origin) {
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, headers);
  }
  const { client, customerId, managerCustomerId } = body || {};
  if (!client || !CLIENTS_CONFIG[client]) {
    return jsonResponse({ error: 'Unknown or missing "client"' }, 400, headers);
  }
  if (!isValidCustomerId(customerId)) {
    return jsonResponse({ error: 'customerId must be 6-12 digits, no dashes' }, 400, headers);
  }
  if (managerCustomerId != null && managerCustomerId !== '' && !isValidCustomerId(managerCustomerId)) {
    return jsonResponse({ error: 'managerCustomerId must be 6-12 digits, no dashes' }, 400, headers);
  }
  // If the chosen account sits under a manager (MCC), Google needs that manager's
  // id as login-customer-id. Work it out here so the person picking doesn't have to.
  let resolvedManager = managerCustomerId || null;
  if (!resolvedManager) {
    try {
      const member = CLIENTS_CONFIG[client].member;
      const accessToken = await getFreshAccessToken(env, member);
      const ids = await fetchGoogleAdsAccounts(accessToken, env.GOOGLE_ADS_DEVELOPER_TOKEN);
      const hierarchy = await buildAccountHierarchy(accessToken, ids, env.GOOGLE_ADS_DEVELOPER_TOKEN);
      if (hierarchy[customerId] && hierarchy[customerId].manager !== customerId) resolvedManager = hierarchy[customerId].manager;
    } catch { /* leave null; the daily pull will report a clear error if one is needed */ }
  }
  await env.OAUTH_TOKENS.put(`customerid:${client}`, JSON.stringify({
    customerId,
    managerCustomerId: resolvedManager,
    setAt: new Date().toISOString(),
  }));
  // Invalidate any cached metrics so the very next /metrics call for this
  // client re-pulls with the newly-set account instead of serving a stale
  // "not configured" (or, worse, a previous client's) cached result.
  await env.OAUTH_TOKENS.delete(`metrics:${client}`);
  return jsonResponse({ ok: true }, 200, headers);
}

// Called once a day by the Cron Trigger (see the scheduled() export below).
// Refreshes every configured client and caches each result in KV — a
// broken/unconnected client is logged and skipped, it never blocks the rest.
async function refreshAllClientMetrics(env) {
  const slugs = Object.keys(CLIENTS_CONFIG);
  await Promise.all(slugs.map(async (slug) => {
    try {
      const result = await computeMetricsForClient(env, slug);
      await env.OAUTH_TOKENS.put(`metrics:${slug}`, JSON.stringify({ ...result, cachedAt: new Date().toISOString() }));
    } catch (err) {
      await env.OAUTH_TOKENS.put(`metrics:${slug}`, JSON.stringify({
        configured: false,
        reason: String(err.message || err),
        cachedAt: new Date().toISOString(),
      }));
    }
  }));
}

async function handleMetrics(url, env, origin) {
  const slug = url.searchParams.get('client');
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
  if (!slug || !CLIENTS_CONFIG[slug]) {
    return jsonResponse({ configured: false, reason: 'Unknown or missing "client"' }, 200, headers);
  }
  const cached = await env.OAUTH_TOKENS.get(`metrics:${slug}`);
  if (cached) return jsonResponse(JSON.parse(cached), 200, headers);

  // No cached result yet (e.g. right after connecting, before the next
  // daily cron run) — pull live once and cache it so the next load is instant.
  try {
    const result = await computeMetricsForClient(env, slug);
    const withTimestamp = { ...result, cachedAt: new Date().toISOString() };
    await env.OAUTH_TOKENS.put(`metrics:${slug}`, JSON.stringify(withTimestamp));
    return jsonResponse(withTimestamp, 200, headers);
  } catch (err) {
    return jsonResponse({ configured: false, reason: String(err.message || err) }, 200, headers);
  }
}

async function handleMetricsRefresh(url, env, origin) {
  const slug = url.searchParams.get('client');
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
  if (!slug || !CLIENTS_CONFIG[slug]) {
    return jsonResponse({ configured: false, reason: 'Unknown or missing "client"' }, 400, headers);
  }
  try {
    const result = await computeMetricsForClient(env, slug);
    const withTimestamp = { ...result, cachedAt: new Date().toISOString() };
    await env.OAUTH_TOKENS.put(`metrics:${slug}`, JSON.stringify(withTimestamp));
    return jsonResponse(withTimestamp, 200, headers);
  } catch (err) {
    return jsonResponse({ configured: false, reason: String(err.message || err) }, 502, headers);
  }
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

// As of September 2026 Google Ads API access is tied to the Google Cloud
// project behind the OAuth client (see the project's "Access levels" page
// under APIs & Services > Google Ads API in Cloud Console), not to a
// separately-issued developer token. New projects don't need one at all.
// GOOGLE_ADS_DEVELOPER_TOKEN stays optional here purely as an escape hatch
// in case Google ever asks for one again for this project — if it's unset
// the header is simply left off and the OAuth token does the talking.
async function fetchGoogleAdsAccounts(accessToken, developerToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (developerToken) headers['developer-token'] = developerToken;
  const res = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`, {
    headers,
  });
  const data = await readGoogleJson(res, 'Google Ads API');
  if (!res.ok) {
    const msg = data.error?.message || (Array.isArray(data) && data[0]?.error?.message) || `Google Ads API error (${res.status})`;
    throw new Error(msg);
  }
  // resourceNames look like "customers/1234567890"
  return (data.resourceNames || []).map((rn) => rn.split('/')[1]).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Website traffic — GA4 Data API pull for the report builder's "Website
// traffic" card. Shares the same `analytics.readonly` scope already granted
// above, so no new consent is needed from anyone already connected.
// ---------------------------------------------------------------------------

// Lists every GA4 property the connected login can see, across every GA4
// account it has access to, so the builder can offer a "pick the right
// property" dropdown — the same reasoning as listGoogleAdsAccountsForMember
// above: one Google login can see several clients' properties.
async function listGA4Properties(accessToken) {
  const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Analytics Admin API error (${res.status})`);
  const properties = [];
  for (const acc of data.accountSummaries || []) {
    for (const p of acc.propertySummaries || []) {
      // p.property looks like "properties/123456789" — exactly the resource
      // name the GA4 Data API's runReport expects, so it's passed through
      // unchanged rather than extracting the bare numeric id.
      properties.push({ id: p.property, name: p.displayName, account: acc.displayName });
    }
  }
  return properties;
}

function isValidGA4Property(s) {
  return typeof s === 'string' && /^properties\/\d+$/.test(s);
}

async function runGA4Report(accessToken, propertyId, body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Analytics Data API error (${res.status})`);
  return data;
}

function ga4MetricValue(report, index) {
  const raw = report.rows?.[0]?.metricValues?.[index]?.value;
  return raw == null ? 0 : Number(raw);
}

// Pulls this period's headline totals plus a top-10 pages breakdown for one
// GA4 property, shaped so it drops into the report builder's manual-entry
// fields and top-pages table the same way Meta's /insights response drops
// into the ads fields — one pull, one shape, no per-field wiring needed.
async function fetchGA4Report(accessToken, propertyId, start, end) {
  const dateRanges = [{ startDate: start, endDate: end }];

  const [totalsReport, pagesReport] = await Promise.all([
    runGA4Report(accessToken, propertyId, {
      dateRanges,
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' },
      ],
    }),
    runGA4Report(accessToken, propertyId, {
      dateRanges,
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
  ]);

  const totals = {
    sessions: Math.round(ga4MetricValue(totalsReport, 0)),
    users: Math.round(ga4MetricValue(totalsReport, 1)),
    newUsers: Math.round(ga4MetricValue(totalsReport, 2)),
    pageviews: Math.round(ga4MetricValue(totalsReport, 3)),
    avgSessionDuration: Math.round(ga4MetricValue(totalsReport, 4) * 10) / 10,
    engagementRate: Math.round(ga4MetricValue(totalsReport, 5) * 10000) / 100, // fraction -> %
  };

  const topPages = (pagesReport.rows || []).map((r) => ({
    path: r.dimensionValues?.[0]?.value || '/',
    sessions: Math.round(Number(r.metricValues?.[0]?.value || 0)),
    pageviews: Math.round(Number(r.metricValues?.[1]?.value || 0)),
  }));

  return {
    meta: {
      source: 'Google Analytics 4 (GA4 Data API)',
      pulledAt: new Date().toISOString(),
      property: propertyId,
      period: { start, end },
    },
    totals,
    topPages,
  };
}

async function handleGA4Properties(url, env, origin) {
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
  try {
    const properties = await listGA4Properties(accessToken);
    return jsonResponse({ properties }, 200, headers);
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) }, 502, headers);
  }
}

async function handleGA4Report(url, env, origin) {
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
  const member = url.searchParams.get('member');
  const property = url.searchParams.get('property');
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  if (!isValidMemberSlug(member)) {
    return jsonResponse({ error: 'Missing or invalid "member"' }, 400, headers);
  }
  if (!isValidGA4Property(property)) {
    return jsonResponse({ error: 'Missing or invalid "property" — expected e.g. properties/123456789 (from /ga4-properties)' }, 400, headers);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) {
    return jsonResponse({ error: 'Missing or invalid "start"/"end" — expected YYYY-MM-DD' }, 400, headers);
  }

  let accessToken;
  try {
    accessToken = await getFreshAccessToken(env, member);
  } catch (err) {
    return jsonResponse({ error: String(err.message || err), reconnectNeeded: true }, 409, headers);
  }

  try {
    const result = await fetchGA4Report(accessToken, property, start, end);
    return jsonResponse(result, 200, headers);
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) }, 502, headers);
  }
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
    if (url.pathname === '/metrics') return handleMetrics(url, env, origin);
    if (url.pathname === '/metrics/refresh') return handleMetricsRefresh(url, env, origin);
    if (url.pathname === '/google-ads-accounts') return handleGoogleAdsAccounts(url, env, origin);
    if (url.pathname === '/ga4-properties') return handleGA4Properties(url, env, origin);
    if (url.pathname === '/ga4-report') return handleGA4Report(url, env, origin);
    if (url.pathname === '/customer-id' && request.method === 'GET') return handleGetCustomerId(url, env, origin);
    if (url.pathname === '/customer-id' && request.method === 'POST') return handleSetCustomerId(request, env, origin);

    return jsonResponse({ error: 'Not found' }, 404);
  },

  // Cloudflare Cron Trigger (see wrangler.toml [triggers]) — refreshes every
  // configured client's Live Metrics once a day so /metrics always serves
  // an instant cached result instead of calling Google Ads on every page load.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshAllClientMetrics(env));
  },

  _internal: { getFreshAccessToken, computeMetricsForClient, refreshAllClientMetrics },
};
