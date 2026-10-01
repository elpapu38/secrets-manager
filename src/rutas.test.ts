import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { render } from "./banner";
import { destinoBackup, destinoExport, origenImport, ultimoBackup } from "./rutas";

const base = fs.mkdtempSync(path.join(os.tmpdir(), "sm-test-"));
process.env.SM_DB = path.join(base, "vault.db");

test("exportar: solo nombre → carpeta exports; con carpeta → se respeta", () => {
  assert.equal(destinoExport("a.json"), path.join(base, "exports", "a.json"));
  assert.equal(destinoExport(path.join(base, "otra", "b.json")), path.join(base, "otra", "b.json"));
});

test("backup: solo nombre → carpeta backups; sin nombre → null", () => {
  assert.equal(destinoBackup("x.db"), path.join(base, "backups", "x.db"));
  assert.equal(destinoBackup(), null);
});

test("importar: encuentra el archivo en exports si solo se da el nombre", () => {
  fs.mkdirSync(path.join(base, "exports"), { recursive: true });
  fs.writeFileSync(path.join(base, "exports", "z.json"), "[]");
  assert.equal(origenImport("z.json"), path.join(base, "exports", "z.json"));
});

test("último backup: null sin backups, fecha con backups", () => {
  assert.equal(ultimoBackup(), null);
  fs.mkdirSync(path.join(base, "backups"), { recursive: true });
  fs.writeFileSync(path.join(base, "backups", "v.db"), "x");
  assert.ok(ultimoBackup() instanceof Date);
});

test("banner: todas las filas tienen el mismo ancho", () => {
  for (const palabra of ["SECRETS", "MANAGER"]) {
    const filas = render(palabra);
    assert.equal(filas.length, 6);
    assert.equal(new Set(filas.map((f) => f.length)).size, 1);
  }
});
