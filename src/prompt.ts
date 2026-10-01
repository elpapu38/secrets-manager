import readline from "node:readline";
import { Writable } from "node:stream";

// Pregunta por consola. Con hidden=true no muestra lo que se escribe.
export function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const out = new Writable({
      write(chunk, enc, cb) {
        if (!muted) process.stdout.write(chunk, enc);
        cb();
      },
    });
    const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
    rl.on("SIGINT", () => {
      rl.close();
      process.stdout.write("\n");
      process.exit(130);
    });
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
    muted = hidden; // el prompt ya se escribió; desde acá se silencia el eco
  });
}

export async function confirmar(msg: string): Promise<boolean> {
  return /^(s|si|sí|y|yes)$/i.test((await ask(`${msg} (s/N): `)).trim());
}

// Enter mantiene el valor actual; "-" lo borra.
export async function askDefault(label: string, actual?: string): Promise<string | undefined> {
  const a = (await ask(actual ? `${label} [${actual}]: ` : `${label}: `)).trim();
  if (a === "-") return undefined;
  return a || actual;
}

export const pausa = async (): Promise<void> => {
  await ask("\nEnter para continuar… ");
};
