/*!
 * Tweak Reporting — reports + login Worker
 *
 * Backs two things that used to live only in the browser's localStorage:
 *  - real username/password login against Supabase (app_users table,
 *    bcrypt via pgcrypto — see app_login/app_set_email/app_set_password
 *    functions in the database)
 *  - shared report storage (Supabase "reports" table) so a published
 *    report is fetchable from any device, not just the browser it was
 *    published from.
 *
 * All database access here uses the Supabase service_role key, which
 * bypasses Row Level Security entirely — so every authorization decision
 * (who can see/edit what) is enforced in THIS file, not in the database.
 * Nothing in this file is trusted input from the client except after its
 * session token has been checked against the SESSIONS KV store.
 */

function corsHeaders(origin, allowedOrigin) {
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (origin === allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
  return headers;
}

function jsonResponse(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

function isValidSlug(s) {
  return typeof s === 'string' && /^[a-z0-9][a-z0-9._-]{1,63}$/i.test(s);
}

function isValidPeriod(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// ---------------------------------------------------------------------
// Supabase REST helpers (all calls use the service_role key — full
// access, RLS bypassed; authorization happens in this file instead).
// ---------------------------------------------------------------------

async function supabaseRpc(env, fn, args) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* leave null */ }
  if (!res.ok) throw new Error((data && data.message) || text || `Supabase RPC ${fn} failed (${res.status})`);
  return data;
}

async function supabaseSelect(env, table, query) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.message) || `Supabase select on ${table} failed (${res.status})`);
  return data;
}

async function supabaseUpsert(env, table, row, onConflict) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.message) || `Supabase upsert on ${table} failed (${res.status})`);
  return data;
}

// ---------------------------------------------------------------------
// Sessions (Workers KV)
// ---------------------------------------------------------------------

async function createSession(env, user) {
  const token = randomToken();
  const session = {
    userId: user.id,
    username: user.username,
    role: user.role,
    clientId: user.client_id,
  };
  await env.SESSIONS.put(token, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
  return token;
}

async function getSession(env, request, url) {
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const token = bearer || url.searchParams.get('token');
  if (!token) return null;
  const raw = await env.SESSIONS.get(token);
  if (!raw) return null;
  try { return { token, ...JSON.parse(raw) }; } catch { return null; }
}

function userFacing(u, clientSlug) {
  return {
    username: u.username,
    role: u.role,
    displayName: u.display_name,
    needsEmail: !u.email,
    needsPasswordChange: !!u.password_is_temporary,
    clientSlug: clientSlug || null,
  };
}

async function slugForClientId(env, clientId) {
  if (!clientId) return null;
  const rows = await supabaseSelect(env, 'clients', `id=eq.${encodeURIComponent(clientId)}&select=slug`);
  return rows[0] ? rows[0].slug : null;
}

// ---------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------

async function handleLogin(request, env, headers) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400, headers); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return jsonResponse({ error: 'Missing username or password' }, 400, headers);

  const user = await supabaseRpc(env, 'app_login', { p_username: username, p_password: password });
  if (!user) return jsonResponse({ error: 'Incorrect username or password' }, 401, headers);

  const token = await createSession(env, user);
  const clientSlug = await slugForClientId(env, user.client_id);
  return jsonResponse({ token, user: userFacing(user, clientSlug) }, 200, headers);
}

async function requireSession(request, env, url, headers) {
  const session = await getSession(env, request, url);
  if (!session) {
    return { error: jsonResponse({ error: 'Not signed in' }, 401, headers) };
  }
  return { session };
}

async function handleAccountEmail(request, env, url, headers) {
  const { session, error } = await requireSession(request, env, url, headers);
  if (error) return error;
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400, headers); }
  const email = String(body.email || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Enter a valid email address' }, 400, headers);
  }
  await supabaseRpc(env, 'app_set_email', { p_user_id: session.userId, p_email: email });
  return jsonResponse({ ok: true }, 200, headers);
}

async function handleAccountPassword(request, env, url, headers) {
  const { session, error } = await requireSession(request, env, url, headers);
  if (error) return error;
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400, headers); }
  const newPassword = String(body.newPassword || '');
  if (newPassword.length < 6) return jsonResponse({ error: 'Password must be at least 6 characters' }, 400, headers);
  await supabaseRpc(env, 'app_set_password', { p_user_id: session.userId, p_new_password: newPassword });
  return jsonResponse({ ok: true }, 200, headers);
}

async function handleWhoAmI(request, env, url, headers) {
  const session = await getSession(env, request, url);
  if (!session) return jsonResponse({ signedIn: false }, 200, headers);
  const rows = await supabaseSelect(
    env,
    'app_users',
    `id=eq.${encodeURIComponent(session.userId)}&select=username,role,client_id,email,password_is_temporary,display_name`
  );
  const user = rows[0];
  if (!user) return jsonResponse({ signedIn: false }, 200, headers);
  const clientSlug = await slugForClientId(env, user.client_id);
  return jsonResponse({ signedIn: true, user: userFacing(user, clientSlug) }, 200, headers);
}

