import { spawnSync } from "node:child_process";

export const SEGUNDOS_PORTAPAPELES = 30;

function run(cmd: string, args: string[], input?: string): boolean {
  const r = spawnSync(cmd, args, { input, stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
  return !r.error && r.status === 0;
}

export function copiar(texto: string): boolean {
  switch (process.platform) {
    case "win32":
      // El secreto viaja por stdin (no por argumentos) para que no aparezca en la lista de procesos.
      return (
        run(
          "powershell",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[Console]::InputEncoding=[Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
          ],
          texto
        ) || run("clip", [], texto)
      );
    case "darwin":
      return run("pbcopy", [], texto);
    default:
      return (
        run("wl-copy", [], texto) ||
        run("xclip", ["-selection", "clipboard"], texto) ||
        run("xsel", ["--clipboard", "--input"], texto)
      );
  }
}

export function limpiar(): void {
  if (process.platform === "win32") run("cmd", ["/c", "echo off | clip"]);
  else copiar("");
}

let timer: NodeJS.Timeout | null = null;
let hooked = false;

// Copia y programa el borrado automático. También se borra al salir del programa.
export function copiarTemporal(texto: string, segundos = SEGUNDOS_PORTAPAPELES): boolean {
  if (!copiar(texto)) return false;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    limpiar();
    timer = null;
  }, segundos * 1000);
  if (!hooked) {
    hooked = true;
    process.on("exit", () => {
      if (timer) limpiar();
    });
    process.on("SIGINT", () => process.exit(130)); // dispara el 'exit' de arriba
  }
  return true;
}
