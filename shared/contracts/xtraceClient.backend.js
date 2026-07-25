'use strict';

/**
 * Drop-in XTrace client for the backend. — Kenil → Shresth
 *
 * Copy this file into the backend and call it; do not hand-roll fetch calls
 * against the memory service. Zero dependencies, Node 18+.
 *
 *   const xtrace = require('./xtraceClient.backend');
 *
 *   // before dialing
 *   const { procedures, searchId } = await xtrace.guidance({ receiver, food });
 *
 *   // on Vapi call.ended
 *   await xtrace.episode({
 *     idempotencyKey: `vapi:${event.eventId}`,
 *     callId, receiverId, receiver, guidanceSearchId: searchId,
 *     outcome: { status: 'rejected', reason: 'food_safety_information_missing' },
 *     observations: [...],
 *   });
 *
 * Every method fails soft: on a network error or a non-2xx it logs and returns
 * an empty-but-valid shape, so a memory outage degrades the call rather than
 * breaking it. Check `.ok` if you want to branch on it.
 */

const BASE = process.env.XTRACE_SERVICE_URL || 'http://localhost:7070';
const TOKEN = process.env.XTRACE_SERVICE_TOKEN || 'dev-token';
const TIMEOUT_MS = Number(process.env.XTRACE_SERVICE_TIMEOUT_MS || 5000);
const TASK = 'secure_food_donation_pickup';

async function call(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn(`[xtrace] ${method} ${path} -> ${res.status}`, json && json.error);
      return { ok: false, error: json && json.error };
    }
    return Object.assign({ ok: true }, json);
  } catch (err) {
    console.warn(`[xtrace] ${method} ${path} unreachable:`, err.message);
    return { ok: false, error: { code: 'XTRACE_UNREACHABLE', message: err.message } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Knowledge to load before placing a call.
 *
 * IMPORTANT: keep `searchId` and pass it back as `guidanceSearchId` on the
 * episode. That link is what lets us tell which guidance produced which outcome.
 *
 * `procedures[].instruction` is written to be pasted straight into the Vapi
 * system prompt — see `toPromptBlock` below.
 */
async function guidance({ receiver, food, limit = 5 }) {
  const res = await call('POST', '/xtrace/v1/guidance/search', {
    task: TASK,
    receiver,
    food,
    limit,
  });
  return {
    ok: res.ok,
    procedures: res.procedures || [],
    beliefs: res.beliefs || [],
    searchId: res.searchId || null,
  };
}

/** Record a finished call. Safe to replay — idempotent on idempotencyKey. */
async function episode(payload) {
  const res = await call('POST', '/xtrace/v1/episodes', Object.assign({ task: TASK }, payload));
  return {
    ok: res.ok,
    episodeId: res.episodeId || null,
    candidateProcedures: res.candidateProcedures || [],
    strengthened: res.strengthened || [],
    duplicate: Boolean(res.duplicate),
  };
}

/** Add one attributed claim. Conflicting claims are preserved, never merged. */
async function belief({ recoveryCaseId, subject, claim, source, observedAt, confidence }) {
  return call('POST', '/xtrace/v1/beliefs', {
    recoveryCaseId,
    subject,
    claim,
    source,
    observedAt: observedAt || new Date().toISOString(),
    confidence: typeof confidence === 'number' ? confidence : 0.8,
  });
}

/** Unresolved conflicting accounts for a case. */
async function conflicts(caseId) {
  const res = await call('GET', `/xtrace/v1/cases/${encodeURIComponent(caseId)}/conflicts`);
  return { ok: res.ok, conflicts: res.conflicts || [] };
}

/** Reset to seed state. Run before every demo take. */
async function reset() {
  return call('POST', '/xtrace/v1/admin/reset');
}

/**
 * Turn procedures into a prompt block for the Vapi assistant.
 * Keep it near the top of the system prompt — these are instructions the agent
 * should follow before it starts negotiating.
 */
function toPromptBlock(procedures) {
  if (!procedures || !procedures.length) return '';
  const lines = procedures.map((p) => `- ${p.instruction}`).join('\n');
  return `Things we have learned from previous donation calls. Follow these:\n${lines}`;
}

module.exports = { guidance, episode, belief, conflicts, reset, toPromptBlock, TASK };
