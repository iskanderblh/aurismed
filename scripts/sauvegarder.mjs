// Sauvegarde de la base et des fichiers chiffrés dans un dossier daté.
// La clé de chiffrement n'est PAS copiée avec les données : sauvegardez-la à part
// (clé USB rangée ailleurs), sinon une sauvegarde volée serait lisible.
import fs from "node:fs";
import path from "node:path";
import { dataDir, openDb } from "./lib.mjs";

const target = path.resolve(process.argv[2] || process.env.AURISMED_BACKUP_DIR || path.join(process.cwd(), "sauvegardes"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = path.join(target, `aurismed-${stamp}`);
fs.mkdirSync(dest, { recursive: true });

const db = await openDb();
// Copie cohérente même si l'application est ouverte.
db.exec(`vacuum into '${path.join(dest, "aurismed.db").replace(/'/g, "''")}'`);
db.close();

const files = path.join(dataDir(), "fichiers");
if (fs.existsSync(files)) fs.cpSync(files, path.join(dest, "fichiers"), { recursive: true });

console.log(`Sauvegarde créée : ${dest}`);
console.log("Rappel : la clé de chiffrement (data\\cle\\aurismed.key) n'est pas incluse. Gardez-en une copie séparée.");
