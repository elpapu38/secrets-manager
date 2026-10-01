import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function dbPath(): string {
  return process.env.SM_DB ?? path.join(os.homedir(), ".secrets-manager", "vault.db");
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS secrets (
      name       TEXT PRIMARY KEY,
      blob       BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function openDb(file: string = dbPath()): Database.Database {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new Database(file);
  initSchema(db);
  try {
    fs.chmodSync(file, 0o600); // solo el dueño (en Windows no aplica, pero no molesta)
  } catch {}
  return db;
}
