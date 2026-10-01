import * as A from "./acciones";
import { mostrarBanner } from "./banner";
import { copiarTemporal, SEGUNDOS_PORTAPAPELES } from "./clipboard";
import { dbPath } from "./db";
import { generarPassword } from "./generator";
import { ask, pausa } from "./prompt";
import { abrirCarpeta, dirBackups, dirExports, ultimoBackup } from "./rutas";
import { abrirBoveda } from "./session";
import { acortar, ancho, box, c, cabecera, clearScreen, fail, opcionesMenu, padEnd, warn } from "./ui";
import type { Vault } from "./vault";

const LOCK_MIN = Number(process.env.SM_LOCK_MIN) > 0 ? Number(process.env.SM_LOCK_MIN) : 5;
const LOCK_MS = LOCK_MIN * 60_000;
let ultima = Date.now();

// Si pasó mucho tiempo sin actividad, vuelve a pedir la contraseña maestra.
async function guardia(v: Vault): Promise<void> {
  if (Date.now() - ultima > LOCK_MS) {
    clearScreen();
    warn("Sesión bloqueada por inactividad.");
    for (let i = 1; i <= 3; i++) {
      if (v.checkPassword(await ask("Contraseña maestra: ", true))) {
        ultima = Date.now();
        return;
      }
      fail(`Contraseña incorrecta (${i}/3).`);
    }
    v.close();
    clearScreen();
    process.exit(1);
  }
  ultima = Date.now();
}

async function elegir(v: Vault, prompt = "Opción: "): Promise<string> {
  console.log();
  const r = (await ask("  " + c.cyan(prompt))).trim();
  await guardia(v);
  return r;
}

async function ejecutar(fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    fail((e as Error).message);
    await pausa();
  }
}

async function submenu(
  v: Vault,
  titulo: string,
  items: [string, string, string?][],
  acciones: Record<string, () => Promise<void> | void>,
  extra?: () => void
): Promise<void> {
  for (;;) {
    clearScreen();
    cabecera(titulo);
    extra?.();
    opcionesMenu([...items, ["0", "Volver"]]);
    const op = await elegir(v);
    if (op === "0" || op === "") return;
    const fn = acciones[op];
    if (!fn) {
      warn("Opción no válida.");
      await pausa();
      continue;
    }
    await ejecutar(fn);
  }
}

