import { ancho, box, c } from "./ui";

// Tipografía "ANSI Shadow", 6 filas por letra.
const G: Record<string, string[]> = {
  S: ["███████╗", "██╔════╝", "███████╗", "╚════██║", "███████║", "╚══════╝"],
  E: ["███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"],
  C: [" ██████╗", "██╔════╝", "██║     ", "██║     ", "╚██████╗", " ╚═════╝"],
  R: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██║  ██║", "╚═╝  ╚═╝"],
  T: ["████████╗", "╚══██╔══╝", "   ██║   ", "   ██║   ", "   ██║   ", "   ╚═╝   "],
  M: ["███╗   ███╗", "████╗ ████║", "██╔████╔██║", "██║╚██╔╝██║", "██║ ╚═╝ ██║", "╚═╝     ╚═╝"],
  A: [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  N: ["███╗   ██╗", "████╗  ██║", "██╔██╗ ██║", "██║╚██╗██║", "██║ ╚████║", "╚═╝  ╚═══╝"],
  G: [" ██████╗ ", "██╔════╝ ", "██║  ███╗", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
};

export function render(palabra: string): string[] {
  const glifos = [...palabra].map((ch) => {
    const filas = G[ch];
    const w = Math.max(...filas.map((f) => f.length));
    return filas.map((f) => f.padEnd(w));
  });
  return Array.from({ length: 6 }, (_, i) => glifos.map((g) => g[i]).join(""));
}

export function mostrarBanner(): void {
  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;
  if (cols >= 66 && rows >= 32) {
    for (const l of render("SECRETS")) console.log("  " + c.cyan(l));
    for (const l of render("MANAGER")) console.log("  " + c.blue(l));
  } else {
    console.log(box([c.bold("S E C R E T S   M A N A G E R")], ancho() - 4));
  }
  console.log(c.dim("  Bóveda local cifrada · AES-256-GCM · sin nube"));
}
