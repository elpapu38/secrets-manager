import { timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import { decrypt, deriveKey, encrypt, newSalt } from "./crypto";

export interface Entry {
  usuario?: string;
  secreto: string;
  notas?: string;
}

export interface Registro {
  name: string;
  updated_at: string;
  entry: Entry;
}

export interface ExportedEntry extends Entry {
  nombre: string;
  actualizado: string;
}

export class ClaveIncorrectaError extends Error {
  constructor() {
    super("Contraseña maestra incorrecta.");
    this.name = "ClaveIncorrectaError";
  }
}

const VERIFY_TEXT = "secrets-manager-ok";
const VERIFY_AAD = "__verify__";

export class Vault {
  private constructor(private db: Database.Database, private key: Buffer) {}

  private static meta(db: Database.Database, k: string): Buffer {
    return (db.prepare("SELECT value FROM meta WHERE key = ?").get(k) as { value: Buffer }).value;
  }

  static isInitialized(db: Database.Database): boolean {
    return !!db.prepare("SELECT 1 FROM meta WHERE key = 'salt'").get();
  }

  // Primera vez: crea la sal y un "verificador" cifrado, para poder
  // detectar una contraseña maestra incorrecta más adelante.
  static init(db: Database.Database, password: string): Vault {
    const salt = newSalt();
    const key = deriveKey(password, salt);
    const verify = encrypt(key, VERIFY_TEXT, VERIFY_AAD);
    const put = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
    db.transaction(() => {
      put.run("salt", salt);
      put.run("verify", verify);
    })();
    return new Vault(db, key);
  }

  static unlock(db: Database.Database, password: string): Vault {
    const key = deriveKey(password, Vault.meta(db, "salt"));
    try {
      decrypt(key, Vault.meta(db, "verify"), VERIFY_AAD);
    } catch {
      throw new ClaveIncorrectaError();
    }
    return new Vault(db, key);
  }

  // Re-verifica la contraseña maestra sin abrir otra instancia.
  checkPassword(password: string): boolean {
    const candidate = deriveKey(password, Vault.meta(this.db, "salt"));
    const same = timingSafeEqual(candidate, this.key);
    candidate.fill(0);
    return same;
  }

  // Cambia la contraseña maestra: nueva sal, nueva clave y re-cifrado
  // de TODOS los secretos en una sola transacción (o todo o nada).
  changePassword(newPassword: string): void {
    const rows = this.db.prepare("SELECT name, blob FROM secrets").all() as {
      name: string;
      blob: Buffer;
    }[];
    const plain = rows.map((r) => ({ name: r.name, text: decrypt(this.key, r.blob, r.name) }));
    const salt = newSalt();
    const newKey = deriveKey(newPassword, salt);
    const upd = this.db.prepare("UPDATE secrets SET blob = ? WHERE name = ?");
    const meta = this.db.prepare("UPDATE meta SET value = ? WHERE key = ?");
    this.db.transaction(() => {
      for (const p of plain) upd.run(encrypt(newKey, p.text, p.name), p.name);
      meta.run(salt, "salt");
      meta.run(encrypt(newKey, VERIFY_TEXT, VERIFY_AAD), "verify");
    })();
    this.key.fill(0);
    this.key = newKey;
  }

  save(name: string, entry: Entry): void {
    const blob = encrypt(this.key, JSON.stringify(entry), name);
    this.db
      .prepare(
        `INSERT INTO secrets (name, blob, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at`
      )
      .run(name, blob, new Date().toISOString());
  }

  exists(name: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM secrets WHERE name = ?").get(name);
  }

  get(name: string): Entry | null {
    const row = this.db.prepare("SELECT blob FROM secrets WHERE name = ?").get(name) as
      | { blob: Buffer }
      | undefined;
    return row ? (JSON.parse(decrypt(this.key, row.blob, name)) as Entry) : null;
  }

  // Los nombres se guardan en claro (para poder listar); el contenido, no.
  names(): string[] {
    return (
      this.db.prepare("SELECT name FROM secrets ORDER BY name COLLATE NOCASE").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
  }

  // Nombre exacto, o coincidencia única ignorando mayúsculas.
  resolve(name: string): string | null {
    if (this.exists(name)) return name;
    const matches = this.names().filter((n) => n.toLowerCase() === name.toLowerCase());
    return matches.length === 1 ? matches[0] : null;
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM secrets").get() as { n: number }).n;
  }

  all(): Registro[] {
    const rows = this.db
      .prepare("SELECT name, blob, updated_at FROM secrets ORDER BY name COLLATE NOCASE")
      .all() as { name: string; blob: Buffer; updated_at: string }[];
    return rows.map((r) => ({
      name: r.name,
      updated_at: r.updated_at,
      entry: JSON.parse(decrypt(this.key, r.blob, r.name)) as Entry,
    }));
  }

  // Busca en nombre, usuario y notas (nunca en el secreto).
  search(term: string): Registro[] {
    const t = term.toLowerCase();
    return this.all().filter(
      (r) =>
        r.name.toLowerCase().includes(t) ||
        (r.entry.usuario ?? "").toLowerCase().includes(t) ||
        (r.entry.notas ?? "").toLowerCase().includes(t)
    );
  }

  remove(name: string): boolean {
    return this.db.prepare("DELETE FROM secrets WHERE name = ?").run(name).changes > 0;
  }

  // Ejecuta varias operaciones de forma atómica.
  batch<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  exportAll(): ExportedEntry[] {
    return this.all().map((r) => ({ nombre: r.name, ...r.entry, actualizado: r.updated_at }));
  }

  // Copia consistente de la base (sigue cifrada con la misma contraseña).
  async backup(dest: string): Promise<void> {
    await this.db.backup(dest);
  }

  close(): void {
    this.key.fill(0); // borra la clave de memoria
    this.db.close();
  }
}
