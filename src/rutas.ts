import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dbPath } from "./db";

export const dirBase = (): string => path.dirname(dbPath());
export const dirBackups = (): string => path.join(dirBase(), "backups");
export const dirExports = (): string => path.join(dirBase(), "exports");

const soloNombre = (a: string): boolean => path.basename(a) === a;

// Solo un nombre → va a la carpeta de exportaciones (fuera del proyecto, así no se sube a Git).
// Con carpeta (ej: C:\Users\yo\Desktop\claves.json) → se respeta.
export function destinoExport(archivo: string): string {
  const a = archivo.trim();
  return soloNombre(a) ? path.join(dirExports(), a) : path.resolve(a);
}

export function destinoBackup(archivo?: string): string | null {
  const a = archivo?.trim();
  if (!a) return null;
  return soloNombre(a) ? path.join(dirBackups(), a) : path.resolve(a);
}

// Para importar: si es solo un nombre y no está en la carpeta actual, se busca en exportaciones.
export function origenImport(archivo: string): string {
  const a = archivo.trim();
  if (soloNombre(a) && !fs.existsSync(a)) {
    const alt = path.join(dirExports(), a);
    if (fs.existsSync(alt)) return alt;
  }
  return path.resolve(a);
}

export function ultimoBackup(): Date | null {
  try {
    const dir = dirBackups();
    const tiempos = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".db"))
      .map((f) => fs.statSync(path.join(dir, f)).mtimeMs);
    return tiempos.length ? new Date(Math.max(...tiempos)) : null;
  } catch {
    return null;
  }
}

export function abrirCarpeta(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const cmd = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
  const p = spawn(cmd, [dir], { detached: true, stdio: "ignore" });
  p.on("error", () => {}); // si el comando no existe, no rompe el programa
  p.unref();
}
