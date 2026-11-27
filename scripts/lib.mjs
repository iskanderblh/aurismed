// Outils communs aux scripts en ligne de commande (sans dépendance).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

export function dataDir() {
  return path.resolve(process.env.AURISMED_DATA_DIR || path.join(process.cwd(), "data"));
}

export async function openDb() {
  const file = path.join(dataDir(), "aurismed.db");
  if (!fs.existsSync(file)) {
    console.error(`Base introuvable : ${file}\nLancez AurisMED une première fois, ou définissez AURISMED_DATA_DIR.`);
    process.exit(1);
  }
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file);
  db.exec("pragma foreign_keys = on; pragma busy_timeout = 5000;");
  return db;
}

// Une seule interface de saisie pour tout le script (sinon la première consomme toutes les lignes).
let rl = null;
let muted = false;
const lines = [];
const waiters = [];

function input() {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    const write = rl._writeToOutput?.bind(rl);
    if (write) rl._writeToOutput = (s) => (muted && !/[\r\n]/.test(s) ? rl.output.write("*".repeat(s.length)) : write(s));
    rl.on("line", (line) => (waiters.length ? waiters.shift()(line) : lines.push(line)));
    rl.on("close", () => waiters.splice(0).forEach((w) => w("")));
  }
  return rl;
}

/** Question au clavier ; hidden masque la saisie (mot de passe). */
export function ask(question, { hidden = false } = {}) {
  input();
  process.stdout.write(question);
  muted = hidden;
  return new Promise((resolve) => {
    const done = (line) => {
      muted = false;
      if (!process.stdin.isTTY) process.stdout.write("\n");
      resolve(line);
    };
    if (lines.length) done(lines.shift());
    else waiters.push(done);
  });
}

export function closeInput() {
  rl?.close();
}
