'use strict';

/**
 * Thin adapter over the hosted XTrace Memory API.
 *
 * Endpoints verified live against https://api.production.xtrace.ai:
 *
 *   POST /v1/memories          ingest. Returns 202 + an `ingest_job`; extraction
 *                              runs in the background. Requires messages,
 *                              user_id and conv_id.
 *   POST /v1/memories/search   recall. Takes a natural-language `query` and
 *                              returns ranked `data[]` rows plus, in compose
 *                              mode, an assembled `context` markdown block.
 *   GET  /v1/memories/jobs/:id ingest job status.
 *
 * Auth is the `x-api-key` header. No SDK dependency on purpose: these are plain
 * REST calls and Node 18+ ships fetch, so the service stays install-free.
 *
 * If XTRACE_API_KEY is unset every method returns null and the caller falls back
 * to the local deterministic store. The demo never hard-fails on a network hiccup.
 */

const BASE_URL = process.env.XTRACE_BASE_URL || 'https://api.production.xtrace.ai';
const API_KEY = process.env.XTRACE_API_KEY || '';
const AGENT_ID = process.env.XTRACE_AGENT_ID || 'surplus-recovery-agent';
const APP_ID = process.env.XTRACE_APP_ID || 'xtrace-surplus-recovery';
const TIMEOUT_MS = Number(process.env.XTRACE_TIMEOUT_MS || 6000);

// XTrace scopes memory by user_id. Ingest and recall MUST agree on it or we
// write into one bucket and read from another and recall silently returns
// nothing. One constant, used by both paths.
const DEFAULT_USER_ID = process.env.XTRACE_USER_ID || 'restaurant_demo';

function isEnabled() {
  return Boolean(API_KEY);
}

async function request(method, pathname, body) {
  if (!isEnabled()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${pathname}`, {
      method,
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn(`[xtrace] ${method} ${pathname} -> ${res.status} ${detail.slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[xtrace] ${pathname} failed, using local memory:`, err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Recall before placing a call.
 *
 * The API ranks on a natural-language query, so we build one from the task and
 * the receiver rather than passing structured filters. `user_id` scopes to this
 * restaurant; `agent_id` keeps the surplus-recovery agent's memory separate from
 * anything else running under the same key.
 */
async function recallProcedures({ task, receiver, restaurantId }) {
  const receiverType = (receiver && receiver.type) || 'shelter';
  const query =
    `What should we say to a ${receiverType} to get a prepared-food donation accepted? ` +
    `Include food safety details, contact routing and pickup timing that worked before.`;

  return request('POST', '/v1/memories/search', {
    query,
    user_id: restaurantId || DEFAULT_USER_ID,
    agent_id: AGENT_ID,
    app_id: APP_ID,
    mode: 'compose',
  });
}

/**
 * Send what happened on the call so XTrace can extract durable directives.
 * Fire-and-forget: we never block the response on it.
 */
async function ingestEpisode({ messages, restaurantId, convId }) {
  return request('POST', '/v1/memories', {
    messages,
    user_id: restaurantId || DEFAULT_USER_ID,
    conv_id: convId,
    agent_id: AGENT_ID,
    app_id: APP_ID,
  });
}

/** Poll an ingest job. Only used by the verification script, not the hot path. */
async function jobStatus(jobId) {
  return request('GET', `/v1/memories/jobs/${jobId}`);
}

/**
 * Map an XTrace memory row onto our procedure shape so the backend sees one
 * consistent contract whether the knowledge came from XTrace or the local store.
 *
 * Note on `confidence`: the API returns `score`, which is retrieval relevance,
 * not evidence-backed confidence. Conflating the two would let a merely
 * well-matching row outrank a procedure we have actually proven on calls, so we
 * surface it as `relevance` and leave `confidence` null.
 */
function directiveToProcedure(row) {
  const details = (row && row.details) || {};
  return {
    id: row.id,
    instruction: row.text,
    reason: `Recalled from XTrace ${row.type || 'memory'}${
      details.fact_type ? ` (${details.fact_type})` : ''
    }.`,
    confidence: null,
    relevance: typeof row.score === 'number' ? row.score : null,
    scope: (receiverScopeOf(row) || 'global'),
    evidenceCount: 0,
    lastValidatedAt: row.updated_at || row.created_at || null,
    origin: 'xtrace',
    isLearned: true,
    learnedFromCallId: null,
  };
}

function receiverScopeOf(row) {
  const cats = (row && row.categories) || [];
  return cats.length ? cats[0] : null;
}

/** Rows worth putting in a voice prompt: short, factual, not a whole episode. */
function isPromptable(row) {
  if (!row || typeof row.text !== 'string') return false;
  if (row.type !== 'fact') return false;
  return row.text.length <= 320;
}

module.exports = {
  isEnabled,
  recallProcedures,
  ingestEpisode,
  jobStatus,
  directiveToProcedure,
  isPromptable,
  AGENT_ID,
  APP_ID,
  BASE_URL,
  DEFAULT_USER_ID,
};
