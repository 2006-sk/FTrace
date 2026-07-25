import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';

export function createRecoveryCase(db, input) {
  if (!input?.restaurantId || !input?.food || !input?.pickup) {
    throw new AppError(
      400,
      'INVALID_RECOVERY_CASE',
      'restaurantId, food, and pickup are required.'
    );
  }

  const id = `rc_${randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO recovery_cases
      (id, restaurant_id, restaurant_name, status, food_json, pickup_json,
       created_at, updated_at)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)
  `).run(
    id,
    input.restaurantId,
    input.restaurantName ?? input.restaurantId,
    JSON.stringify(input.food),
    JSON.stringify(input.pickup),
    now,
    now
  );

  return getRecoveryCase(db, id);
}

export function getRecoveryCase(db, id) {
  const row = db
    .prepare(`
      SELECT
        id,
        restaurant_id AS restaurantId,
        restaurant_name AS restaurantName,
        status,
        food_json AS foodJson,
        pickup_json AS pickupJson,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM recovery_cases WHERE id = ?
    `)
    .get(id);
  if (!row) {
    throw new AppError(
      404,
      'RECOVERY_CASE_NOT_FOUND',
      'Recovery case not found.'
    );
  }
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    restaurantName: row.restaurantName,
    status: row.status,
    food: JSON.parse(row.foodJson),
    pickup: JSON.parse(row.pickupJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function listRecoveryCases(db) {
  return db
    .prepare(`
      SELECT
        id,
        restaurant_id AS restaurantId,
        restaurant_name AS restaurantName,
        status,
        food_json AS foodJson,
        pickup_json AS pickupJson,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM recovery_cases
      ORDER BY created_at DESC
    `)
    .all()
    .map((row) => ({
      id: row.id,
      restaurantId: row.restaurantId,
      restaurantName: row.restaurantName,
      status: row.status,
      food: JSON.parse(row.foodJson),
      pickup: JSON.parse(row.pickupJson),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
}

export function getRecoveryCaseDetails(db, id) {
  const recoveryCase = getRecoveryCase(db, id);
  const attempts = db
    .prepare(`
      SELECT
        q.position,
        q.status,
        q.call_id AS callId,
        r.id AS receiverId,
        r.name AS receiverName,
        r.type AS receiverType,
        c.vapi_call_id AS providerCallId,
        c.summary,
        c.result_json AS resultJson,
        c.created_at AS callCreatedAt,
        c.ended_at AS callEndedAt
      FROM recovery_case_receivers q
      JOIN receivers r ON r.id = q.receiver_id
      LEFT JOIN calls c ON c.id = q.call_id
      WHERE q.recovery_case_id = ?
      ORDER BY q.position
    `)
    .all(id)
    .map((row) => ({
      position: row.position,
      status: row.status,
      callId: row.callId,
      receiver: {
        id: row.receiverId,
        name: row.receiverName,
        type: row.receiverType
      },
      providerCallId: row.providerCallId,
      summary: row.summary,
      result: row.resultJson ? JSON.parse(row.resultJson) : null,
      callCreatedAt: row.callCreatedAt,
      callEndedAt: row.callEndedAt
    }));

  return { ...recoveryCase, attempts };
}
