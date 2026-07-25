import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { getRecoveryCase } from './recovery-service.js';

function stringify(value, fallback = 'not provided') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function callVariables(recoveryCase, receiver) {
  const food = recoveryCase.food;
  const pickup = recoveryCase.pickup;
  return {
    agentName: 'XTrace food recovery assistant',
    restaurantName: recoveryCase.restaurantName,
    receiverName: receiver.name,
    foodDescription: stringify(food.description),
    quantityText: `${stringify(food.quantity)} ${stringify(food.unit, 'items')}`,
    allergens:
      Array.isArray(food.allergens) && food.allergens.length
        ? food.allergens.join(', ')
        : 'none reported',
    preparedAt: stringify(food.preparedAt),
    temperatureF: stringify(food.temperatureF),
    safeUntil: stringify(food.safeUntil),
    pickupAddress: stringify(pickup.address),
    readyAt: stringify(pickup.readyAt),
    latestAt: stringify(pickup.latestAt)
  };
}

export async function startRecovery(
  db,
  vapiClient,
  recoveryCaseId,
  receiverIds
) {
  if (!Array.isArray(receiverIds) || receiverIds.length === 0) {
    throw new AppError(
      400,
      'RECEIVERS_REQUIRED',
      'At least one receiverId is required.'
    );
  }
  if (new Set(receiverIds).size !== receiverIds.length) {
    throw new AppError(
      400,
      'DUPLICATE_RECEIVER',
      'receiverIds must be unique.'
    );
  }

  const recoveryCase = getRecoveryCase(db, recoveryCaseId);
  if (recoveryCase.status !== 'draft') {
    throw new AppError(
      409,
      'RECOVERY_ALREADY_STARTED',
      'This recovery case has already started.'
    );
  }

  const placeholders = receiverIds.map(() => '?').join(',');
  const receivers = db
    .prepare(`
      SELECT id FROM receivers
      WHERE active = 1 AND id IN (${placeholders})
    `)
    .all(...receiverIds);
  if (receivers.length !== receiverIds.length) {
    throw new AppError(
      400,
      'INVALID_RECEIVER_SELECTION',
      'One or more receivers do not exist or are inactive.'
    );
  }

  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const insert = db.prepare(`
      INSERT INTO recovery_case_receivers
        (recovery_case_id, receiver_id, position, status)
      VALUES (?, ?, ?, 'queued')
    `);
    receiverIds.forEach((receiverId, index) => {
      insert.run(recoveryCaseId, receiverId, index);
    });
    db.prepare(`
      UPDATE recovery_cases
      SET status = 'calling', updated_at = ?
      WHERE id = ? AND status = 'draft'
    `).run(now, recoveryCaseId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return startNextReceiver(db, vapiClient, recoveryCaseId);
}

export async function startNextReceiver(db, vapiClient, recoveryCaseId) {
  const active = db
    .prepare(`
      SELECT call_id AS callId
      FROM recovery_case_receivers
      WHERE recovery_case_id = ? AND status IN ('calling', 'in_progress')
      LIMIT 1
    `)
    .get(recoveryCaseId);
  if (active) {
    return { recoveryCaseId, status: 'calling', activeCallId: active.callId };
  }

  while (true) {
    const next = db
      .prepare(`
        SELECT
          q.receiver_id AS receiverId,
          r.name,
          r.type,
          r.phone_e164 AS phone
        FROM recovery_case_receivers q
        JOIN receivers r ON r.id = q.receiver_id
        WHERE q.recovery_case_id = ? AND q.status = 'queued'
        ORDER BY q.position
        LIMIT 1
      `)
      .get(recoveryCaseId);

    if (!next) {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE recovery_cases
        SET status = 'exhausted', updated_at = ?
        WHERE id = ? AND status = 'calling'
      `).run(now, recoveryCaseId);
      return { recoveryCaseId, status: 'exhausted', activeCallId: null };
    }

    const recoveryCase = getRecoveryCase(db, recoveryCaseId);
    const internalCallId = `call_${randomUUID()}`;
    const now = new Date().toISOString();
    const variables = callVariables(recoveryCase, next);

    try {
      const providerCall = await vapiClient.createOutboundCall({
        destination: next.phone,
        metadata: {
          internalCallId,
          recoveryCaseId,
          receiverId: next.receiverId
        },
        variableValues: variables
      });

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`
          INSERT INTO calls
            (id, recovery_case_id, receiver_id, vapi_call_id, destination,
             status, guidance_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?)
        `).run(
          internalCallId,
          recoveryCaseId,
          next.receiverId,
          providerCall.id,
          next.phone,
          providerCall.status ?? 'queued',
          now,
          now
        );
        db.prepare(`
          UPDATE recovery_case_receivers
          SET status = 'calling', call_id = ?
          WHERE recovery_case_id = ? AND receiver_id = ? AND status = 'queued'
        `).run(internalCallId, recoveryCaseId, next.receiverId);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return {
        recoveryCaseId,
        status: 'calling',
        activeCallId: internalCallId,
        providerCallId: providerCall.id,
        receiverId: next.receiverId
      };
    } catch (error) {
      db.prepare(`
        UPDATE recovery_case_receivers
        SET status = 'failed'
        WHERE recovery_case_id = ? AND receiver_id = ? AND status = 'queued'
      `).run(recoveryCaseId, next.receiverId);
      if (error.code === 'VAPI_NOT_CONFIGURED') throw error;
    }
  }
}

export async function advanceRecoveryFromEvent(
  db,
  vapiClient,
  event
) {
  if (event.type !== 'end-of-call-report') return null;

  const call = db
    .prepare(`
      SELECT id, recovery_case_id AS recoveryCaseId, receiver_id AS receiverId
      FROM calls
      WHERE vapi_call_id = ? OR id = ?
      LIMIT 1
    `)
    .get(event.vapiCallId, event.internalCallId);
  if (!call?.recoveryCaseId) return null;

  const result = event.structuredData ?? {
    status: 'unknown',
    pickupConfirmed: false,
    blockers: [],
    observations: [],
    summary: event.summary ?? 'Call ended without structured analysis.'
  };
  const accepted =
    result.status === 'accepted' && result.pickupConfirmed === true;
  const attemptStatus = accepted
    ? 'accepted'
    : result.status === 'no_answer'
      ? 'no_answer'
      : result.status === 'callback_requested'
        ? 'callback_requested'
        : 'rejected';
  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE calls
      SET status = ?, summary = ?, result_json = ?, ended_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      attemptStatus,
      result.summary ?? event.summary,
      JSON.stringify(result),
      now,
      now,
      call.id
    );
    db.prepare(`
      UPDATE recovery_case_receivers
      SET status = ?
      WHERE recovery_case_id = ? AND receiver_id = ?
    `).run(attemptStatus, call.recoveryCaseId, call.receiverId);
    if (accepted) {
      db.prepare(`
        UPDATE recovery_cases
        SET status = 'accepted', updated_at = ?
        WHERE id = ?
      `).run(now, call.recoveryCaseId);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  if (accepted) {
    return {
      recoveryCaseId: call.recoveryCaseId,
      status: 'accepted',
      activeCallId: null
    };
  }
  return startNextReceiver(db, vapiClient, call.recoveryCaseId);
}

