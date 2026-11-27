import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

// Paramètres scrypt (N=2^15, r=8, p=1) : ~50 ms par vérification, 32 Mo de mémoire.
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Format : scrypt$N$r$p$sel$empreinte (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 32, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return crypto.timingSafeEqual(actual, expected);
}
