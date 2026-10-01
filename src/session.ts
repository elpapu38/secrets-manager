import { dbPath, openDb } from "./db";
import { ask } from "./prompt";
import { c, fail } from "./ui";
import { ClaveIncorrectaError, Vault } from "./vault";

export const MIN_MAESTRA = 10;

export async function pedirMaestraNueva(label = "Nueva contraseña maestra: "): Promise<string> {
  const p1 = await ask(label, true);
  if (p1.length < MIN_MAESTRA) {
    throw new Error(`La contraseña maestra debe tener al menos ${MIN_MAESTRA} caracteres.`);
  }
  const p2 = await ask("Repetila: ", true);
  if (p1 !== p2) throw new Error("Las contraseñas no coinciden.");
  return p1;
}

export async function abrirBoveda(): Promise<Vault> {
  const db = openDb();
  if (!Vault.isInitialized(db)) {
    console.log("Primera vez: vamos a crear tu bóveda.");
    console.log(`Se guardará en: ${c.bold(dbPath())}`);
    console.log(`${c.yellow("⚠")} Si olvidás la contraseña maestra NO hay forma de recuperar los datos.\n`);
    return Vault.init(db, await pedirMaestraNueva());
  }
  for (let intento = 1; ; intento++) {
    try {
      return Vault.unlock(db, await ask("Contraseña maestra: ", true));
    } catch (e) {
      if (!(e instanceof ClaveIncorrectaError) || intento >= 3) throw e;
      fail(`Contraseña incorrecta (${intento}/3).`);
    }
  }
}

export async function conBoveda(fn: (v: Vault) => Promise<void> | void): Promise<void> {
  const vault = await abrirBoveda();
  try {
    await fn(vault);
  } finally {
    vault.close();
  }
}
