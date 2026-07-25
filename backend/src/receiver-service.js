import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';

function validateE164(number) {
  return /^\+[1-9]\d{7,14}$/.test(number);
}

export function createReceiver(db, input) {
  if (
    !input?.name ||
    !input?.type ||
    !validateE164(input?.phone)
  ) {
    throw new AppError(
      400,
      'INVALID_RECEIVER',
      'name, type, and an E.164 phone number are required.'
    );
  }

  const id = `recv_${randomUUID()}`;
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO receivers
        (id, name, type, phone_e164, address_json, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      input.name,
      input.type,
      input.phone,
      input.address ? JSON.stringify(input.address) : null,
      now,
      now
    );
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) {
      throw new AppError(
        409,
        'RECEIVER_PHONE_EXISTS',
        'A receiver with this phone number already exists.'
      );
    }
    throw error;
  }
  return getReceiver(db, id);
}

export function getReceiver(db, id) {
  const row = db
    .prepare(`
      SELECT
        id, name, type, phone_e164 AS phone, address_json AS addressJson,
        active, created_at AS createdAt, updated_at AS updatedAt
      FROM receivers WHERE id = ?
    `)
    .get(id);
  if (!row) {
    throw new AppError(404, 'RECEIVER_NOT_FOUND', 'Receiver not found.');
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    phone: row.phone,
    address: row.addressJson ? JSON.parse(row.addressJson) : null,
    active: Boolean(row.active),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function listReceivers(db) {
  return db
    .prepare(`
      SELECT
        id, name, type, phone_e164 AS phone, address_json AS addressJson,
        active, created_at AS createdAt, updated_at AS updatedAt
      FROM receivers WHERE active = 1 ORDER BY name
    `)
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      phone: row.phone,
      address: row.addressJson ? JSON.parse(row.addressJson) : null,
      active: Boolean(row.active),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
}

