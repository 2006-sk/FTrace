'use strict';

/**
 * Guidance search: what should the voice agent know before it dials?
 *
 * Ranking follows the spec order, implemented as a scope weight so a strong
 * receiver-specific fact always outranks a weak global hint:
 *
 *   1. same receiver + same task        weight 400
 *   2. same receiver type + same task   weight 300
 *   3. global, same task                weight 200
 *   4. tie-break on confidence, then recency
 *
 * Selection is fully deterministic. Two identical requests return the same
 * ordering every time, which is what makes the demo repeatable on stage.
 */

const store = require('./store');
const xtrace = require('./xtraceClient');

const SCOPE_WEIGHT = { receiver: 400, receiver_type: 300, global: 200 };

function scopeMatches(procedure, receiver) {
  const scope = procedure.scope || { type: 'global' };
  if (scope.type === 'global') return true;
  if (!receiver) return false;
  if (scope.type === 'receiver') return scope.value === receiver.id;
  if (scope.type === 'receiver_type') return scope.value === receiver.type;
  return false;
}

function recencyBonus(procedure) {
  const ts = Date.parse(procedure.updatedAt || procedure.createdAt || 0);
  if (!ts) return 0;
  const ageHours = (Date.now() - ts) / 3_600_000;
  // Small, bounded nudge toward recently validated procedures.
  return Math.max(0, 10 - ageHours / 24);
}

function scoreOf(procedure, receiver) {
  const scope = procedure.scope || { type: 'global' };
  const weight = SCOPE_WEIGHT[scope.type] || 0;
  return weight + procedure.confidence * 100 + recencyBonus(procedure);
}

function toWireProcedure(procedure, receiver) {
  return {
    id: procedure.id,
    instruction: procedure.instruction,
    reason: procedure.reason || explain(procedure),
    confidence: procedure.confidence,
    scope: (procedure.scope && procedure.scope.value) || 'global',
    evidenceCount: (procedure.evidence && procedure.evidence.helped) || 0,
    lastValidatedAt: procedure.updatedAt,
    // Extra fields for the UI. Additive only -- the documented contract is intact.
    origin: procedure.origin || 'local',
    isLearned: procedure.origin === 'learned',
    learnedFromCallId: procedure.learnedFromCallId || null,
  };
}

function explain(procedure) {
  const helped = (procedure.evidence && procedure.evidence.helped) || 0;
  if (procedure.origin === 'learned' && helped === 0) {
    return 'Learned from a call that failed for this reason.';
  }
  if (helped === 0) return 'No outcome evidence yet.';
  return `Helped on ${helped} previous call${helped === 1 ? '' : 's'}.`;
}

async function search({ task, receiver, food, limit, restaurantId }) {
  const max = Number(limit) || 5;

  const local = store.state.procedures
    .filter((p) => p.status === 'active')
    .filter((p) => p.task === task)
    .filter((p) => scopeMatches(p, receiver))
    .map((p) => ({ p, score: scoreOf(p, receiver) }))
    .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
    .map(({ p }) => toWireProcedure(p, receiver));

  // Hosted XTrace directives, when a key is configured. Merged after local so a
  // proven local procedure keeps its position; remote adds breadth, not noise.
  let remote = [];
  if (xtrace.isEnabled()) {
    const res = await xtrace.recallProcedures({
      task,
      receiver,
      restaurantId: restaurantId || (food && food.restaurantId),
    });
    if (res && Array.isArray(res.data)) {
      remote = res.data.filter(xtrace.isPromptable).map(xtrace.directiveToProcedure);
    }
  }

  const seen = new Set();
  const procedures = [];
  for (const p of [...local, ...remote]) {
    const key = (p.instruction || '').trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    procedures.push(p);
    if (procedures.length >= max) break;
  }

  const beliefs = store.state.beliefs
    .filter((b) => !b.supersededBy)
    .filter((b) => b.receiverId && receiver && b.receiverId === receiver.id)
    .slice(0, 3)
    .map((b) => ({
      id: b.id,
      claim: b.claim,
      confidence: b.confidence,
      source: b.source && b.source.id,
    }));

  const searchId = store.nextId('search');
  store.state.searches.push({
    id: searchId,
    task,
    receiverId: receiver && receiver.id,
    procedureIds: procedures.map((p) => p.id),
    createdAt: store.nowIso(),
  });
  store.save();

  return { procedures, beliefs, searchId };
}

module.exports = { search, scoreOf, scopeMatches };
