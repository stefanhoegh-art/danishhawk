import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config, ROOT } from './config.js';

mkdirSync(dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);
db.exec(readFileSync(join(ROOT, 'src', 'schema.sql'), 'utf8'));

/* CREATE TABLE IF NOT EXISTS does nothing to a table that already exists, so a
   database made before a column was added would still be missing it. Adding the
   column here keeps an existing shop working across an update; SQLite only
   allows this for columns with a constant default, which is all of ours. */
function addColumn(table, column, definition) {
  const has = db
    .prepare(`SELECT 1 FROM pragma_table_info(:table) WHERE name = :column`)
    .get({ table, column });
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumn('products', 'pricing', `TEXT NOT NULL DEFAULT ''`);
addColumn('products', 'enquiry_only', 'INTEGER NOT NULL DEFAULT 0');
addColumn('product_options', 'type', `TEXT NOT NULL DEFAULT 'choice'`);
addColumn('product_options', 'min_value', 'REAL NOT NULL DEFAULT 0');
addColumn('product_options', 'max_value', 'REAL NOT NULL DEFAULT 0');
addColumn('product_options', 'step_value', 'REAL NOT NULL DEFAULT 1');
addColumn('product_options', 'unit', `TEXT NOT NULL DEFAULT ''`);

/** Run a query and return every row. */
export function all(sql, params = {}) {
  return db.prepare(sql).all(params);
}

/** Run a query and return the first row, or undefined. */
export function get(sql, params = {}) {
  return db.prepare(sql).get(params);
}

/** Execute a statement; returns { changes, lastInsertRowid }. */
export function run(sql, params = {}) {
  return db.prepare(sql).run(params);
}

/** Wrap fn in a transaction, rolling back if it throws. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = :key', { key });
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export function setSetting(key, value) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (:key, :value, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    { key, value: JSON.stringify(value) }
  );
}

/** node:sqlite rejects undefined and booleans; normalise before binding. */
export function bindable(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) out[k] = null;
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else out[k] = v;
  }
  return out;
}
