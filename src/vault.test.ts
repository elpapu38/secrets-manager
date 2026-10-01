import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initSchema } from "./db";
import { generarPassword } from "./generator";
import { ClaveIncorrectaError, Vault } from "./vault";

const nuevaDb = () => {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
};

test("guardar y recuperar un secreto", () => {
  const v = Vault.init(nuevaDb(), "clave-maestra-1");
  v.save("gmail", { secreto: "abc123", usuario: "yo@x.com", notas: "personal" });
  assert.deepEqual(v.get("gmail"), { secreto: "abc123", usuario: "yo@x.com", notas: "personal" });
  assert.equal(v.get("no-existe"), null);
  assert.equal(v.count(), 1);
});

test("contraseña maestra incorrecta es rechazada", () => {
  const db = nuevaDb();
  Vault.init(db, "clave-maestra-1");
  assert.throws(() => Vault.unlock(db, "otra-clave"), ClaveIncorrectaError);
  assert.doesNotThrow(() => Vault.unlock(db, "clave-maestra-1"));
});

test("el secreto no queda en texto plano en la base", () => {
  const db = nuevaDb();
  const v = Vault.init(db, "clave-maestra-1");
  v.save("x", { secreto: "SECRETO-UNICO-XYZ" });
  const { blob } = db.prepare("SELECT blob FROM secrets").get() as { blob: Buffer };
  assert.ok(!blob.includes("SECRETO-UNICO-XYZ"));
});

test("intercambiar filas es detectado (el nombre está autenticado)", () => {
  const db = nuevaDb();
  const v = Vault.init(db, "clave-maestra-1");
  v.save("a", { secreto: "1" });
  v.save("b", { secreto: "2" });
  db.prepare("UPDATE secrets SET blob = (SELECT blob FROM secrets WHERE name='b') WHERE name='a'").run();
  assert.throws(() => v.get("a"));
});

test("cambiar contraseña maestra re-cifra todo", () => {
  const db = nuevaDb();
  const v = Vault.init(db, "clave-vieja-123");
  v.save("a", { secreto: "1" });
  v.save("b", { secreto: "2", usuario: "u" });
  assert.equal(v.checkPassword("clave-vieja-123"), true);
  v.changePassword("clave-nueva-456");
  assert.equal(v.checkPassword("clave-vieja-123"), false);
  assert.throws(() => Vault.unlock(db, "clave-vieja-123"), ClaveIncorrectaError);
  const v2 = Vault.unlock(db, "clave-nueva-456");
  assert.equal(v2.get("a")?.secreto, "1");
  assert.equal(v2.get("b")?.usuario, "u");
});

test("buscar, resolver sin distinguir mayúsculas y borrar", () => {
  const v = Vault.init(nuevaDb(), "clave-maestra-1");
  v.save("GitHub", { secreto: "s", usuario: "dev@x.com", notas: "trabajo" });
  v.save("Netflix", { secreto: "s2" });
  assert.equal(v.search("trabajo").length, 1);
  assert.equal(v.search("dev@").length, 1);
  assert.equal(v.search("s2").length, 0); // no busca dentro del secreto
  assert.equal(v.resolve("github"), "GitHub");
  assert.equal(v.remove("Netflix"), true);
  assert.equal(v.count(), 1);
});

test("batch es atómico", () => {
  const v = Vault.init(nuevaDb(), "clave-maestra-1");
  assert.throws(() =>
    v.batch(() => {
      v.save("a", { secreto: "1" });
      throw new Error("falla a mitad");
    })
  );
  assert.equal(v.count(), 0);
});

test("generador: largo, variedad y validación", () => {
  const pw = generarPassword({ largo: 24 });
  assert.equal(pw.length, 24);
  assert.match(pw, /[a-z]/);
  assert.match(pw, /[A-Z]/);
  assert.match(pw, /[0-9]/);
  assert.match(pw, /[^a-zA-Z0-9]/);
  assert.match(generarPassword({ simbolos: false }), /^[a-zA-Z0-9]+$/);
  assert.notEqual(generarPassword(), generarPassword());
  assert.throws(() => generarPassword({ largo: 4 }));
});
