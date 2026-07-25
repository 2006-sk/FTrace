'use strict';

/**
 * Turn a failed call into a reusable procedure.
 *
 * Selection and confidence are deterministic (see confidence.js). Extraction is
 * deterministic first: a known blocker reason maps to a known instruction. Only
 * when the reason is unrecognised do we fall back to keyword evidence from the
 * transcript observations, so a surprise rejection still teaches us something.
 */

// Blocker reason -> the instruction that would have prevented it.
const REASON_PLAYBOOK = {
  food_safety_information_missing: {
    instruction:
      'Lead with current temperature, when the food came off the line, and the safe-until time before asking for acceptance.',
    trigger: 'Opening a donation call involving prepared food',
    expectedEffect: 'Resolve the food-safety blocker before asking for acceptance.',
    scopeType: 'receiver_type',
  },
  allergen_information_missing: {
    instruction: 'State the allergens present before asking for acceptance.',
    trigger: 'Opening a donation call for food containing common allergens',
    expectedEffect: 'Prevent an allergen question from stalling the call.',
    scopeType: 'receiver_type',
  },
  wrong_contact: {
    instruction: 'Ask for the kitchen directly instead of the front desk.',
    trigger: 'Reaching a receiver switchboard or front desk',
    expectedEffect: 'Reach someone with authority to accept the donation.',
    scopeType: 'receiver',
  },
  pickup_window_too_late: {
    instruction:
      'Confirm their latest intake time first, then offer the earliest possible pickup window.',
    trigger: 'Proposing a pickup time',
    expectedEffect: 'Avoid proposing a window the receiver has already closed.',
    scopeType: 'receiver_type',
  },
  capacity_unknown: {
    instruction: 'Ask how many meals they can take tonight before describing the full quantity.',
    trigger: 'Describing donation quantity',
    expectedEffect: 'Let the receiver accept a partial amount instead of declining outright.',
    scopeType: 'receiver_type',
  },
  no_transport: {
    instruction: 'State up front whether delivery is included or pickup is required.',
    trigger: 'Opening a donation call',
    expectedEffect: 'Surface the transport constraint before it ends the call.',
    scopeType: 'receiver_type',
  },
};

// Fallback: what the receiver actually asked about, when the reason is unknown.
const KEYWORD_RULES = [
  {
    match: /(temperature|came off the line|how long|held at|hot|cold|refrigerat)/i,
    reason: 'food_safety_information_missing',
  },
  { match: /(allergen|dairy|nut|gluten|shellfish)/i, reason: 'allergen_information_missing' },
  { match: /(kitchen|manager|front desk|wrong (person|number)|who handles)/i, reason: 'wrong_contact' },
  { match: /(close|closed|cutoff|too late|by \d|intake ends)/i, reason: 'pickup_window_too_late' },
  { match: /(how many|capacity|too much|can only take|room for)/i, reason: 'capacity_unknown' },
  { match: /(deliver|driver|transport|pick ?up ourselves|we cannot collect)/i, reason: 'no_transport' },
];

function inferReason(outcome, observations) {
  const declared = outcome && outcome.reason;
  if (declared && REASON_PLAYBOOK[declared]) return declared;

  const haystack = (observations || [])
    .map((o) => String((o && o.statement) || ''))
    .join(' ');

  for (const rule of KEYWORD_RULES) {
    if (rule.match.test(haystack)) return rule.reason;
  }
  return null;
}

/**
 * @returns {null | {reason, instruction, trigger, expectedEffect, scopeType}}
 */
function extractCandidate({ outcome, observations }) {
  const status = outcome && outcome.status;
  // Only failures teach a new procedure. Successes reinforce existing ones.
  if (status !== 'rejected' && status !== 'failed' && status !== 'no_answer') return null;

  const reason = inferReason(outcome, observations);
  if (!reason) return null;

  return Object.assign({ reason }, REASON_PLAYBOOK[reason]);
}

module.exports = { extractCandidate, REASON_PLAYBOOK };
