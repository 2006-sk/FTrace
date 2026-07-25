'use strict';

/**
 * Minimal .env loader. Node's --env-file needs 20.6+ and errors on a missing
 * file, so we do it here instead: zero dependencies, works on Node 18, and a
 * missing .env is simply a no-op (local-memory mode).
 *
 * Real environment variables always win, so `XTRACE_API_KEY=... npm start`
 * overrides the file.
 */

const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  const target = file || path.join(__dirname, '..', '.env');
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch {
    return false; // No .env — fine.
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Strip one matching pair of surrounding quotes.
    if (value.length >= 2 && ((value[0] === '"' && value.endsWith('"')) ||
        (value[0] === "'" && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

module.exports = { loadEnv };
