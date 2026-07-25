'use strict';

/**
 * XTrace memory service -- Kenil.
 *
 * The backend (Shresth) is this service's only client. Endpoints follow
 * README_KENIL_XTRACE.md exactly; extra response fields are additive so the
 * frontend can badge learned procedures without breaking the contract.
 *
 *   POST /xtrace/v1/guidance/search       load knowledge before a call
 *   POST /xtrace/v1/episodes              record a completed attempt
 *   POST /xtrace/v1/beliefs               add an attributed claim
 *   GET  /xtrace/v1/cases/:caseId/conflicts
 *   GET  /xtrace/v1/procedures            inspect memory (demo panel)
 *   POST /xtrace/v1/admin/reset           reset between demo runs
 *   GET  /health
 */

// Must run before anything that reads process.env at module load (xtraceClient).
require('./src/env').loadEnv();

const http = require('http');
const store = require('./src/store');
const { seed } = require('./src/seed');
const guidance = require('./src/guidance');
const episodes = require('./src/episodes');
const beliefs = require('./src/beliefs');
const xtrace = require('./src/xtraceClient');

const PORT = Number(process.env.XTRACE_PORT || 7070);
const TOKEN = process.env.XTRACE_SERVICE_TOKEN || 'dev-token';
const REQUIRE_AUTH = process.env.XTRACE_REQUIRE_AUTH !== 'false';

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
}

function fail(res, status, code, message, retryable = false) {
  send(res, status, {
    error: { code, message, retryable, requestId: store.nextId('req') },
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) reject(new Error('payload too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function authorized(req) {
  if (!REQUIRE_AUTH) return true;
  const header = req.headers.authorization || '';
  return header === `Bearer ${TOKEN}`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (pathname === '/health') {
    return send(res, 200, {
      ok: true,
      service: 'xtrace-memory',
      hostedXTrace: xtrace.isEnabled() ? 'connected' : 'local-only',
      procedures: store.state.procedures.length,
      episodes: store.state.episodes.length,
      beliefs: store.state.beliefs.length,
    });
  }

  if (!pathname.startsWith('/xtrace/v1')) {
    return fail(res, 404, 'NOT_FOUND', `No route for ${req.method} ${pathname}`);
  }

  if (!authorized(req)) {
    return fail(res, 401, 'UNAUTHORIZED', 'Missing or invalid service token.');
  }

  try {
    if (req.method === 'POST' && pathname === '/xtrace/v1/guidance/search') {
      const body = await readJson(req);
      if (!body.task) return fail(res, 422, 'INVALID_REQUEST', 'task is required.');
      const result = await guidance.search(body);
      return send(res, 200, result);
    }

    if (req.method === 'POST' && pathname === '/xtrace/v1/episodes') {
      const body = await readJson(req);
      if (!body.task) return fail(res, 422, 'INVALID_REQUEST', 'task is required.');
      if (!body.outcome || !body.outcome.status) {
        return fail(res, 422, 'INVALID_REQUEST', 'outcome.status is required.');
      }
      const result = await episodes.ingest(body);
      return send(res, 200, result);
    }

    if (req.method === 'POST' && pathname === '/xtrace/v1/beliefs') {
      const body = await readJson(req);
      if (!body.claim || !body.subject) {
        return fail(res, 422, 'INVALID_REQUEST', 'subject and claim are required.');
      }
      const belief = beliefs.add(body);
      return send(res, 200, { id: belief.id, stored: true });
    }

    const conflictMatch = pathname.match(/^\/xtrace\/v1\/cases\/([^/]+)\/conflicts$/);
    if (req.method === 'GET' && conflictMatch) {
      return send(res, 200, beliefs.conflictsForCase(conflictMatch[1]));
    }

    if (req.method === 'GET' && pathname === '/xtrace/v1/procedures') {
      return send(res, 200, { procedures: store.state.procedures });
    }

    if (req.method === 'POST' && pathname === '/xtrace/v1/admin/reset') {
      store.reset();
      seed();
      return send(res, 200, { reset: true, procedures: store.state.procedures.length });
    }

    return fail(res, 404, 'NOT_FOUND', `No route for ${req.method} ${pathname}`);
  } catch (err) {
    console.error('[xtrace] error:', err);
    return fail(res, 400, 'BAD_REQUEST', err.message, true);
  }
});

if (require.main === module) {
  store.load();
  seed();
  server.listen(PORT, () => {
    console.log(`[xtrace] memory service on http://localhost:${PORT}`);
    console.log(`[xtrace] hosted XTrace: ${xtrace.isEnabled() ? 'ENABLED' : 'local-only (set XTRACE_API_KEY)'}`);
    console.log(`[xtrace] auth: ${REQUIRE_AUTH ? `Bearer ${TOKEN}` : 'disabled'}`);
  });
}

module.exports = { server };