const nombreArchivo = (base: string, ext: string) => `${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;
const fila = (k: string, val: string, nota?: string) =>
  console.log(`  ${c.dim(padEnd(k, 15))}${val}${nota ? "  " + c.dim(nota) : ""}`);

function estadoBackup(): string {
  const u = ultimoBackup();
  if (!u) return c.yellow("nunca ⚠  (hacé uno en la opción 4)");
  const dias = Math.floor((Date.now() - u.getTime()) / 86_400_000);
  const f = u.toISOString().slice(0, 10);
  return dias > 30 ? c.yellow(`${f}  (hace ${dias} días ⚠)`) : c.green(f);
}

// ---------- pantallas ----------
function ubicaciones(): void {
  console.log(c.bold("  Dónde se guarda cada cosa"));
  fila("Bóveda", dbPath(), "cifrada");
  fila("Backups", dirBackups(), "cifrados");
  fila("Exportaciones", dirExports(), "TEXTO PLANO ⚠");
  console.log();
}

async function ayuda(): Promise<void> {
  clearScreen();
  cabecera("Ayuda y ubicaciones");
  ubicaciones();
  console.log(c.bold("  Consejos"));
  const li = (t: string) => console.log(`  ${c.cyan("•")} ${t}`);
  li("Hacé backups seguido y copialos a un pendrive: si falla el disco, se pierde todo.");
  li("Anotá la contraseña maestra en papel y guardala bien: NO se puede recuperar.");
  li("Exportá a JSON solo si lo necesitás y borrá el archivo al terminar.");
  li("Windows: el historial del portapapeles (Win+V) puede conservar lo que copies");
  console.log("    aunque el programa lo borre. Desactivalo en Configuración › Sistema › Portapapeles.");
  console.log();
  console.log(c.bold("  Uso"));
  li("Escribí el número de la opción y Enter. «0» o Enter vuelve atrás. Ctrl+C sale.");
  li("Ventana más grande: maximizala y usá Ctrl + rueda del mouse para agrandar la letra.");
  await pausa();
}

async function detalle(v: Vault, nombre: string): Promise<void> {
  let mostrar = false;
  let aviso = "";
  for (;;) {
    const e = v.get(nombre);
    if (!e) return;
    clearScreen();
    cabecera(nombre);
    console.log(`  ${c.dim("Usuario")}  ${e.usuario ?? c.dim("—")}`);
    console.log(`  ${c.dim("Secreto")}  ${mostrar ? c.green(e.secreto) : c.dim("••••••••••")}`);
    if (e.notas) console.log(`  ${c.dim("Notas  ")}  ${e.notas}`);
    if (aviso) console.log(`\n  ${aviso}`);
    aviso = "";
    console.log();
    opcionesMenu([
      ["1", mostrar ? "Ocultar secreto" : "Mostrar secreto"],
      ["2", "Copiar secreto", `se borra del portapapeles en ${SEGUNDOS_PORTAPAPELES} s`],
      ["3", "Editar"],
      ["4", "Eliminar"],
      ["0", "Volver"],
    ]);
    const op = await elegir(v);
    if (op === "0" || op === "") return;
    if (op === "1") mostrar = !mostrar;
    else if (op === "2") {
      aviso = copiarTemporal(e.secreto)
        ? c.green(`✔ Copiado. Se borra del portapapeles en ${SEGUNDOS_PORTAPAPELES} s.`)
        : c.yellow("⚠ No pude usar el portapapeles; usá «Mostrar secreto».");
    } else if (op === "3") {
      await ejecutar(async () => {
        await A.editar(v, nombre);
        await pausa();
      });
    } else if (op === "4") {
      let borrado = false;
      await ejecutar(async () => {
        borrado = await A.eliminar(v, nombre);
        await pausa();
      });
      if (borrado) return;
    } else aviso = c.yellow("⚠ Opción no válida.");
  }
}

async function verSecretos(v: Vault): Promise<void> {
  let filtro = "";
  for (;;) {
    clearScreen();
    const items = filtro ? v.search(filtro) : v.all();
    cabecera(filtro ? `Resultados para "${filtro}"` : "Tus secretos", `${items.length} secreto(s)`);
    A.tabla(items);
    console.log(
      c.dim(`\n  Número → abrir · texto → buscar · ${filtro ? "Enter → quitar filtro" : "0 → volver"}`)
    );
    const r = await elegir(v, "> ");
    if (/^\d+$/.test(r)) {
      const n = Number(r);
      if (n === 0) return;
      const item = items[n - 1];
      if (item) await detalle(v, item.name);
      else {
        warn("Ese número no está en la lista.");
        await pausa();
      }
    } else if (r === "") {
      if (filtro) filtro = "";
      else return;
    } else filtro = r;
  }
}

async function generador(v: Vault): Promise<void> {
  let largo = 20;
  let simbolos = true;
  let pw = generarPassword({ largo, simbolos });
  let aviso = "";
  for (;;) {
    clearScreen();
    cabecera("Generador de contraseñas");
    console.log(`  ${c.green(c.bold(pw))}`);
    console.log(c.dim(`  ${largo} caracteres · ${simbolos ? "con" : "sin"} símbolos`));
    if (aviso) console.log(`\n  ${aviso}`);
    aviso = "";
    console.log();
    opcionesMenu([
      ["1", "Copiar", `se borra del portapapeles en ${SEGUNDOS_PORTAPAPELES} s`],
      ["2", "Generar otra"],
      ["3", "Cambiar largo"],
      ["4", simbolos ? "Quitar símbolos" : "Incluir símbolos"],
      ["0", "Volver"],
    ]);
    const op = await elegir(v);
    if (op === "0" || op === "") return;
    if (op === "1") {
      aviso = copiarTemporal(pw)
        ? c.green(`✔ Copiada. Se borra del portapapeles en ${SEGUNDOS_PORTAPAPELES} s.`)
        : c.yellow("⚠ No pude usar el portapapeles; copiala a mano.");
    } else if (op === "2") pw = generarPassword({ largo, simbolos });
    else if (op === "3") {
      const n = Number((await ask("  Largo (8-128): ")).trim());
      if (Number.isInteger(n) && n >= 8 && n <= 128) {
        largo = n;
        pw = generarPassword({ largo, simbolos });
      } else aviso = c.yellow("⚠ Largo no válido.");
    } else if (op === "4") {
      simbolos = !simbolos;
      pw = generarPassword({ largo, simbolos });
    } else aviso = c.yellow("⚠ Opción no válida.");
  }
}

// ---------- menú principal ----------
export async function menuPrincipal(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("El menú necesita una terminal interactiva. Usá los comandos directos (sm --help).");
  }
  const v = await abrirBoveda();
  ultima = Date.now();
  try {
    for (;;) {
      clearScreen();
      mostrarBanner();
      console.log();
      console.log(
        box(
          [
            `${c.dim(padEnd("Secretos", 10))}${c.bold(String(v.count()))}      ${c.dim("Autobloqueo")}  ${LOCK_MIN} min`,
            `${c.dim(padEnd("Backup", 10))}${estadoBackup()}`,
            `${c.dim(padEnd("Bóveda", 10))}${acortar(dbPath(), ancho() - 20)}`,
          ],
          ancho() - 4
        )
      );
      console.log();
      opcionesMenu([
        ["1", "Nuevo secreto", "escribilo o generalo"],
        ["2", "Ver y buscar secretos", "abrir, copiar, editar, eliminar"],
        ["3", "Generar contraseña", "aleatoria y segura"],
        ["4", "Backup, exportar, importar", "copias y traslado de datos"],
        ["5", "Seguridad", "cambiar contraseña maestra"],
        ["6", "Ayuda y ubicaciones", "dónde se guarda todo"],
        ["0", "Salir"],
      ]);
      const op = await elegir(v);
      if (op === "0" || op.toLowerCase() === "q") break;
      if (op === "") continue;
      if (op === "1") {
        await ejecutar(async () => {
          const nombre = (await ask("  Nombre (ej: gmail, github): ")).trim();
          if (!nombre) return;
          await A.guardar(v, nombre, { interactivo: true });
          await pausa();
        });
      } else if (op === "2") await ejecutar(() => verSecretos(v));
      else if (op === "3") await ejecutar(() => generador(v));
      else if (op === "4") {
        await submenu(
          v,
          "Backup, exportar e importar",
          [
            ["1", "Backup cifrado (recomendado)", "va a la carpeta de backups"],
            ["2", "Exportar a JSON", "TEXTO PLANO · va a la carpeta de exportaciones"],
            ["3", "Importar desde JSON", "busca en la carpeta de exportaciones"],
            ["4", "Abrir carpeta de backups"],
            ["5", "Abrir carpeta de exportaciones"],
          ],
          {
            "1": async () => {
              await A.backup(v);
              await pausa();
            },
            "2": async () => {
              const def = nombreArchivo("sm-export", "json");
              const f = (await ask(`  Nombre del archivo [${def}]: `)).trim() || def;
              await A.exportar(v, f);
              await pausa();
            },
            "3": async () => {
              const f = (await ask("  Archivo JSON a importar (nombre o ruta): ")).trim();
              if (!f) return;
              A.importar(v, f);
              await pausa();
            },
            "4": () => abrirCarpeta(dirBackups()),
            "5": () => abrirCarpeta(dirExports()),
          },
          ubicaciones
        );
      } else if (op === "5") {
        await submenu(
          v,
          "Seguridad",
          [
            ["1", "Cambiar contraseña maestra", "re-cifra todos los secretos"],
            ["2", "Información de la bóveda"],
          ],
          {
            "1": async () => {
              await A.cambiarMaestra(v);
              await pausa();
            },
            "2": async () => {
              A.info(v);
              await pausa();
            },
          }
        );
      } else if (op === "6") await ayuda();
      else {
        warn("Opción no válida.");
        await pausa();
      }
    }
  } finally {
    v.close();
    clearScreen();
    console.log("Bóveda cerrada.");
  }
}