async function resolveClientId(env, slug) {
  const rows = await supabaseSelect(env, 'clients', `slug=eq.${encodeURIComponent(slug)}&select=id`);
  return rows[0] ? rows[0].id : null;
}

async function handleReportsList(request, env, url, headers) {
  const { session, error } = await requireSession(request, env, url, headers);
  if (error) return error;
  const clientSlug = url.searchParams.get('client');
  if (!isValidSlug(clientSlug)) return jsonResponse({ error: 'Missing or invalid "client"' }, 400, headers);
  const clientId = await resolveClientId(env, clientSlug);
  if (!clientId) return jsonResponse({ error: 'Unknown client' }, 404, headers);

  if (session.role !== 'admin' && session.clientId !== clientId) {
    return jsonResponse({ error: 'Not allowed to view this client' }, 403, headers);
  }

  let query = `client_id=eq.${encodeURIComponent(clientId)}&select=period,title,author,status,answers,se_rankings,manual_data,generated,revision_notes,created_at,updated_at,published_at&order=period.desc`;
  if (session.role !== 'admin') query += '&status=eq.published';
  const rows = await supabaseSelect(env, 'reports', query);
  return jsonResponse({ reports: rows }, 200, headers);
}

async function handleReportGet(request, env, url, headers) {
  const { session, error } = await requireSession(request, env, url, headers);
  if (error) return error;
  const clientSlug = url.searchParams.get('client');
  const period = url.searchParams.get('period');
  if (!isValidSlug(clientSlug) || !isValidPeriod(period)) {
    return jsonResponse({ error: 'Missing or invalid "client"/"period"' }, 400, headers);
  }
  const clientId = await resolveClientId(env, clientSlug);
  if (!clientId) return jsonResponse({ error: 'Unknown client' }, 404, headers);
  if (session.role !== 'admin' && session.clientId !== clientId) {
    return jsonResponse({ error: 'Not allowed to view this client' }, 403, headers);
  }

  const rows = await supabaseSelect(
    env,
    'reports',
    `client_id=eq.${encodeURIComponent(clientId)}&period=eq.${encodeURIComponent(period)}&select=*`
  );
  const report = rows[0];
  if (!report) return jsonResponse({ report: null }, 200, headers);
  if (session.role !== 'admin' && report.status !== 'published') {
    return jsonResponse({ report: null }, 200, headers);
  }
  return jsonResponse({ report }, 200, headers);
}

async function handleReportSave(request, env, url, headers) {
  const { session, error } = await requireSession(request, env, url, headers);
  if (error) return error;
  if (session.role !== 'admin') return jsonResponse({ error: 'Only team members can save reports' }, 403, headers);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400, headers); }
  const clientSlug = body.client;
  const period = body.period;
  if (!isValidSlug(clientSlug) || !isValidPeriod(period)) {
    return jsonResponse({ error: 'Missing or invalid "client"/"period"' }, 400, headers);
  }
  const clientId = await resolveClientId(env, clientSlug);
  if (!clientId) return jsonResponse({ error: 'Unknown client' }, 404, headers);

  const status = body.status === 'published' ? 'published' : 'draft';
  const row = {
    client_id: clientId,
    period,
    title: body.title || null,
    author: body.author || null,
    status,
    answers: body.answers || {},
    se_rankings: body.seRankings || null,
    manual_data: body.manualData || null,
    generated: body.generated || null,
    revision_notes: body.revisionNotes || [],
    updated_at: new Date().toISOString(),
  };
  if (status === 'published') row.published_at = new Date().toISOString();

  const saved = await supabaseUpsert(env, 'reports', row, 'client_id,period');
  return jsonResponse({ report: saved[0] || null }, 200, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (!env.SUPABASE_SERVICE_KEY) {
      return jsonResponse({ error: 'Worker is missing SUPABASE_SERVICE_KEY — run: wrangler secret put SUPABASE_SERVICE_KEY' }, 500, headers);
    }

    try {
      if (url.pathname === '/login' && request.method === 'POST') return await handleLogin(request, env, headers);
      if (url.pathname === '/whoami') return await handleWhoAmI(request, env, url, headers);
      if (url.pathname === '/account/email' && request.method === 'POST') return await handleAccountEmail(request, env, url, headers);
      if (url.pathname === '/account/password' && request.method === 'POST') return await handleAccountPassword(request, env, url, headers);
      if (url.pathname === '/reports/list') return await handleReportsList(request, env, url, headers);
      if (url.pathname === '/reports/one') return await handleReportGet(request, env, url, headers);
      if (url.pathname === '/reports/save' && request.method === 'POST') return await handleReportSave(request, env, url, headers);
    } catch (err) {
      return jsonResponse({ error: String((err && err.message) || err) }, 500, headers);
    }

    return jsonResponse({ error: 'Not found' }, 404, headers);
  },
};
