import fs from "node:fs";
import path from "node:path";
import { copiarTemporal, SEGUNDOS_PORTAPAPELES } from "./clipboard";
import { dbPath } from "./db";
import { generarPassword } from "./generator";
import { ask, askDefault, confirmar } from "./prompt";
import { destinoBackup, destinoExport, dirBackups, dirExports, origenImport, ultimoBackup } from "./rutas";
import { pedirMaestraNueva } from "./session";
import { c, ok, padEnd, warn } from "./ui";
import type { Registro, Vault } from "./vault";

// ---------- helpers ----------
export function validarNombre(n: string): string {
  const nombre = n.trim();
  if (!nombre) throw new Error("El nombre no puede estar vacío.");
  if (nombre.length > 100) throw new Error("El nombre es demasiado largo (máx. 100).");
  if (/[\x00-\x1f]/.test(nombre)) throw new Error("El nombre tiene caracteres no válidos.");
  return nombre;
}

function resolver(v: Vault, nombre: string): string {
  const n = nombre.trim();
  const r = v.resolve(n);
  if (r) return r;
  const parecidos = v
    .names()
    .filter((x) => x.toLowerCase().includes(n.toLowerCase()))
    .slice(0, 5);
  throw new Error(
    `No existe "${n}".` + (parecidos.length ? ` ¿Quisiste decir: ${parecidos.join(", ")}?` : "")
  );
}

async function pedirSecreto(): Promise<string> {
  const s1 = await ask("Secreto (no se muestra): ", true);
  if (!s1) throw new Error("El secreto no puede estar vacío.");
  const s2 = await ask("Repetí el secreto: ", true);
  if (s1 !== s2) throw new Error("Los secretos no coinciden. No se guardó nada.");
  return s1;
}

interface SecretoOpts {
  generar?: boolean;
  largo?: number;
  simbolos?: boolean;
  interactivo?: boolean;
}

async function secretoNuevo(o: SecretoOpts): Promise<{ secreto: string; generado: boolean }> {
  let generar = o.generar;
  if (generar === undefined && o.interactivo) {
    console.log(`\n  ${c.cyan("1")}  Escribir el secreto yo\n  ${c.cyan("2")}  Generar uno automáticamente`);
    generar = (await ask("Opción [1]: ")).trim() === "2";
  }
  if (generar) {
    return { secreto: generarPassword({ largo: o.largo, simbolos: o.simbolos }), generado: true };
  }
  return { secreto: await pedirSecreto(), generado: false };
}

function entregar(secreto: string, etiqueta: string): void {
  if (copiarTemporal(secreto)) {
    ok(`${etiqueta} copiada al portapapeles (se borra en ${SEGUNDOS_PORTAPAPELES} s).`);
  } else {
    warn("No pude usar el portapapeles en este sistema.");
    console.log(`  ${etiqueta}: ${c.green(secreto)}`);
  }
}

const fecha = (iso: string): string => iso.slice(0, 10);
const stamp = (): string => new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);

// ---------- acciones ----------
export interface GuardarOpts extends SecretoOpts {
  usuario?: string;
  notas?: string;
}

export async function guardar(v: Vault, nombreRaw: string, o: GuardarOpts = {}): Promise<void> {
  const nombre = validarNombre(nombreRaw);
  if (v.exists(nombre) && !(await confirmar(`"${nombre}" ya existe. ¿Sobrescribir?`))) {
    console.log("Cancelado.");
    return;
  }
  let { usuario, notas } = o;
  if (o.interactivo) {
    usuario ??= (await ask("Usuario/email (opcional): ")).trim() || undefined;
    notas ??= (await ask("Notas (opcional): ")).trim() || undefined;
  }
  // El secreto se pide por prompt (no como argumento) para que no quede en el historial del shell.
  const { secreto, generado } = await secretoNuevo(o);
  v.save(nombre, { secreto, usuario, notas });
  ok(`Guardado "${nombre}".`);
  if (generado) entregar(secreto, "Contraseña generada");
}

export function obtener(
  v: Vault,
  nombre: string,
  o: { soloSecreto?: boolean; copiar?: boolean } = {}
): void {
  const n = resolver(v, nombre);
  const e = v.get(n)!;
  if (o.copiar) {
    if (!copiarTemporal(e.secreto)) throw new Error("No pude acceder al portapapeles en este sistema.");
    if (e.usuario) console.log(`Usuario: ${e.usuario}`);
    ok(`Secreto copiado. Se borra en ${SEGUNDOS_PORTAPAPELES} s (Ctrl+C lo borra ya).`);
    return;
  }
  if (o.soloSecreto) return void console.log(e.secreto);
  if (e.usuario) console.log(`Usuario: ${e.usuario}`);
  console.log(`Secreto: ${e.secreto}`);
  if (e.notas) console.log(`Notas:   ${e.notas}`);
}

export function tabla(items: Registro[]): void {
  if (!items.length) return void console.log(c.dim("  (nada para mostrar)"));
  const wn = Math.max(6, ...items.map((i) => i.name.length));
  const wu = Math.max(7, ...items.map((i) => (i.entry.usuario ?? "").length));
  console.log(c.dim(`  ${"#".padEnd(3)} ${"Nombre".padEnd(wn)}  ${"Usuario".padEnd(wu)}  Actualizado`));
  items.forEach((i, idx) => {
    console.log(
      `  ${padEnd(c.cyan(String(idx + 1)), 3)} ${i.name.padEnd(wn)}  ${(i.entry.usuario ?? "").padEnd(wu)}  ${c.dim(fecha(i.updated_at))}`
    );
  });
}

export function listar(v: Vault): void {
  const items = v.all();
  if (!items.length) return void console.log("La bóveda está vacía.");
  tabla(items);
  console.log(c.dim(`\n  ${items.length} secreto(s)`));
}

