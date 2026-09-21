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
 * This Worker also exposes the actual data-pull routes report-building
 * pages call:
 *   GET /accounts?member=<slug>
 *     Lists the ad accounts that member's connected Meta login can see, so
 *     a builder page can let the account manager pick which one is "this
 *     client" (once, then remembered client-side) instead of needing to
 *     know the raw act_XXXXXXXXX id.
 *   GET /insights?member=<slug>&account=<act_id>&start=YYYY-MM-DD&end=YYYY-MM-DD
 *     Pulls per-campaign Insights (impressions, clicks, spend, conversions)
 *     for that ad account and date range, shaped the same way
 *     scripts/pull-google-ads.js shapes Google's data ({ totals, campaigns }),
 *     so it drops straight into the existing report-builder code
 *     (loadManualData / generateSummary) with no other changes needed.
 * A report page never sees a raw Meta token — only these finished shapes.
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

const GRAPH_API_VERSION = 'v26.0';
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

// ---------------------------------------------------------------------
// Data-pull routes (/accounts, /insights) — the actual report-building step.
// ---------------------------------------------------------------------

async function fetchAdAccounts(env, accessToken) {
  const proof = await computeAppSecretProof(env, accessToken);
  const params = new URLSearchParams({
    access_token: accessToken,
    appsecret_proof: proof,
    fields: 'id,account_id,name,account_status,currency,business_name',
    limit: '200',
  });
  const res = await fetch(`${GRAPH_BASE}/me/adaccounts?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta ad accounts lookup failed: ${data.error?.message || res.status}`);
  return data.data || [];
}

async function handleAccounts(url, env, origin) {
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
  const member = url.searchParams.get('member');
  if (!isValidMemberSlug(member)) {
    return jsonResponse({ error: 'Missing or invalid "member"' }, 400, headers);
  }

  let accessToken;
  try {
    accessToken = await getFreshAccessToken(env, member);
  } catch (err) {
    // Distinct status so the front end knows to show "reconnect" rather
    // than a generic error — see NOTE on Meta's token model up top.
    return jsonResponse({ error: String(err.message || err), reconnectNeeded: true }, 409, headers);
  }

  try {
    const accounts = await fetchAdAccounts(env, accessToken);
    return jsonResponse({
      accounts: accounts.map((a) => ({
        id: a.id, // "act_123456789" — this is what /insights expects as `account`
        accountId: a.account_id,
        name: a.name,
        businessName: a.business_name || null,
        currency: a.currency,
        status: a.account_status,
      })),
    }, 200, headers);
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) }, 502, headers);
  }
}

// Insights doesn't carry campaign status, so it's fetched separately from
// the Campaign node and merged in below.
async function fetchCampaignStatuses(env, accessToken, accountId) {
  const proof = await computeAppSecretProof(env, accessToken);
  const params = new URLSearchParams({
    access_token: accessToken,
    appsecret_proof: proof,
    fields: 'id,name,effective_status',
    limit: '300',
  });
  const res = await fetch(`${GRAPH_BASE}/${accountId}/campaigns?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta campaigns lookup failed: ${data.error?.message || res.status}`);
  const byId = {};
  (data.data || []).forEach((c) => { byId[c.id] = c; });
  return byId;
}

async function fetchInsights(env, accessToken, accountId, since, until) {
  const proof = await computeAppSecretProof(env, accessToken);
  const params = new URLSearchParams({
    access_token: accessToken,
    appsecret_proof: proof,
    level: 'campaign',
    fields: 'campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,actions',
    time_range: JSON.stringify({ since, until }),
    limit: '300',
  });
  const res = await fetch(`${GRAPH_BASE}/${accountId}/insights?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta insights lookup failed: ${data.error?.message || res.status}`);
  return data.data || [];
}

