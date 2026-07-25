'use strict';

/**
 * Episode ingestion: record what happened, then get smarter because of it.
 *
 *   rejected call -> extract the blocker -> create a procedure that prevents it
 *   accepted call -> strengthen the procedures that were used
 *
 * Idempotent on `idempotencyKey`, because Vapi will redeliver webhooks and a
 * replayed event must not double-count evidence or duplicate a procedure.
 */

const store = require('./store');
const xtrace = require('./xtraceClient');
const { computeConfidence } = require('./confidence');
const { extractCandidate } = require('./extract');

function findProcedure(id) {
  return store.state.procedures.find((p) => p.id === id) || null;
}

function applyFeedback(feedback, callId) {
  const touched = [];
  for (const item of feedback || []) {
    const proc = findProcedure(item.procedureId);
    if (!proc) continue;

    if (item.result === 'helped') proc.evidence.helped += 1;
    else if (item.result === 'hurt') proc.evidence.hurt += 1;
    else if (item.result === 'unclear') proc.evidence.unclear += 1;
    else continue; // 'not_used' records nothing -- absence of use is not evidence.

    proc.confidence = computeConfidence(proc.evidence);
    proc.updatedAt = store.nowIso();
    proc.lastValidatedCallId = callId || null;
    touched.push({
      id: proc.id,
      result: item.result,
      confidence: proc.confidence,
      evidence: Object.assign({}, proc.evidence),
    });
  }
  return touched;
}

/**
 * Create a procedure from a failed call, or reinforce the matching one if this
 * blocker has been seen before. Returns the wire-shape candidate list.
 */
function learnFromFailure({ outcome, observations, episodeId, callId, receiver }) {
  const candidate = extractCandidate({ outcome, observations });
  if (!candidate) return [];

  const existing = store.state.procedures.find(
    (p) => p.learnedReason === candidate.reason && p.task === 'secure_food_donation_pickup'
  );

  if (existing) {
    // Same blocker again: that is corroboration, not a second procedure.
    existing.evidence.unclear += 1;
    existing.updatedAt = store.nowIso();
    store.save();
    return [{ id: existing.id, instruction: existing.instruction, status: 'reinforced' }];
  }

  const scopeType = candidate.scopeType || 'receiver_type';
  const scopeValue =
    scopeType === 'receiver'
      ? receiver && receiver.id
      : scopeType === 'receiver_type'
        ? (receiver && receiver.type) || 'shelter'
        : null;

  const evidence = { helped: 0, hurt: 0, unclear: 0 };
  const now = store.nowIso();
  const proc = {
    id: store.nextId('proc'),
    task: 'secure_food_donation_pickup',
    scope: { type: scopeType, value: scopeValue },
    trigger: candidate.trigger,
    instruction: candidate.instruction,
    expectedEffect: candidate.expectedEffect,
    // Starts at exactly 0.50: proposed, plausible, unproven.
    confidence: computeConfidence(evidence),
    evidence,
    // Active immediately so the very next call can use it -- that transfer is
    // the entire demo. Origin marks it so the UI can badge it as just-learned.
    status: 'active',
    origin: 'learned',
    learnedReason: candidate.reason,
    learnedFromCallId: callId || null,
    createdFromEpisodeId: episodeId,
    createdAt: now,
    updatedAt: now,
  };

  store.state.procedures.push(proc);
  store.save();

  return [{ id: proc.id, instruction: proc.instruction, status: 'proposed' }];
}

function buildTranscriptMessages({ outcome, observations, receiver }) {
  const messages = [
    {
      role: 'assistant',
      content: `Outbound donation call to ${(receiver && receiver.name) || 'receiver'}. Result: ${
        (outcome && outcome.status) || 'unknown'
      }${outcome && outcome.reason ? ` (${outcome.reason})` : ''}.`,
    },
  ];
  for (const obs of observations || []) {
    messages.push({
      role: obs.speaker === 'receiver' ? 'user' : 'assistant',
      content: obs.statement,
    });
  }
  return messages;
}

async function ingest(payload) {
  const key = payload.idempotencyKey;

  // Replayed webhook: return the original result, change nothing.
  if (key && store.state.idempotency[key]) {
    const prior = store.state.idempotency[key];
    return Object.assign({}, prior, { stored: true, duplicate: true });
  }

  const episodeId = store.nextId('episode');
  const now = store.nowIso();

  const observations = (payload.observations || []).map((obs) => ({
    id: store.nextId('obs'),
    episodeId,
    statement: obs.statement,
    // Source and time are mandatory: an unattributed observation is not evidence.
    sourceType: obs.sourceType || 'unknown',
    sourceId: obs.sourceId || payload.callId || null,
    speaker: obs.speaker || null,
    observedAt: obs.observedAt || now,
  }));

  const episode = {
    id: episodeId,
    task: payload.task,
    recoveryCaseId: payload.recoveryCaseId || null,
    callId: payload.callId || null,
    receiverId: payload.receiverId || null,
    guidanceSearchId: payload.guidanceSearchId || null,
    outcome: payload.outcome || {},
    observations,
    createdAt: now,
  };
  store.state.episodes.push(episode);

  const strengthened = applyFeedback(payload.procedureFeedback, payload.callId);

  const receiver = payload.receiver || {
    id: payload.receiverId,
    type: (payload.receiver && payload.receiver.type) || 'shelter',
    name: payload.receiverId,
  };

  const candidateProcedures = learnFromFailure({
    outcome: payload.outcome,
    observations,
    episodeId,
    callId: payload.callId,
    receiver,
  });

  const result = { episodeId, stored: true, candidateProcedures, strengthened };
  if (key) store.state.idempotency[key] = { episodeId, candidateProcedures, strengthened };
  store.save();

  // Mirror into hosted XTrace so its extractor sees the same call. Never awaited
  // into the response path -- a slow network must not stall the demo.
  if (xtrace.isEnabled()) {
    xtrace
      .ingestEpisode({
        messages: buildTranscriptMessages({ outcome: payload.outcome, observations, receiver }),
        restaurantId: payload.restaurantId,
        convId: payload.recoveryCaseId || episodeId,
      })
      .catch(() => {});
  }

  return result;
}

module.exports = { ingest, applyFeedback, learnFromFailure };
