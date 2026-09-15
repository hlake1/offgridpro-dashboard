/*!
 * Tweak Reporting — AI report assistant (Cloudflare Worker)
 *
 * Sits between the client-side "Generate draft report" button (in each
 * client's admin/builder.html) and the Anthropic API. Its only job:
 * hold the Anthropic API key server-side (never in the browser) and turn
 * an account manager's rough monthly notes + the real campaign numbers
 * into polished, client-ready report copy plus a short list of
 * data-driven insights.
 *
 * It NEVER invents numbers. The metrics/campaign figures it's given are
 * treated as read-only ground truth for the "insights" it writes — the
 * actual metrics shown in the report are still computed locally in the
 * browser from the real data, exactly as before. This Worker only ever
 * touches narrative text.
 *
 * Deploy: see ../README.md
 */

const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 2000;

const SYSTEM_PROMPT = `You are a marketing report assistant for Tweak Marketing, a UK digital marketing agency. Your job is to help an account manager turn their rough monthly notes into polished, client-ready report copy, and to surface genuine data-driven observations from the campaign figures they give you.

Rules — follow all of these exactly:
1. Never invent, estimate, guess, or alter any number. Only reference figures that appear in the DATA block you're given.
2. Preserve every fact and claim from the account manager's original notes. You may rephrase for clarity, tone and flow, but never add a claim, result, or detail they did not write themselves.
3. Write in a professional, confident, client-facing tone. Be concise. No filler adjectives ("amazing", "incredible", "game-changing"), no hype, no exclamation marks.
4. If the account manager left a question blank or wrote only a placeholder (e.g. "n/a", "-", "tbc"), return an empty string for that output field. Do not fabricate content to fill the gap.
5. For "insights": only write observations that are directly and specifically supported by the campaign data provided. Each insight must be traceable to a real number in the DATA block. If there isn't enough data to say anything meaningful, return an empty array — never pad it with generic filler.
6. Output ONLY a single JSON object matching the schema below. No markdown code fences, no commentary before or after, no explanation of what you did.

Schema:
{
  "headline": string,       // rewritten answer to "biggest win this month"
  "overperformer": string,  // rewritten answer to "channel that exceeded expectations"
  "feedback": string,       // rewritten answer to "client feedback / anecdotes"
  "focus": string,          // rewritten answer to "main strategic focus"
  "rationale": string,      // rewritten answer to "why these changes were prioritised"
  "challenges": string,     // rewritten answer to "pivots or challenges"
  "budget": string,         // rewritten answer to "budget or strategy changes planned"
  "extras": string,         // rewritten answer to "anything else to highlight"
  "insights": string[]      // 0-4 short, data-grounded observations (max ~20 words each)
}`;

function corsHeaders(origin, allowedOrigin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
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

function buildUserMessage(payload) {
  const { client, answers, metrics, topCampaign, campaigns, priorities } = payload;
  return `CLIENT CONTEXT
Name: ${client?.name || 'the client'}
Sector: ${client?.sector || 'unknown'}

ACCOUNT MANAGER'S RAW NOTES (rewrite these — do not add facts not present here)
1. Biggest win this month: ${answers?.q1 || '(blank)'}
2. Channel/campaign that exceeded expectations: ${answers?.q2 || '(blank)'}
3. Client feedback or anecdotes: ${answers?.q3 || '(blank)'}
4. Main strategic focus: ${answers?.q4 || '(blank)'}
5. Why these changes were prioritised: ${answers?.q5 || '(blank)'}
6. Pivots or challenges: ${answers?.q6 || '(blank)'}
7. Top priorities next month (already parsed, do not rewrite): ${JSON.stringify(priorities || [])}
8. Budget or strategy changes planned: ${answers?.q8 || '(blank)'}
9. Anything else to highlight: ${answers?.q9 || '(blank)'}

DATA (ground truth — the only numbers you may reference in "insights")
Totals: ${metrics ? JSON.stringify(metrics) : 'not available this month'}
Top campaign: ${topCampaign ? JSON.stringify(topCampaign) : 'not available'}
All campaigns: ${campaigns && campaigns.length ? JSON.stringify(campaigns) : 'not available'}

Return the JSON object now.`;
}

function extractJson(text) {
  // Defensive: strip accidental markdown fences even though the system
  // prompt tells the model not to use them.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

async function callClaude(env, payload) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(payload) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const blocks = Array.isArray(data?.content) ? data.content : [];
  // Don't assume content[0] is the text block — some responses put other
  // block types (e.g. thinking) first. Scan for the first real text block.
  const textBlock = blocks.find((b) => b && b.type === 'text' && typeof b.text === 'string' && b.text.length > 0);
  if (!textBlock) {
    const blockTypes = blocks.length ? blocks.map((b) => b?.type || 'unknown').join(',') : 'none';
    throw new Error(
      `Anthropic response had no usable text block (stop_reason=${data?.stop_reason || 'unknown'}, blocks=[${blockTypes}], raw=${JSON.stringify(data).slice(0, 500)})`
    );
  }
  return extractJson(textBlock.text);
}

const REQUIRED_FIELDS = [
  'headline', 'overperformer', 'feedback', 'focus',
  'rationale', 'challenges', 'budget', 'extras', 'insights',
];

function validateShape(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (!Array.isArray(obj.insights)) return false;
  return REQUIRED_FIELDS.every((f) => f in obj);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://hlake1.github.io';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowedOrigin) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders(origin, allowedOrigin));
    }

    // Origin allowlist — a static site has no real auth, so this (plus a
    // Cloudflare rate-limiting rule configured in the dashboard, plus a
    // spend cap on the Anthropic key) is the practical layer of defence
    // against a stray script racking up API costs. Not bulletproof
    // against a determined attacker spoofing headers — see README.
    if (origin !== allowedOrigin) {
      return jsonResponse({ error: 'Origin not allowed' }, 403, corsHeaders(origin, allowedOrigin));
    }

    if (!env.ANTHROPIC_API_KEY) {
      return jsonResponse({ error: 'Worker is missing ANTHROPIC_API_KEY — run: wrangler secret put ANTHROPIC_API_KEY' }, 500, corsHeaders(origin, allowedOrigin));
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders(origin, allowedOrigin));
    }

    if (!payload || typeof payload.answers !== 'object') {
      return jsonResponse({ error: 'Missing "answers" in request body' }, 400, corsHeaders(origin, allowedOrigin));
    }

    try {
      const result = await callClaude(env, payload);
      if (!validateShape(result)) {
        return jsonResponse({ error: 'Model returned an unexpected shape' }, 502, corsHeaders(origin, allowedOrigin));
      }
      return jsonResponse(result, 200, corsHeaders(origin, allowedOrigin));
    } catch (err) {
      return jsonResponse({ error: String(err && err.message || err) }, 502, corsHeaders(origin, allowedOrigin));
    }
  },
};
