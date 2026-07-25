'use strict';

/**
 * Seed exactly one weak, general procedure.
 *
 * This is deliberate. If we seed the food-safety procedure the demo has nothing
 * to learn -- the first call would already succeed and the whole claim collapses.
 * Starting with only a generic intro means call one genuinely fails, XTrace
 * extracts the food-safety blocker, and call two to a different shelter succeeds
 * on knowledge that did not exist five minutes earlier.
 */

const store = require('./store');
const { computeConfidence } = require('./confidence');

function seed() {
  if (store.state.procedures.length > 0) return;

  const now = store.nowIso();
  const evidence = { helped: 3, hurt: 1, unclear: 0 };

  store.state.procedures.push({
    id: 'proc_intro_basics',
    task: 'secure_food_donation_pickup',
    scope: { type: 'global', value: null },
    trigger: 'Opening any donation call',
    instruction:
      'Open by naming the restaurant and stating this is a free prepared-food donation.',
    expectedEffect: 'Establish who is calling and why before asking for anything.',
    confidence: computeConfidence(evidence),
    evidence,
    status: 'active',
    origin: 'seed',
    createdFromEpisodeId: null,
    createdAt: now,
    updatedAt: now,
  });

  store.save();
}

module.exports = { seed };
