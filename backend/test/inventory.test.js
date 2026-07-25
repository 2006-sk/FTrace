import assert from 'node:assert/strict';
import test from 'node:test';
import { openDatabase, seedDatabase } from '../src/database.js';
import {
  createOrder,
  listIngredients,
  listRecipes
} from '../src/inventory-service.js';

function setup() {
  const db = openDatabase(':memory:');
  seedDatabase(db);
  return db;
}

test('seed data includes biryani with four ingredient mappings', () => {
  const db = setup();
  const biryani = listRecipes(db).find(
    (recipe) => recipe.id === 'recipe_biryani'
  );

  assert.ok(biryani);
  assert.equal(biryani.ingredients.length, 4);
  assert.deepEqual(
    biryani.ingredients.map((item) => item.name).sort(),
    ['Basmati rice', 'Chicken', 'Onion', 'Yogurt']
  );
  db.close();
});

test('ordering ten biryanis atomically deducts all four ingredients', () => {
  const db = setup();
  const order = createOrder(db, {
    recipeId: 'recipe_biryani',
    quantity: 10
  });

  assert.equal(order.quantity, 10);
  assert.equal(order.totalCents, 14990);
  assert.deepEqual(
    Object.fromEntries(
      order.deductions.map((item) => [item.name, item.deducted])
    ),
    {
      'Basmati rice': 2,
      Chicken: 2.5,
      Onion: 0.5,
      Yogurt: 0.4
    }
  );

  const stock = Object.fromEntries(
    listIngredients(db).map((item) => [item.name, item.stock])
  );
  assert.equal(stock['Basmati rice'], 23);
  assert.equal(stock.Chicken, 27.5);
  assert.equal(stock.Onion, 11.5);
  assert.equal(stock.Yogurt, 9.6);
  db.close();
});

test('insufficient inventory rejects order without partial deductions', () => {
  const db = setup();
  db.prepare(`UPDATE ingredients SET stock = 1 WHERE id = 'ing_chicken'`).run();
  const before = listIngredients(db);

  assert.throws(
    () =>
      createOrder(db, {
        recipeId: 'recipe_biryani',
        quantity: 10
      }),
    (error) => error.code === 'INSUFFICIENT_INVENTORY'
  );

  assert.deepEqual(listIngredients(db), before);
  const orderCount = db.prepare('SELECT COUNT(*) AS count FROM orders').get();
  assert.equal(orderCount.count, 0);
  db.close();
});

