const useColor = !!process.stdout.isTTY && !process.env.NO_COLOR;
const w = (code: string) => (s: string): string => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  bold: w("1"),
  dim: w("90"),
  red: w("31"),
  green: w("32"),
  yellow: w("33"),
  cyan: w("36"),
  blue: w("94"),
};

export const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
export const padEnd = (s: string, n: number): string => s + " ".repeat(Math.max(0, n - strip(s).length));
export const acortar = (s: string, max: number): string => (s.length <= max ? s : "…" + s.slice(-(max - 1)));

// Ancho de trabajo: se adapta a la terminal (entre 60 y 100 columnas).
export const ancho = (): number => Math.min(Math.max(process.stdout.columns ?? 80, 60), 100);

export const ok = (m: string): void => console.log(`${c.green("✔")} ${m}`);
export const warn = (m: string): void => console.log(`${c.yellow("⚠")} ${m}`);
export const fail = (m: string): void => console.error(`${c.red("✖")} ${m}`);

// Borra pantalla Y el historial de desplazamiento (para no dejar secretos a la vista).
export function clearScreen(): void {
  if (process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
}

export function box(lines: string[], minInner = 0): string {
  const inner = Math.max(Math.max(...lines.map((l) => strip(l).length)) + 2, minInner);
  const top = c.cyan("╭" + "─".repeat(inner) + "╮");
  const bottom = c.cyan("╰" + "─".repeat(inner) + "╯");
  const body = lines.map((l) => c.cyan("│") + " " + padEnd(l, inner - 1) + c.cyan("│"));
  return [top, ...body, bottom].map((l) => "  " + l).join("\n");
}

export function cabecera(titulo: string, sub?: string): void {
  console.log(box([c.bold(titulo), ...(sub ? [c.dim(sub)] : [])], ancho() - 4));
  console.log();
}

export function opcionesMenu(items: [string, string, string?][]): void {
  const wl = Math.max(...items.map(([, l]) => strip(l).length)) + 3;
  for (const [k, label, desc] of items) {
    console.log(`  ${c.cyan(c.bold(`[${k}]`))}  ${padEnd(label, wl)}${desc ? c.dim(desc) : ""}`);
  }
}
