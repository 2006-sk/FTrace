import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const schema = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL,
    stock REAL NOT NULL CHECK (stock >= 0),
    low_stock_threshold REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recipe_ingredients (
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    quantity_per_serving REAL NOT NULL CHECK (quantity_per_serving > 0),
    PRIMARY KEY (recipe_id, ingredient_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES orders(id),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    delta REAL NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recovery_cases (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    restaurant_name TEXT,
    status TEXT NOT NULL,
    food_json TEXT NOT NULL,
    pickup_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS receivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    phone_e164 TEXT NOT NULL UNIQUE,
    address_json TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    recovery_case_id TEXT REFERENCES recovery_cases(id),
    receiver_id TEXT,
    vapi_call_id TEXT UNIQUE,
    destination TEXT NOT NULL,
    status TEXT NOT NULL,
    guidance_json TEXT,
    summary TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recovery_case_receivers (
    recovery_case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES receivers(id),
    position INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    call_id TEXT REFERENCES calls(id),
    PRIMARY KEY (recovery_case_id, receiver_id)
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    received_at TEXT NOT NULL,
    PRIMARY KEY (provider, event_id)
  );
`;

export function openDatabase(databasePath) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }
  const db = new DatabaseSync(databasePath);
  db.exec(schema);
  ensureColumn(db, 'recovery_cases', 'restaurant_name', 'TEXT');
  ensureColumn(db, 'calls', 'result_json', 'TEXT');
  ensureColumn(db, 'calls', 'ended_at', 'TEXT');
  return db;
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function seedDatabase(db) {
  const now = new Date().toISOString();

  const ingredients = [
    ['ing_rice', 'Basmati rice', 'kg', 25, 5],
    ['ing_chicken', 'Chicken', 'kg', 30, 5],
    ['ing_onion', 'Onion', 'kg', 12, 2],
    ['ing_yogurt', 'Yogurt', 'kg', 10, 2],
    ['ing_tomato', 'Tomato', 'kg', 15, 3],
    ['ing_pasta', 'Pasta', 'kg', 20, 4]
  ];

  const insertIngredient = db.prepare(`
    INSERT OR IGNORE INTO ingredients
      (id, name, unit, stock, low_stock_threshold, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const ingredient of ingredients) {
    insertIngredient.run(...ingredient, now);
  }

  const insertRecipe = db.prepare(`
    INSERT OR IGNORE INTO recipes
      (id, name, price_cents, active, created_at)
    VALUES (?, ?, ?, 1, ?)
  `);
  insertRecipe.run('recipe_biryani', 'Chicken Biryani', 1499, now);
  insertRecipe.run('recipe_tomato_pasta', 'Tomato Pasta', 1199, now);

  const insertRecipeIngredient = db.prepare(`
    INSERT OR IGNORE INTO recipe_ingredients
      (recipe_id, ingredient_id, quantity_per_serving)
    VALUES (?, ?, ?)
  `);

  const biryaniIngredients = [
    ['ing_rice', 0.2],
    ['ing_chicken', 0.25],
    ['ing_onion', 0.05],
    ['ing_yogurt', 0.04]
  ];
  for (const [ingredientId, quantity] of biryaniIngredients) {
    insertRecipeIngredient.run('recipe_biryani', ingredientId, quantity);
  }

  const pastaIngredients = [
    ['ing_pasta', 0.18],
    ['ing_tomato', 0.15],
    ['ing_onion', 0.03]
  ];
  for (const [ingredientId, quantity] of pastaIngredients) {
    insertRecipeIngredient.run(
      'recipe_tomato_pasta',
      ingredientId,
      quantity
    );
  }
}