export function buscar(v: Vault, texto: string): void {
  const items = v.search(texto);
  if (!items.length) return void console.log(`Sin resultados para "${texto}".`);
  tabla(items);
}

export async function editar(v: Vault, nombre: string): Promise<void> {
  const n = resolver(v, nombre);
  const e = v.get(n)!;
  console.log(c.dim("Enter mantiene el valor actual · «-» lo borra.\n"));
  const usuario = await askDefault("Usuario", e.usuario);
  const notas = await askDefault("Notas", e.notas);
  let secreto = e.secreto;
  let generado = false;
  if (await confirmar("¿Cambiar el secreto?")) {
    ({ secreto, generado } = await secretoNuevo({ interactivo: true }));
  }
  v.save(n, { secreto, usuario, notas });
  ok(`Actualizado "${n}".`);
  if (generado) entregar(secreto, "Contraseña generada");
}

export async function eliminar(v: Vault, nombre: string): Promise<boolean> {
  const n = resolver(v, nombre);
  if (!(await confirmar(`¿Eliminar "${n}"? No se puede deshacer.`))) {
    console.log("Cancelado.");
    return false;
  }
  v.remove(n);
  ok(`Eliminado "${n}".`);
  return true;
}

export function generar(o: { largo?: number; simbolos?: boolean; copiar?: boolean }): void {
  const pw = generarPassword(o);
  if (o.copiar) entregar(pw, "Contraseña generada");
  else console.log(pw);
}

export async function exportar(v: Vault, archivo: string): Promise<void> {
  const destino = destinoExport(archivo);
  warn("El archivo exportado contendrá tus secretos SIN cifrar.");
  console.log(`  Se guardará en: ${c.bold(destino)}`);
  if (fs.existsSync(destino)) throw new Error(`Ya existe ese archivo. Elegí otro nombre.`);
  if (!(await confirmar("¿Continuar?"))) return void console.log("Cancelado.");
  fs.mkdirSync(path.dirname(destino), { recursive: true, mode: 0o700 });
  // flag "wx": no pisa un archivo existente.
  fs.writeFileSync(destino, JSON.stringify(v.exportAll(), null, 2), { mode: 0o600, flag: "wx" });
  ok(`Exportado: ${destino}`);
  console.log(c.dim("  Borralo cuando termines de usarlo."));
}

export function importar(v: Vault, archivo: string, o: { sobrescribir?: boolean } = {}): void {
  const origen = origenImport(archivo);
  if (!fs.existsSync(origen)) {
    throw new Error(
      `No encuentro el archivo: ${origen}\n  Si pusiste solo el nombre, se busca en la carpeta actual y en ${dirExports()}`
    );
  }
  console.log(`  Leyendo: ${c.bold(origen)}`);
  const raw: unknown = JSON.parse(fs.readFileSync(origen, "utf8"));
  if (!Array.isArray(raw)) throw new Error("El archivo no tiene el formato esperado (una lista de secretos).");
  const str = (x: unknown) => (typeof x === "string" && x ? x : undefined);
  let nuevos = 0, actualizados = 0, saltados = 0, invalidos = 0;
  v.batch(() => {
    for (const it of raw as Record<string, unknown>[]) {
      const nombre = str(it?.nombre)?.trim();
      const secreto = str(it?.secreto);
      if (!nombre || !secreto) {
        invalidos++;
        continue;
      }
      const existe = v.exists(nombre);
      if (existe && !o.sobrescribir) {
        saltados++;
        continue;
      }
      v.save(nombre, { secreto, usuario: str(it.usuario), notas: str(it.notas) });
      existe ? actualizados++ : nuevos++;
    }
  });
  ok(`Importados: ${nuevos} nuevos, ${actualizados} actualizados, ${saltados} omitidos (ya existían), ${invalidos} inválidos.`);
  warn("El archivo importado tiene secretos en texto plano: borralo.");
}

export async function backup(v: Vault, destino?: string): Promise<void> {
  const file = destinoBackup(destino) ?? path.join(dirBackups(), `vault-${stamp()}.db`);
  console.log(`  Se guardará en: ${c.bold(file)}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await v.backup(file);
  ok(`Backup creado: ${file}`);
  console.log(c.dim("  Sigue cifrado con tu contraseña maestra actual. Copialo también a un pendrive."));
}

export async function cambiarMaestra(v: Vault): Promise<void> {
  if (!v.checkPassword(await ask("Contraseña maestra actual: ", true))) {
    throw new Error("Contraseña actual incorrecta.");
  }
  const nueva = await pedirMaestraNueva();
  if (v.checkPassword(nueva)) throw new Error("La nueva contraseña es igual a la actual.");
  v.changePassword(nueva);
  ok("Contraseña maestra cambiada; todos los secretos fueron re-cifrados.");
  warn("Tus backups anteriores siguen usando la contraseña VIEJA. Hacé uno nuevo.");
}

export function info(v: Vault): void {
  const file = dbPath();
  const kb = fs.existsSync(file) ? (fs.statSync(file).size / 1024).toFixed(1) : "?";
  const ub = ultimoBackup();
  const fila = (k: string, val: string) => console.log(`${c.dim(padEnd(k, 15))}${val}`);
  fila("Bóveda", `${file}  ${c.dim(`(${kb} KB)`)}`);
  fila("Backups", dirBackups());
  fila("Exportaciones", dirExports());
  fila("Último backup", ub ? ub.toISOString().slice(0, 10) : c.yellow("nunca"));
  fila("Secretos", String(v.count()));
  fila("Cifrado", "AES-256-GCM · clave derivada con scrypt");
}
