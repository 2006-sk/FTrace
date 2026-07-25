'use strict';

/**
 * Contested beliefs.
 *
 * When a pickup fails, three people give three honest, incompatible accounts.
 * The kitchen says it was bagged and ready. The driver says the door was locked.
 * The shelter says nobody came. Collapsing those into one "truth" row destroys
 * the only useful signal -- that the pickup entrance was never agreed on.
 *
 * So every claim is stored whole, with its source and time, and conflicts are
 * surfaced rather than resolved. Superseding annotates; it never deletes.
 */

const store = require('./store');

function add(payload) {
  const belief = {
    id: store.nextId('belief'),
    recoveryCaseId: payload.recoveryCaseId || null,
    receiverId: payload.receiverId || null,
    subject: payload.subject,
    claim: payload.claim,
    source: payload.source || { type: 'unknown', id: null, role: 'unknown' },
    observedAt: payload.observedAt || store.nowIso(),
    confidence: typeof payload.confidence === 'number' ? payload.confidence : 0.5,
    supersededBy: null,
    createdAt: store.nowIso(),
  };
  store.state.beliefs.push(belief);
  store.save();
  return belief;
}

function supersede(beliefId, bySupersedingId) {
  const belief = store.state.beliefs.find((b) => b.id === beliefId);
  if (!belief) return null;
  belief.supersededBy = bySupersedingId;
  store.save();
  return belief;
}

const ENTRY_HINT =
  'Confirm the pickup entrance and exchange a direct contact before dispatch.';

function conflictsForCase(caseId) {
  const relevant = store.state.beliefs.filter((b) => b.recoveryCaseId === caseId);

  const bySubject = new Map();
  for (const belief of relevant) {
    if (!bySubject.has(belief.subject)) bySubject.set(belief.subject, []);
    bySubject.get(belief.subject).push(belief);
  }

  const conflicts = [];
  for (const [subject, beliefs] of bySubject) {
    const distinct = new Set(beliefs.map((b) => b.claim.trim().toLowerCase()));
    if (distinct.size < 2) continue; // Agreement is not a conflict.

    const live = beliefs.filter((b) => !b.supersededBy);
    conflicts.push({
      id: `conflict_${subject}`,
      subject,
      status: live.length > 1 ? 'unresolved' : 'resolved',
      beliefs: beliefs.map((b) => ({
        id: b.id,
        claim: b.claim,
        sourceRole: (b.source && b.source.role) || 'unknown',
        sourceId: (b.source && b.source.id) || null,
        observedAt: b.observedAt,
        confidence: b.confidence,
        supersededBy: b.supersededBy,
      })),
      recommendedAction: ENTRY_HINT,
    });
  }

  return { conflicts };
}

module.exports = { add, supersede, conflictsForCase };
