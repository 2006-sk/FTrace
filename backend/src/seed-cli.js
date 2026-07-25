import { getConfig, loadEnv } from './config.js';
import { openDatabase, seedDatabase } from './database.js';

loadEnv();
const config = getConfig();
const db = openDatabase(config.databasePath);
seedDatabase(db);
console.log('Seeded ingredients and recipes.');
db.close();

