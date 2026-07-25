'use strict';

/**
 * In-process store with optional JSON persistence.
 *
 * Kept deliberately simple: the demo needs deterministic reads/writes and a
 * reset button far more than it needs a real database. Every record carries
 * its source and timestamp so nothing in memory is unattributed.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = process.env.XTRACE_DATA_FILE
  ? path.resolve(process.env.XTRACE_DATA_FILE)
  : path.join(__dirname, '..', '.data', 'xtrace-store.json');

const PERSIST = process.env.XTRACE_PERSIST !== 'false';

function emptyState() {
  return {
    procedures: [],
    episodes: [],
    beliefs: [],
    searches: [],
    idempotency: {},
    counters: {},
  };
}

let state = emptyState();

function nowIso() {
  return new Date().toISOString();
}

function nextId(prefix) {
  state.counters[prefix] = (state.counters[prefix] || 0) + 1;
  return `${prefix}_${String(state.counters[prefix]).padStart(3, '0')}`;
}

function save() {
  if (!PERSIST) return;
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    // Persistence is a convenience, never a hard failure during a demo.
    console.warn('[xtrace] could not persist store:', err.message);
  }
}

function load() {
  if (!PERSIST) return false;
  try {
    if (!fs.existsSync(DATA_FILE)) return false;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    state = Object.assign(emptyState(), parsed);
    return true;
  } catch (err) {
    console.warn('[xtrace] could not load store, starting fresh:', err.message);
    state = emptyState();
    return false;
  }
}

function reset() {
  state = emptyState();
  save();
}

module.exports = {
  get state() {
    return state;
  },
  nowIso,
  nextId,
  save,
  load,
  reset,
  DATA_FILE,
};