function normalizeStatus(effectiveStatus) {
  // Mapped onto the same ENABLED/PAUSED/REMOVED vocabulary the report
  // builder's manual-entry UI already uses for Google campaigns, so the
  // "top ENABLED campaign" logic in reports-store.js works unchanged.
  if (effectiveStatus === 'ACTIVE') return 'ENABLED';
  if (effectiveStatus === 'PAUSED') return 'PAUSED';
  return 'REMOVED'; // ARCHIVED, DELETED, PENDING_REVIEW, WITH_ISSUES, etc.
}

// Meta reports conversions as a bag of { action_type, value } pairs rather
// than one "conversions" number, because a single ad account can have many
// different conversion events (leads, purchases, sign-ups, ...). This sums
// the ones that generally represent an actual conversion rather than a
// passthrough engagement metric (e.g. it excludes plain link clicks/video
// views). If a client's real conversion event isn't caught by this list,
// this is the line to extend.
const CONVERSION_ACTION_HINTS = [
  'lead', 'purchase', 'complete_registration', 'submit_application',
  'schedule', 'contact', 'onsite_conversion', 'omni_purchase', 'omni_lead',
];

function sumConversions(actions) {
  if (!Array.isArray(actions)) return 0;
  return actions
    .filter((a) => CONVERSION_ACTION_HINTS.some((hint) => (a.action_type || '').includes(hint)))
    .reduce((sum, a) => sum + Number(a.value || 0), 0);
}

async function handleInsights(url, env, origin) {
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
  const member = url.searchParams.get('member');
  const account = url.searchParams.get('account'); // e.g. "act_123456789"
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  if (!isValidMemberSlug(member)) {
    return jsonResponse({ error: 'Missing or invalid "member"' }, 400, headers);
  }
  if (!account || !/^act_\d+$/.test(account)) {
    return jsonResponse({ error: 'Missing or invalid "account" — expected e.g. act_123456789 (from /accounts)' }, 400, headers);
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
    const [insightRows, statusById] = await Promise.all([
      fetchInsights(env, accessToken, account, start, end),
      fetchCampaignStatuses(env, accessToken, account),
    ]);

    const campaigns = insightRows.map((r) => {
      const campaignMeta = statusById[r.campaign_id] || {};
      const impressions = Number(r.impressions || 0);
      const clicks = Number(r.clicks || 0);
      const cost = Math.round(Number(r.spend || 0) * 100) / 100;
      return {
        id: r.campaign_id,
        name: r.campaign_name || campaignMeta.name || 'Untitled campaign',
        status: normalizeStatus(campaignMeta.effective_status),
        // Meta has no direct equivalent to Google's advertising_channel_type
        // (SEARCH/DISPLAY/...); this only feeds a cosmetic dropdown in the
        // report builder, so it's left as a fixed placeholder here.
        channelType: 'DISPLAY',
        impressions,
        clicks,
        conversions: sumConversions(r.actions),
        cost,
        ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : 0,
        cpc: clicks ? Math.round((cost / clicks) * 100) / 100 : 0,
      };
    }).sort((a, b) => b.impressions - a.impressions);

    const totals = campaigns.reduce((acc, c) => {
      acc.impressions += c.impressions;
      acc.clicks += c.clicks;
      acc.conversions += c.conversions;
      acc.cost += c.cost;
      return acc;
    }, { impressions: 0, clicks: 0, conversions: 0, cost: 0 });
    totals.cost = Math.round(totals.cost * 100) / 100;
    totals.ctr = totals.impressions ? Math.round((totals.clicks / totals.impressions) * 10000) / 100 : 0;
    totals.cpc = totals.clicks ? Math.round((totals.cost / totals.clicks) * 100) / 100 : 0;

    return jsonResponse({
      meta: {
        source: 'Meta Ads Insights API',
        pulledAt: new Date().toISOString(),
        account,
        period: { start, end },
      },
      totals,
      campaigns,
    }, 200, headers);
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) }, 502, headers);
  }
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
    if (url.pathname === '/accounts') return handleAccounts(url, env, origin);
    if (url.pathname === '/insights') return handleInsights(url, env, origin);

    return jsonResponse({ error: 'Not found' }, 404);
  },
  _internal: { getFreshAccessToken },
};
