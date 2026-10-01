import { randomInt } from "node:crypto";

// Sin caracteres ambiguos (l, o, 0, 1, I, O) para poder leerlas/tipearlas sin errores.
const MINUS = "abcdefghijkmnpqrstuvwxyz";
const MAYUS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const NUMS = "23456789";
const SIMB = "!@#$%^&*-_=+?";

export interface GenOpts {
  largo?: number;
  simbolos?: boolean;
}

const pick = (s: string): string => s[randomInt(s.length)];

export function generarPassword({ largo = 20, simbolos = true }: GenOpts = {}): string {
  if (!Number.isInteger(largo) || largo < 8 || largo > 128) {
    throw new Error("El largo debe ser un número entre 8 y 128.");
  }
  const sets = [MINUS, MAYUS, NUMS, ...(simbolos ? [SIMB] : [])];
  const todo = sets.join("");
  const chars = sets.map(pick); // garantiza al menos uno de cada tipo
  while (chars.length < largo) chars.push(pick(todo));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); // Fisher-Yates con aleatoriedad criptográfica
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
