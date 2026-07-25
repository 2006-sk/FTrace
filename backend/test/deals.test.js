import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendDeal } from '../src/deal-service.js';

test('keeps normal price when demand can clear inventory', () => {
  const result = recommendDeal({
    inventoryCount: 10,
    hoursToExpiry: 4,
    demandLevel: 'high'
  });

  assert.equal(result.action, 'keep_price');
  assert.equal(result.discountPercent, 0);
  assert.equal(result.recoveryQuantity, 0);
});

test('creates a deal for inventory at risk', () => {
  const result = recommendDeal({
    inventoryCount: 20,
    hoursToExpiry: 4,
    demandLevel: 'normal'
  });

  assert.equal(result.action, 'create_deal');
  assert.equal(result.discountPercent, 30);
  assert.ok(result.expectedDealSales > 0);
});

test('XTrace memory can cap an overly aggressive discount', () => {
  const result = recommendDeal({
    inventoryCount: 30,
    hoursToExpiry: 2,
    demandLevel: 'low',
    memory: 'deep_discount_overloaded_kitchen'
  });

  assert.equal(result.discountPercent, 25);
  assert.match(result.reasons.join(' '), /overloaded the kitchen/);
});

test('starts recovery in parallel when one hour remains', () => {
  const result = recommendDeal({
    inventoryCount: 30,
    hoursToExpiry: 1,
    demandLevel: 'low'
  });

  assert.equal(result.action, 'deal_and_recovery');
  assert.ok(result.recoveryQuantity > 0);
});

