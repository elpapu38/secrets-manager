import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const IV_LEN = 12;
const TAG_LEN = 16;

export const newSalt = (): Buffer => randomBytes(16);

// scrypt: derivación de clave resistente a fuerza bruta (usa memoria a propósito).
export function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, {
    N: 2 ** 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
}

// AES-256-GCM. Devuelve un solo Buffer: iv (12) | tag (16) | datos cifrados.
// `aad` se autentica (no se cifra): ata el dato a su nombre y evita que
// alguien con acceso al archivo intercambie filas entre sí.
export function encrypt(key: Buffer, plaintext: string, aad: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

// Lanza error si la clave es incorrecta o si los datos fueron alterados.
export function decrypt(key: Buffer, blob: Buffer, aad: string): string {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
