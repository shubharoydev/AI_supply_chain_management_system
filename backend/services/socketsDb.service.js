import path from 'node:path';
import { fileURLToPath } from 'node:url';

let db = null;
let insertStmt = null;

function getDbPath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Place `sockets.db` at backend/ root (per requirement)
  return path.resolve(__dirname, '..', 'sockets.db');
}

export function initSocketsDb() {
  throw new Error('Use initSocketsDbAsync()');
}

export async function initSocketsDbAsync() {
  if (db) return;
  try {
    // Optional dependency: if it fails to load, we fall back to in-memory only.
    const mod = await import('better-sqlite3');
    const Database = mod?.default || mod;
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS socket_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        type TEXT NOT NULL,
        deliveryId TEXT,
        truckId TEXT,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_socket_events_ts ON socket_events(ts);
      CREATE INDEX IF NOT EXISTS idx_socket_events_delivery ON socket_events(deliveryId);
    `);
    insertStmt = db.prepare(
      'INSERT INTO socket_events (ts, type, deliveryId, truckId, payload) VALUES (?, ?, ?, ?, ?)'
    );
    console.log(`SQLite sockets DB ready at ${getDbPath()}`);
  } catch (e) {
    db = null;
    insertStmt = null;
    console.warn('SQLite sockets DB disabled:', e?.message || e);
  }
}

export function persistSocketEvent(type, payload) {
  if (!insertStmt) return;
  try {
    insertStmt.run(
      new Date().toISOString(),
      String(type),
      payload?.deliveryId != null ? String(payload.deliveryId) : null,
      payload?.truckId != null ? String(payload.truckId) : null,
      JSON.stringify(payload ?? {})
    );
  } catch {
    // ignore persistence failures; sockets must remain live
  }
}

