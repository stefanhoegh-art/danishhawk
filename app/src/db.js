import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config, ROOT } from './config.js';

mkdirSync(dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);
db.exec(readFileSync(join(ROOT, 'src', 'schema.sql'), 'utf8'));

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
