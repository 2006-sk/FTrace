import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.js';

export function verifyWebhookToken(headers, expectedToken) {
  if (!expectedToken) return true;
  const authorization = headers.authorization ?? '';
  const received = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : headers['x-vapi-secret'] ?? '';

  const expectedBuffer = Buffer.from(expectedToken);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function normalizeVapiEvent(payload, rawBody) {
  const message = payload?.message ?? payload;
  const call = message?.call ?? payload?.call ?? {};
  const type = message?.type ?? payload?.type ?? 'unknown';
  const eventId =
    message?.id ??
    payload?.eventId ??
    createHash('sha256')
      .update(`${type}:${call.id ?? ''}:${rawBody}`)
      .digest('hex');

  const statusMap = {
    queued: 'queued',
    ringing: 'ringing',
    'in-progress': 'in_progress',
    active: 'in_progress',
    ended: 'ended',
    failed: 'failed'
  };

  let status = statusMap[call.status] ?? call.status ?? 'unknown';
  if (type === 'end-of-call-report') status = 'ended';

  return {
    eventId,
    type,
    vapiCallId: call.id ?? null,
    internalCallId:
      call.metadata?.internalCallId ??
      message?.metadata?.internalCallId ??
      null,
    status,
    summary:
      message?.analysis?.summary ??
      call?.analysis?.summary ??
      message?.summary ??
      null,
    structuredData:
      message?.analysis?.structuredData ??
      call?.analysis?.structuredData ??
      payload?.analysis?.structuredData ??
      null,
    endedReason:
      message?.endedReason ?? call?.endedReason ?? payload?.endedReason ?? null,
    raw: payload
  };
}

export function processVapiWebhook(db, event, rawBody) {
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO webhook_events
        (provider, event_id, payload_json, received_at)
      VALUES ('vapi', ?, ?, ?)
    `).run(event.eventId, rawBody, now);
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) {
      return { received: true, duplicate: true };
    }
    throw error;
  }

  if (event.vapiCallId || event.internalCallId) {
    const result = db
      .prepare(`
        UPDATE calls
        SET
          status = ?,
          summary = COALESCE(?, summary),
          updated_at = ?
        WHERE vapi_call_id = ? OR id = ?
      `)
      .run(
        event.status,
        event.summary,
        now,
        event.vapiCallId,
        event.internalCallId
      );

    if (result.changes === 0 && event.internalCallId) {
      throw new AppError(
        404,
        'CALL_NOT_FOUND',
        'Webhook referenced an unknown internal call.'
      );
    }
  }

  return { received: true, duplicate: false };
}
