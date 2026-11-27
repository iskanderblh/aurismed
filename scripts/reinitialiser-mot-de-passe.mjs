// Réinitialise le mot de passe d'un compte local (à lancer sur le poste qui héberge AurisMED).
// Même format de hachage que src/server/auth/password.ts (scrypt N=2^15, r=8, p=1).
import crypto from "node:crypto";
import { ask, closeInput, openDb } from "./lib.mjs";

const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hash(password) {
  const salt = crypto.randomBytes(16);
  const out = crypto.scryptSync(password, salt, 32, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), out.toString("base64url")].join("$");
}

const db = await openDb();
const users = db.prepare("select email from users order by created_at").all();
if (!users.length) {
  console.log("Aucun compte : ouvrez AurisMED dans le navigateur pour créer le premier compte.");
  closeInput();
  process.exit(0);
}
console.log("Comptes existants :", users.map((u) => u.email).join(", "));
const email = (await ask("Adresse e-mail du compte : ")).trim().toLowerCase();
const user = db.prepare("select id from users where email = ?").get(email);
if (!user) {
  console.error("Aucun compte avec cette adresse.");
  closeInput();
  process.exit(1);
}
const password = await ask("Nouveau mot de passe (12 caractères minimum) : ", { hidden: true });
if (password.length < 12) {
  console.error("Mot de passe trop court : 12 caractères minimum.");
  closeInput();
  process.exit(1);
}
const confirm = await ask("Confirmation : ", { hidden: true });
if (confirm !== password) {
  console.error("Les deux saisies ne correspondent pas.");
  closeInput();
  process.exit(1);
}
const now = new Date().toISOString();
db.prepare("update users set password_hash = ?, updated_at = ?, disabled_at = null where id = ?").run(hash(password), now, user.id);
db.prepare("delete from sessions where user_id = ?").run(user.id);
db.prepare("insert into audit_logs (user_id, action, metadata, created_at) values (?, 'auth.password_reset_local', '{}', ?)").run(user.id, now);
console.log("Mot de passe modifié. Les sessions ouvertes sur ce compte ont été fermées.");
closeInput();
