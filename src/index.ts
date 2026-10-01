#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import * as A from "./acciones";
import { menuPrincipal } from "./menu";
import { conBoveda } from "./session";
import { fail } from "./ui";

const numero = (v: string): number => {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new InvalidArgumentError("Tiene que ser un número.");
  return n;
};

const program = new Command();
program
  .name("sm")
  .description("Gestor local de credenciales cifradas. Sin argumentos abre el menú interactivo.")
  .version("0.3.0", "-V, --version", "Muestra la versión")
  .helpOption("-h, --help", "Muestra la ayuda");

program
  .command("menu", { isDefault: true })
  .description("Abre el menú interactivo (por defecto)")
  .action(menuPrincipal);

program
  .command("guardar <nombre>")
  .description("Guarda (o actualiza) un secreto")
  .option("-u, --usuario <usuario>", "usuario o email asociado")
  .option("-n, --notas <notas>", "notas opcionales")
  .option("-g, --generar", "generar una contraseña aleatoria en vez de escribirla")
  .option("-l, --largo <n>", "largo de la contraseña generada (8-128)", numero)
  .option("--no-simbolos", "generar sin símbolos")
  .action((nombre: string, o: A.GuardarOpts) => conBoveda((v) => A.guardar(v, nombre, o)));

program
  .command("obtener <nombre>")
  .description("Muestra un secreto")
  .option("-s, --solo-secreto", "imprime únicamente el secreto (útil para pipes)")
  .option("-c, --copiar", "copia al portapapeles y lo borra a los 30 s")
  .action((nombre: string, o: { soloSecreto?: boolean; copiar?: boolean }) =>
    conBoveda((v) => A.obtener(v, nombre, o))
  );

program
  .command("listar")
  .description("Lista los secretos guardados")
  .action(() => conBoveda(A.listar));

program
  .command("buscar <texto>")
  .description("Busca en nombre, usuario y notas")
  .action((texto: string) => conBoveda((v) => A.buscar(v, texto)));

program
  .command("editar <nombre>")
  .description("Edita usuario, notas o secreto")
  .action((nombre: string) => conBoveda((v) => A.editar(v, nombre)));

program
  .command("eliminar <nombre>")
  .description("Elimina un secreto")
  .action((nombre: string) => conBoveda(async (v) => void (await A.eliminar(v, nombre))));

program
  .command("generar")
  .description("Genera una contraseña aleatoria (no necesita la bóveda)")
  .option("-l, --largo <n>", "largo (8-128)", numero, 20)
  .option("--no-simbolos", "sin símbolos")
  .option("-c, --copiar", "copiar al portapapeles en vez de mostrarla")
  .action((o) => A.generar(o));

program
  .command("exportar <archivo>")
  .description("Exporta todo a un JSON EN TEXTO PLANO (solo nombre → ~/.secrets-manager/exports/)")
  .action((archivo: string) => conBoveda((v) => A.exportar(v, archivo)));

program
  .command("importar <archivo>")
  .description("Importa desde un JSON exportado (solo nombre → busca en la carpeta actual y en exports/)")
  .option("--sobrescribir", "pisa los que ya existen (por defecto se omiten)")
  .action((archivo: string, o: { sobrescribir?: boolean }) => conBoveda((v) => A.importar(v, archivo, o)));

program
  .command("backup [archivo]")
  .description("Copia cifrada de la bóveda (por defecto en ~/.secrets-manager/backups/)")
  .action((archivo?: string) => conBoveda((v) => A.backup(v, archivo)));

program
  .command("cambiar-maestra")
  .description("Cambia la contraseña maestra y re-cifra todo")
  .action(() => conBoveda(A.cambiarMaestra));

program
  .command("info")
  .description("Ubicación y datos de la bóveda")
  .action(() => conBoveda(A.info));

program.parseAsync().catch((err: Error) => {
  fail(err.message);
  process.exit(1);
});
