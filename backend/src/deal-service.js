import { AppError } from './errors.js';

export function recommendDeal(input) {
  const inventoryCount = Number(input?.inventoryCount);
  const hoursToExpiry = Number(input?.hoursToExpiry);
  const demandLevel = input?.demandLevel;
  const memory = input?.memory ?? 'none';
  const originalPriceCents = Number.isInteger(input?.originalPriceCents)
    ? input.originalPriceCents
    : 1499;
  const targetSegment =
    input?.targetSegment ?? 'lapsed_guests_30_90_days';

  if (
    !Number.isInteger(inventoryCount) ||
    inventoryCount < 0 ||
    !Number.isFinite(hoursToExpiry) ||
    hoursToExpiry <= 0 ||
    !['low', 'normal', 'high'].includes(demandLevel)
  ) {
    throw new AppError(
      400,
      'INVALID_DEAL_INPUT',
      'inventoryCount, positive hoursToExpiry, and demandLevel are required.'
    );
  }

  const hourlyRate = { low: 0.8, normal: 2, high: 4 }[demandLevel];
  const expectedNormalSales = Math.min(
    inventoryCount,
    Math.round(hourlyRate * hoursToExpiry)
  );
  const atRisk = Math.max(0, inventoryCount - expectedNormalSales);
  let discountPercent = 0;
  const reasons = [];

  if (atRisk > 2) {
    discountPercent =
      hoursToExpiry <= 2 ? 40 : hoursToExpiry <= 4 ? 30 : 20;
    if (demandLevel === 'low') discountPercent += 10;
    reasons.push(`${atRisk} items are unlikely to sell at the normal price.`);
  }

  if (memory === 'similar_30_percent_sold_out' && atRisk > 2) {
    discountPercent = Math.max(discountPercent, 30);
    reasons.push('XTrace: a 30% deal cleared similar inventory.');
  }
  if (memory === 'deep_discount_overloaded_kitchen' && atRisk > 2) {
    discountPercent = Math.min(discountPercent, 25);
    reasons.push('XTrace: a deeper discount previously overloaded the kitchen.');
  }
  if (memory === 'rain_reduced_walk_ins' && atRisk > 2) {
    discountPercent = Math.min(50, discountPercent + 10);
    reasons.push('XTrace: rain previously reduced walk-in demand.');
  }

  const expectedDealSales =
    discountPercent === 0
      ? 0
      : Math.min(
          atRisk,
          Math.round(atRisk * Math.min(0.9, discountPercent / 45))
        );
  const recoveryQuantity = Math.max(
    0,
    inventoryCount - expectedNormalSales - expectedDealSales
  );

  let action = discountPercent ? 'create_deal' : 'keep_price';
  if (hoursToExpiry <= 1 && recoveryQuantity > 0) {
    action = 'deal_and_recovery';
    reasons.push('Start shelter recovery now because only one hour remains.');
  }

  const startsAt = new Date().toISOString();
  const endsAt = new Date(
    Date.parse(startsAt) + (discountPercent
      ? Math.min(120, hoursToExpiry * 60)
      : 0) * 60_000
  ).toISOString();
  const sellQuantity = inventoryCount - recoveryQuantity;
  const dealPriceCents = Math.round(
    originalPriceCents * (1 - discountPercent / 100)
  );

  return {
    action,
    discountPercent,
    durationMinutes: discountPercent ? Math.min(120, hoursToExpiry * 60) : 0,
    startsAt,
    endsAt,
    targetSegment,
    originalPriceCents,
    dealPriceCents,
    sellQuantity,
    donateQuantity: recoveryQuantity,
    expectedNormalSales,
    expectedDealSales,
    recoveryQuantity,
    reasons
  };
}
