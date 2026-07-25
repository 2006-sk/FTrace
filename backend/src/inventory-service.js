import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';

function round(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function listIngredients(db) {
  return db
    .prepare(`
      SELECT
        id,
        name,
        unit,
        stock,
        low_stock_threshold AS lowStockThreshold,
        updated_at AS updatedAt
      FROM ingredients
      ORDER BY name
    `)
    .all()
    .map((row) => ({
      ...row,
      lowStock: row.stock <= row.lowStockThreshold
    }));
}

export function updateIngredientStock(db, ingredientId, stock) {
  if (!Number.isFinite(stock) || stock < 0) {
    throw new AppError(
      400,
      'INVALID_STOCK',
      'Stock must be a non-negative number.'
    );
  }

  const result = db
    .prepare(`
      UPDATE ingredients
      SET stock = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(round(stock), new Date().toISOString(), ingredientId);

  if (result.changes === 0) {
    throw new AppError(404, 'INGREDIENT_NOT_FOUND', 'Ingredient not found.');
  }

  return db
    .prepare(`
      SELECT id, name, unit, stock,
        low_stock_threshold AS lowStockThreshold,
        updated_at AS updatedAt
      FROM ingredients WHERE id = ?
    `)
    .get(ingredientId);
}

export function listRecipes(db) {
  const recipes = db
    .prepare(`
      SELECT id, name, price_cents AS priceCents, active, created_at AS createdAt
      FROM recipes
      WHERE active = 1
      ORDER BY name
    `)
    .all();

  const ingredientQuery = db.prepare(`
    SELECT
      i.id,
      i.name,
      i.unit,
      ri.quantity_per_serving AS quantityPerServing
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = ?
    ORDER BY i.name
  `);

  return recipes.map((recipe) => ({
    ...recipe,
    active: Boolean(recipe.active),
    ingredients: ingredientQuery.all(recipe.id)
  }));
}

export function createOrder(db, input) {
  const recipeId = input?.recipeId;
  const quantity = Number(input?.quantity);
  if (!recipeId || !Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(
      400,
      'INVALID_ORDER',
      'recipeId and a positive integer quantity are required.'
    );
  }

  const recipe = db
    .prepare(`
      SELECT id, name, price_cents AS priceCents
      FROM recipes WHERE id = ? AND active = 1
    `)
    .get(recipeId);
  if (!recipe) {
    throw new AppError(404, 'RECIPE_NOT_FOUND', 'Recipe not found.');
  }

  const requirements = db
    .prepare(`
      SELECT
        i.id AS ingredientId,
        i.name,
        i.unit,
        i.stock,
        ri.quantity_per_serving AS quantityPerServing
      FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = ?
    `)
    .all(recipeId)
    .map((item) => ({
      ...item,
      required: round(item.quantityPerServing * quantity)
    }));

  if (requirements.length === 0) {
    throw new AppError(
      409,
      'RECIPE_HAS_NO_INGREDIENTS',
      'Recipe has no ingredient mapping.'
    );
  }

  const shortages = requirements
    .filter((item) => item.stock < item.required)
    .map((item) => ({
      ingredientId: item.ingredientId,
      name: item.name,
      unit: item.unit,
      required: item.required,
      available: item.stock
    }));

  if (shortages.length) {
    throw new AppError(
      409,
      'INSUFFICIENT_INVENTORY',
      'Not enough inventory to complete this order.',
      false,
      { shortages }
    );
  }

  const orderId = `order_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const deductions = [];

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO orders
        (id, recipe_id, quantity, total_cents, status, created_at)
      VALUES (?, ?, ?, ?, 'completed', ?)
    `).run(
      orderId,
      recipeId,
      quantity,
      recipe.priceCents * quantity,
      createdAt
    );

    const updateStock = db.prepare(`
      UPDATE ingredients
      SET stock = stock - ?, updated_at = ?
      WHERE id = ? AND stock >= ?
    `);
    const insertMovement = db.prepare(`
      INSERT INTO inventory_movements
        (id, order_id, ingredient_id, delta, reason, created_at)
      VALUES (?, ?, ?, ?, 'recipe_order', ?)
    `);

    for (const item of requirements) {
      const result = updateStock.run(
        item.required,
        createdAt,
        item.ingredientId,
        item.required
      );
      if (result.changes !== 1) {
        throw new AppError(
          409,
          'INVENTORY_CHANGED',
          'Inventory changed while processing the order. Please retry.',
          true
        );
      }
      insertMovement.run(
        `move_${randomUUID()}`,
        orderId,
        item.ingredientId,
        -item.required,
        createdAt
      );
      deductions.push({
        ingredientId: item.ingredientId,
        name: item.name,
        unit: item.unit,
        deducted: item.required,
        before: item.stock,
        after: round(item.stock - item.required)
      });
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    id: orderId,
    recipe: {
      id: recipe.id,
      name: recipe.name
    },
    quantity,
    totalCents: recipe.priceCents * quantity,
    status: 'completed',
    deductions,
    createdAt
  };
}

export function listOrders(db) {
  return db
    .prepare(`
      SELECT
        o.id,
        o.recipe_id AS recipeId,
        r.name AS recipeName,
        o.quantity,
        o.total_cents AS totalCents,
        o.status,
        o.created_at AS createdAt
      FROM orders o
      JOIN recipes r ON r.id = o.recipe_id
      ORDER BY o.created_at DESC
    `)
    .all();
}

