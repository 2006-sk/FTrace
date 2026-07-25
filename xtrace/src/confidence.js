'use strict';

/**
 * Deterministic confidence scoring.
 *
 * Laplace-smoothed success rate over procedure feedback:
 *
 *     confidence = (helped + 1) / (helped + hurt + 2)
 *
 * A brand-new procedure with no evidence sits at exactly 0.50, which reads
 * honestly as "we think this might work but have not proven it". The README's
 * worked example (helped 6, hurt 0 -> 0.88) falls straight out of this formula,
 * so the numbers on screen match the spec without any hand-tuning.
 *
 * `unclear` feedback is recorded for the evidence trail but deliberately does
 * not move confidence in either direction.
 */

function computeConfidence(evidence) {
  const helped = Number(evidence && evidence.helped) || 0;
  const hurt = Number(evidence && evidence.hurt) || 0;
  return round2((helped + 1) / (helped + hurt + 2));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { computeConfidence, round2 };
